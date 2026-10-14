import { Provider } from '@angular/core';
import { Observable, map, of, throwError } from 'rxjs';
import { RegisteringUser } from '../payments/data/payments-writer';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { ExecuteOutcome, Refund, RefundMethod, RefundsSource, RefundsWriter } from '../refunds/data/refunds-ports';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 016- DD-1, DD-2, DD-3, G-OPS, G-USR): refunds live on the reservations of the one store of HU-COM-007 (plan D-02).
type Facts = NonNullable<Reservation['refund']>;
const refuse = (status: number, code: string) => throwError(() => ({ status, code }));
/** RN-EJE-002, G12: these origins open no 24-hour choice and refund 100 % of the validated values (AC-RF.5). */
const FULL: ReadonlySet<Facts['origin']> = new Set(['NOT_ATTRIBUTABLE', 'RESCHEDULING']);
const HOUR = 3_600_000, AUTOMATIC = 'Determinación automática', DEFAULT_REASON = 'Sin decisión se aplica la devolución del 100 %.';
const colombian = (ms: number) => `${new Date(ms - 5 * HOUR).toISOString().slice(0, 19)}-05:00`;
const deadlineOf = (f: Facts) => Date.parse(f.recognizedAt) + 24 * HOUR;
/** DP-RF3 (demo): business days are Monday to Friday, without holidays. */
function businessDaysAfter(from: number, days: number): number {
  let at = from;
  while (days > 0) { at += 24 * HOUR; const day = new Date(at - 5 * HOUR).getUTCDay(); if (day !== 0 && day !== 6) days -= 1; }
  return at;
}
/** HU-COM-017 (once merged): a treatment kept as a credit balance is no longer a refund. */
const keptAsCreditBalance = (store: ReservationsSource, id: string) =>
  ((store as { creditBalances?: readonly { reservationId: string; origin: string }[] }).creditBalances ?? []).some((l) => l.reservationId === id && l.origin === 'TRATAMIENTO');

/** The refund facts of a reservation (its own, or the amount a cancellation left), with the 24-hour default applied as job 2 would (AC-RF.6); null when nothing is refundable. */
export function refundFactsOf(r: Reservation, now: number): Facts | null {
  const d = r.financialDecision;
  const f: Facts | null = r.refund ?? (d?.refundableCents ? { origin: d.kind === 'CUSTOMER_CANCELLATION' ? 'CUSTOMER_CANCELLATION' : 'NON_PAYMENT', reason: r.cancellation?.cause ?? '',
    amountCents: d.refundableCents, recognizedAt: d.recognizedAt } : null);
  if (!f || f.decision || f.authorization || FULL.has(f.origin) || now < deadlineOf(f)) return f;
  const act = { by: AUTOMATIC, at: colombian(deadlineOf(f)) };
  return { ...f, decision: act, authorization: { ...act, reason: DEFAULT_REASON } };
}

/** As the service will answer it: amount, state, person, date, counter and marks resolved; the view formats only. */
export function resolveRefund(r: Reservation, f: Facts, now: number): Refund {
  const { authorization: a, execution: e } = f;
  const state = e ? 'EJECUTADA' : a ? 'AUTORIZADA' : f.decision || FULL.has(f.origin) ? 'PENDIENTE_DE_AUTORIZACION' : 'PENDIENTE_DE_DECISION';
  return { id: r.id, customer: r.leadCustomerName, reason: f.reason, amountCents: FULL.has(f.origin) ? r.validatedCents ?? f.amountCents : f.amountCents, state,
    decisionReason: a?.reason ?? null, owner: e?.by ?? a?.by ?? null, date: e?.at ?? f.recognizedAt, method: (e?.method as RefundMethod) ?? null, cashMovement: e?.cashMovement ?? null,
    remainingMinutes: state === 'PENDIENTE_DE_DECISION' ? Math.floor((deadlineOf(f) - now) / 60_000) : null, defaulted: a?.by === AUTOMATIC,
    overdue: state === 'AUTORIZADA' && now >= businessDaysAfter(Date.parse(a!.at), 5) };
}

/** Lists the refunds over the clock; a default that applies is recorded once in the store (plan D-06). */
export class DemoRefundsSource extends RefundsSource {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock) { super(); }
  override list(): Observable<readonly Refund[]> {
    const now = Date.parse(this.clock.now());
    return this.store.list().pipe(map((all) => all.flatMap((r) => {
      const f = keptAsCreditBalance(this.store, r.id) ? null : refundFactsOf(r, now);
      if (f?.authorization && !r.refund?.authorization) this.store.items = this.store.items.map((x) => (x.id === r.id ? { ...x, refund: f } : x));
      return f ? [resolveRefund(r, f, now)] : [];
    })));
  }
}

/** DD-2: execute is one operation that answers the saga's final state; the seeded cashFails end with the cash step failed (AC-RF.4). */
export class DemoRefundsWriter extends RefundsWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly can: PortalCapabilities, private readonly clock: Clock,
    private readonly user: RegisteringUser, private readonly cashFails: ReadonlySet<string>, private readonly answered = new Map<string, Refund | ExecuteOutcome>()) { super(); }

  override decideFullRefund(id: string, key: string): Observable<Refund> {
    const known = this.answered.get(key) as Refund | undefined, c = this.current(id);
    if (known) return of(known);
    if (!this.can.canAuthorizeRefund()) return refuse(403, 'refund-decision-forbidden');
    if (c?.refund.state !== 'PENDIENTE_DE_DECISION') return refuse(409, 'refund-not-decidable');
    return of(this.keep(key, this.save(c.r, { ...c.f, decision: { by: this.user.label(), at: this.clock.now() } })));
  }

  override authorize(id: string, reason: string, key: string): Observable<Refund> {
    const known = this.answered.get(key) as Refund | undefined, c = this.current(id);
    if (known) return of(known);
    if (!this.can.canAuthorizeRefund()) return refuse(403, 'refund-authorization-forbidden');
    if (!reason.trim() || c?.refund.state !== 'PENDIENTE_DE_AUTORIZACION') return refuse(409, 'refund-not-authorizable');
    return of(this.keep(key, this.save(c.r, { ...c.f, authorization: { by: this.user.label(), at: this.clock.now(), reason: reason.trim() } })));
  }

  override executeRefund(id: string, method: RefundMethod, key: string): Observable<ExecuteOutcome> {
    const known = this.answered.get(key) as ExecuteOutcome | undefined, c = this.current(id);
    if (known) return of(known);
    if (!this.can.canExecuteRefund()) return refuse(403, 'refund-execution-forbidden');
    if (c?.refund.state !== 'AUTORIZADA') return refuse(409, 'refund-not-authorized');
    if (this.cashFails.has(id)) return of({ kind: 'cash-failed', refund: c.refund });
    const execution = { by: this.user.label(), at: this.clock.now(), method, cashMovement: `MC-${id.replace('RES-', '')}` };
    return of(this.keep(key, { kind: 'executed', refund: this.save(c.r, { ...c.f, execution }) }));
  }

  private current(id: string) {
    const r = this.store.items.find((x) => x.id === id), now = Date.parse(this.clock.now()), f = r && !keptAsCreditBalance(this.store, id) ? refundFactsOf(r, now) : null;
    return r && f ? { r, f, refund: resolveRefund(r, f, now) } : null;
  }
  private save(r: Reservation, refund: Facts): Refund {
    const next = { ...r, refund };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    return resolveRefund(next, refund, Date.parse(this.clock.now()));
  }
  private keep<T extends Refund | ExecuteOutcome>(key: string, answer: T): T { this.answered.set(key, answer); return answer; }
}

/** Invented refunds (spec section 6) on cancelled reservations, with codes no other story seeds; RES-1818 ends its execution with the cash step failed (AC-RF.4). */
const at = (day: number, hour: string) => `2026-10-${String(day).padStart(2, '0')}T${hour}:00-05:00`;
const ADMIN = 'Administrador del tenant (demo)', BY_ADMIN = (day: number, hour: string) => ({ by: ADMIN, at: at(day, hour) });
const cancelled = (id: string, leadCustomerName: string, tourName: string, cents: number, refund: Facts, over: Partial<Reservation> = {}): Reservation => ({ id, leadCustomerName, tourName,
  departureDate: '2026-11-21', conditions: 'Cancelación según la política del tour (texto de demostración).', people: 2, validatedCents: cents, balanceCents: 0, status: 'CANCELADA',
  quote: { services: [{ name: 'Guianza (demo)', cents }], transportCents: 0, projectedCents: cents, discounts: [], discountCents: 0, finalCents: cents }, financialStatus: 'PARCIAL',
  seatHeld: false, cancellation: { cause: refund.reason, by: ADMIN, at: refund.recognizedAt }, refund: { ...refund, amountCents: cents }, ...over });
const SEEDS: readonly Reservation[] = [
  cancelled('RES-1819', 'Valentina Ruiz (demo)', 'Desierto de la Tatacoa al atardecer', 30_000_000, { origin: 'CUSTOMER_CANCELLATION', reason: 'El cliente desiste del viaje (demo)', amountCents: 0,
    recognizedAt: at(12, '15:00'), decision: BY_ADMIN(12, '16:00') }, { financialDecision: { kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 30_000_000, penaltyAmountCents: 0,
    refundableCents: 30_000_000, recognizedAt: at(12, '15:00'), outcome: null } }),
  cancelled('RES-1818', 'Diego Mora (demo)', 'Canotaje en el río Suaza', 120_000_000, { origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 0, recognizedAt: at(9, '10:00'),
    decision: BY_ADMIN(9, '11:00'), authorization: { ...BY_ADMIN(9, '11:05'), reason: 'Devolución del 100 % decidida (demo)' } }),
  cancelled('RES-1817', 'Paula Méndez (demo)', 'Caminata al Nevado del Huila', 85_000_000, { origin: 'NOT_ATTRIBUTABLE', reason: 'Cancelación no atribuible al cliente (demo)', amountCents: 0, recognizedAt: at(12, '08:00') }),
  cancelled('RES-1816', 'Andrés Pinto (demo)', 'Ruta del café en Pitalito', 41_800_000, { origin: 'RESCHEDULING', reason: 'Cancelada por rechazo o vencimiento de reprogramación', amountCents: 0, recognizedAt: at(11, '09:00') }),
  cancelled('RES-1815', 'Sergio Lara (demo)', 'Desierto de la Tatacoa al atardecer', 20_000_000, { origin: 'CUSTOMER_CANCELLATION', reason: 'Viaje aplazado por el cliente (demo)', amountCents: 0,
    recognizedAt: at(5, '10:00'), decision: BY_ADMIN(5, '12:00'), authorization: { ...BY_ADMIN(6, '09:00'), reason: 'Devolución solicitada dentro del plazo (demo)' },
    execution: { by: 'Colaborador operativo (demo)', at: at(7, '10:15'), method: 'BANK_TRANSFER', cashMovement: 'MC-1815' } }),
  // AC-RF.6, AC-RF.7: the two non-payment treatments HU-COM-017 also seeds (18 h 42 min left; past the 24 hours, defaulted with its alert), and one Vencida.
  cancelled('RES-1821', 'Valentina Muñoz (demo)', 'Ruta del café en Pitalito', 120_000_000, { origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 0, recognizedAt: at(13, '04:12') }),
  cancelled('RES-1820', 'Diego Castro (demo)', 'Ruta del café en Pitalito', 120_000_000, { origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 0, recognizedAt: at(12, '08:00') }),
  cancelled('RES-1814', 'Laura Vargas (demo)', 'Canotaje en el río Suaza', 26_000_000, { origin: 'CUSTOMER_CANCELLATION', reason: 'El cliente cancela por motivos personales (demo)', amountCents: 0,
    recognizedAt: at(2, '09:00'), decision: BY_ADMIN(2, '11:00'), authorization: { ...BY_ADMIN(5, '10:00'), reason: 'Devolución solicitada dentro del plazo (demo)' } }),
];

/** Over the stores of reservationDemoProviders() and the clock of reservationChangesDemoProviders(); each seed once per page (another story may seed the same code first). */
export function refundsDemoProviders(): Provider[] {
  const answered = new Map<string, Refund | ExecuteOutcome>();
  const seeded = (s: DemoReservationsStore) => { s.items = [...s.items, ...SEEDS.filter((x) => !s.items.some((r) => r.id === x.id))]; return s; };
  return [
    { provide: RefundsSource, useFactory: (s: DemoReservationsStore, k: Clock) => new DemoRefundsSource(seeded(s), k), deps: [ReservationsSource, Clock] },
    { provide: RefundsWriter, deps: [ReservationsSource, PortalCapabilities, Clock, RegisteringUser],
      useFactory: (s: DemoReservationsStore, c: PortalCapabilities, k: Clock, u: RegisteringUser) => new DemoRefundsWriter(seeded(s), c, k, u, new Set(['RES-1818']), answered) },
  ];
}

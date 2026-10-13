import { Provider } from '@angular/core';
import { Observable, map, of, throwError } from 'rxjs';
import { RegisteringUser } from '../payments/data/payments-writer';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { ExecuteOutcome, Refund, RefundMethod, RefundsSource, RefundsWriter } from '../refunds/data/refunds-ports';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 016- DD-1, DD-2, G-OPS, G-USR): refunds live on the reservations of the one store of HU-COM-007 (plan D-02).
type Facts = NonNullable<Reservation['refund']>;
const refuse = (status: number, code: string) => throwError(() => ({ status, code }));
/** RN-EJE-002, G12: these origins open no 24-hour choice and refund 100 % of the validated values (AC-RF.5). */
const FULL: ReadonlySet<Facts['origin']> = new Set(['NOT_ATTRIBUTABLE', 'RESCHEDULING']);

/** The refund facts of a reservation: its own, or the amount a 013- cancellation left (T3); null when nothing is refundable. */
export function refundFactsOf(r: Reservation): Facts | null {
  const d = r.financialDecision;
  if (r.refund || !d?.refundableCents) return r.refund ?? null;
  return { origin: d.kind === 'CUSTOMER_CANCELLATION' ? 'CUSTOMER_CANCELLATION' : 'NON_PAYMENT', reason: r.cancellation?.cause ?? '', amountCents: d.refundableCents, recognizedAt: d.recognizedAt };
}

/** As the service will answer it: amount, state, person and date resolved; the view formats only. */
export function resolveRefund(r: Reservation, f: Facts): Refund {
  const { authorization: a, execution: e } = f;
  const state = e ? 'EJECUTADA' : a ? 'AUTORIZADA' : f.decision || FULL.has(f.origin) ? 'PENDIENTE_DE_AUTORIZACION' : 'PENDIENTE_DE_DECISION';
  return { id: r.id, customer: r.leadCustomerName, reason: f.reason, amountCents: FULL.has(f.origin) ? r.validatedCents ?? f.amountCents : f.amountCents, state,
    decisionReason: a?.reason ?? null, owner: e?.by ?? a?.by ?? null, date: e?.at ?? f.recognizedAt, method: (e?.method as RefundMethod) ?? null, cashMovement: e?.cashMovement ?? null };
}

export class DemoRefundsSource extends RefundsSource {
  constructor(private readonly store: ReservationsSource) { super(); }
  override list(): Observable<readonly Refund[]> {
    return this.store.list().pipe(map((all) => all.flatMap((r) => { const f = refundFactsOf(r); return f ? [resolveRefund(r, f)] : []; })));
  }
}

/** DD-2: execute is one operation that answers the saga's final state; the seeded cashFails end with the cash step failed (AC-RF.4). */
export class DemoRefundsWriter extends RefundsWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly can: PortalCapabilities, private readonly clock: Clock,
    private readonly user: RegisteringUser, private readonly cashFails: ReadonlySet<string>, private readonly answered = new Map<string, Refund | ExecuteOutcome>()) { super(); }

  override authorize(id: string, reason: string, key: string): Observable<Refund> {
    const known = this.answered.get(key) as Refund | undefined;
    if (known) return of(known);
    if (!this.can.canAuthorizeRefund()) return refuse(403, 'refund-authorization-forbidden');
    const r = this.store.items.find((x) => x.id === id), f = r && refundFactsOf(r);
    if (!r || !f || !reason.trim() || resolveRefund(r, f).state !== 'PENDIENTE_DE_AUTORIZACION') return refuse(409, 'refund-not-authorizable');
    return of(this.keep(key, this.save(r, { ...f, authorization: { by: this.user.label(), at: this.clock.now(), reason: reason.trim() } })));
  }

  override executeRefund(id: string, method: RefundMethod, key: string): Observable<ExecuteOutcome> {
    const known = this.answered.get(key) as ExecuteOutcome | undefined;
    if (known) return of(known);
    if (!this.can.canExecuteRefund()) return refuse(403, 'refund-execution-forbidden');
    const r = this.store.items.find((x) => x.id === id), f = r && refundFactsOf(r);
    if (!r || !f || resolveRefund(r, f).state !== 'AUTORIZADA') return refuse(409, 'refund-not-authorized');
    if (this.cashFails.has(id)) return of({ kind: 'cash-failed', refund: resolveRefund(r, f) });
    const execution = { by: this.user.label(), at: this.clock.now(), method, cashMovement: `MC-${id.replace('RES-', '')}` };
    return of(this.keep(key, { kind: 'executed', refund: this.save(r, { ...f, execution }) }));
  }

  private save(r: Reservation, refund: Facts): Refund {
    const next = { ...r, refund };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    return resolveRefund(next, refund);
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
];

/** Over the stores of reservationDemoProviders() and the clock of reservationChangesDemoProviders(); each seed once per page (another story may seed the same code first). */
export function refundsDemoProviders(): Provider[] {
  const answered = new Map<string, Refund | ExecuteOutcome>();
  const seeded = (s: DemoReservationsStore) => { s.items = [...s.items, ...SEEDS.filter((x) => !s.items.some((r) => r.id === x.id))]; return s; };
  return [
    { provide: RefundsSource, useFactory: (s: DemoReservationsStore) => new DemoRefundsSource(seeded(s)), deps: [ReservationsSource] },
    { provide: RefundsWriter, deps: [ReservationsSource, PortalCapabilities, Clock, RegisteringUser],
      useFactory: (s: DemoReservationsStore, c: PortalCapabilities, k: Clock, u: RegisteringUser) => new DemoRefundsWriter(seeded(s), c, k, u, new Set(['RES-1818']), answered) },
  ];
}

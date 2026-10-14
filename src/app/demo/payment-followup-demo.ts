import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { RegisteringUser } from '../payments/data/payments-writer';
import { ExtendDeadlineCommand, PaymentDeadline, PaymentDeadlineExtender, PaymentDeadlineReader, PaymentFollowupsWriter, PendingPaymentsSource, RegisterFollowupCommand } from '../payments/data/payment-followup-ports';
import { PAYMENT_FOLLOWUP_TEXT } from '../payments/payment-followup-copy';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { Reservation } from '../reservations/model/reservation';
import { Clock } from '../shared/clock';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 011- DD-1, DP-PP1, G-OPS): deadlines and follow-ups live on the reservations of the one store of HU-COM-007 (plan D-02).
const HOUR = 60 * 60 * 1000;
/** DP-PP1 NO DEFINIDO: the demo initial wait is 72 hours. */
const INITIAL_WAIT = 72 * HOUR;
/** RES-1842 within its departure; RES-1841 with the single extension of AC3 already granted (T-04; no control grants it, DP-PP6). */
const SEEDED: Readonly<Record<string, Reservation['deadline']>> = {
  'RES-1842': { dueAt: '2026-10-16T09:00:00-05:00' },
  'RES-1841': { dueAt: '2026-10-15T09:00:00-05:00', extendedUntil: '2026-10-18T09:00:00-05:00' },
};
/** Colombian time, as the screens read it. */
const bogota = (ms: number) => `${new Date(ms - 5 * HOUR).toISOString().slice(0, 19)}-05:00`;
/** G-OPS: the demo departure starts at 00:00 of its date, Colombian time (as payments-demo.ts). */
const startOf = (r: Reservation) => `${r.departureDate}T00:00:00-05:00`;
/** RN-PP3: a validated payment, cash received or a proof En validación counts as payment; a rejected proof does not. */
const counted = (r: Reservation) => (r.payments ?? []).some((p) => p.proofStatus !== 'RECHAZADO');
const refuse = (status: number, userMessage: string) => throwError(() => ({ status, userMessage }));
/** RN-RES-006: the demo parameter of the extension, 24 hours by default. */
const EXTENSION_HOURS = 24;
const deadlineFixed = (r: Reservation, now: number) => r.deadline ?? SEEDED[r.id] ?? { dueAt: bogota(now + INITIAL_WAIT) };

/** DP-PP5 conservative reading: only Pendiente de pago, with a balance and nothing that counts as payment. */
export class DemoPendingPayments extends PendingPaymentsSource {
  constructor(private readonly store: DemoReservationsStore) { super(); }
  override list(): Observable<readonly Reservation[]> {
    return of(this.store.items.filter((r) => r.status === 'PENDIENTE_DE_PAGO' && r.balanceCents > 0 && !counted(r)));
  }
}

/** D-04: the lower of the (extended) deadline and the departure start. The store has no creation time, so a reservation without a
 * deadline gets the initial wait from the first reading, as the service would fix it at creation. */
export class DemoPaymentDeadlines extends PaymentDeadlineReader {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock) { super(); }
  override deadlineOf(id: string): Observable<PaymentDeadline | null> {
    const r = this.store.items.find((x) => x.id === id);
    if (!r) return of(null);
    const deadline = deadlineFixed(r, this.clock.now());
    if (!r.deadline) this.store.items = this.store.items.map((x) => (x.id === id ? { ...x, deadline } : x));
    const limit = deadline.extendedUntil ?? deadline.dueAt, departureStartsAt = startOf(r);
    return of({ dueAt: Date.parse(limit) <= Date.parse(departureStartsAt) ? limit : departureStartsAt, departureStartsAt });
  }
}

/** RN-PP4: appends one follow-up per key; the deadline, the status and the balance stay as they were. */
export class DemoPaymentFollowupsWriter extends PaymentFollowupsWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly capabilities: PortalCapabilities, private readonly user: RegisteringUser,
    private readonly clock: Clock, private readonly answered: Map<string, Reservation>) { super(); }
  override register(c: RegisterFollowupCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key), r = this.store.items.find((x) => x.id === c.reservationId), note = c.note.trim();
    if (known) return of(known);
    if (!this.capabilities.canFollowUp()) return refuse(403, 'No tienes permiso para registrar seguimientos de pago.');
    if (!r) return refuse(409, PAYMENT_FOLLOWUP_TEXT.notFound);
    if (r.balanceCents === 0 || r.status === 'CANCELADA') return refuse(409, PAYMENT_FOLLOWUP_TEXT.settled);
    if (!note) return refuse(409, PAYMENT_FOLLOWUP_TEXT.noteRequired);
    const next: Reservation = { ...r, followups: [...(r.followups ?? []), { note, actorLabel: this.user.label(), contactedAt: bogota(this.clock.now()) }] };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(key, next);
    return of(next);
  }
}

/** E15: one extension per reservation, before the deadline, up to the parameter; it moves the deadline by the hours granted and records who and when. */
export class DemoPaymentDeadlineExtender extends PaymentDeadlineExtender {
  constructor(private readonly store: DemoReservationsStore, private readonly capabilities: PortalCapabilities, private readonly user: RegisteringUser,
    private readonly clock: Clock, private readonly answered: Map<string, Reservation>) { super(); }
  override extend(c: ExtendDeadlineCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key), r = this.store.items.find((x) => x.id === c.reservationId), now = this.clock.now(), hours = Math.round(c.hours);
    if (known) return of(known);
    if (!this.capabilities.canFollowUp()) return refuse(403, 'No tienes permiso para conceder ampliaciones del plazo.');
    if (!r) return refuse(409, PAYMENT_FOLLOWUP_TEXT.notFound);
    const deadline = deadlineFixed(r, now);
    if (r.status !== 'PENDIENTE_DE_PAGO') return refuse(409, 'Solo una reserva Pendiente de pago admite ampliación del plazo.');
    if (deadline.extendedUntil) return refuse(409, 'El plazo ya tuvo su única ampliación.');
    if (Date.parse(deadline.dueAt) <= now) return refuse(409, 'El plazo ya venció: la ampliación debe concederse antes del vencimiento.');
    if (!(hours >= 1)) return refuse(409, 'Indica la duración de la ampliación en horas (mínimo 1).');
    if (hours > EXTENSION_HOURS) return refuse(409, `La ampliación no puede superar ${EXTENSION_HOURS} h (parámetro de pago del tenant).`);
    const next: Reservation = { ...r, deadline: { ...deadline, extendedUntil: bogota(Date.parse(deadline.dueAt) + hours * HOUR),
      extension: { hours, actorLabel: this.user.label(), grantedAt: bogota(now) } } };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(key, next);
    return of(next);
  }
}

/** Registered in sources.demo.ts after proofReviewDemoProviders() (its Clock), over the same store; the answered keys belong to the page. */
export function paymentFollowupDemoProviders(): Provider[] {
  const answered = new Map<string, Reservation>(), extended = new Map<string, Reservation>();
  return [
    { provide: PendingPaymentsSource, useFactory: (s: ReservationsSource) => new DemoPendingPayments(s as DemoReservationsStore), deps: [ReservationsSource] },
    { provide: PaymentDeadlineReader, useFactory: (s: ReservationsSource, c: Clock) => new DemoPaymentDeadlines(s as DemoReservationsStore, c), deps: [ReservationsSource, Clock] },
    { provide: PaymentFollowupsWriter, useFactory: (s: ReservationsSource, k: PortalCapabilities, u: RegisteringUser, c: Clock) =>
      new DemoPaymentFollowupsWriter(s as DemoReservationsStore, k, u, c, answered), deps: [ReservationsSource, PortalCapabilities, RegisteringUser, Clock] },
    { provide: PaymentDeadlineExtender, useFactory: (s: ReservationsSource, k: PortalCapabilities, u: RegisteringUser, c: Clock) =>
      new DemoPaymentDeadlineExtender(s as DemoReservationsStore, k, u, c, extended), deps: [ReservationsSource, PortalCapabilities, RegisteringUser, Clock] },
  ];
}

import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { RegisteringUser } from '../payments/data/payments-writer';
import { DecideProofCommand, PendingProofs, PendingProofsSource, ProofReviewWriter } from '../payments/data/proof-review-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { Reservation } from '../reservations/model/reservation';
import { Clock } from '../shared/clock';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { demoNow } from './demo-fixtures';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 010- DD-PV1, DD-PV3, G-PERM): decisions are written on the payment lines of the one reservations store (plan D-02).
const DAY = 24 * 60 * 60 * 1000;
const refuse = (status: number, userMessage: string) => throwError(() => ({ status, userMessage }));
/** DP-PV1 NO DEFINIDO: the demo minimum partial is one third of the final value ($100.000 of $300.000). DP-PV2: below it, Parcial. */
export const minimumPartial = (r: Reservation) => Math.ceil(r.quote.finalCents / 3);
export const situation = (r: Reservation, validated: number, balance: number): Reservation['financialStatus'] =>
  balance === 0 ? 'PAGO_COMPLETO' : r.status === 'CONFIRMADA' && r.paymentType === 'PARTIAL' ? 'ABONO_RECIBIDO' : validated > 0 ? 'PARCIAL' : 'SIN_PAGO';

/** DD-PV3: the demo clock, ?demoNow on the area address (e2e README 2.3). */
export class DemoClock extends Clock { override now(): number { return demoNow(); } }

/** RN-RES-006C: a proof 24 running hours En validación is marked; the mark changes nothing (job 2 in production). */
export class DemoPendingProofs extends PendingProofsSource {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock) { super(); }
  override list(): Observable<PendingProofs> {
    const now = this.clock.now(), rows = this.store.items.flatMap((reservation) => (reservation.payments ?? []).filter((p) => p.proofStatus === 'EN_VALIDACION')
      .map((payment) => ({ reservation, payment, overdue: !!payment.presentedAt && now - Date.parse(payment.presentedAt) >= DAY })));
    return of({ rows, overdueCount: rows.filter((row) => row.overdue).length });
  }
}

/** D-04, D-05: permission first; an approval applies up to the balance and confirms at the threshold; a rejection changes only its line. */
export class DemoProofReviewWriter extends ProofReviewWriter {
  /** RN-PV7: the excess handed to the store; the credit balance it becomes is HU-COM-017's (DP-CB5, nothing drawn). */
  readonly handedExcess: { reservationId: string; amountCents: number }[] = [];
  constructor(private readonly store: DemoReservationsStore, private readonly capabilities: PortalCapabilities, private readonly user: RegisteringUser,
    private readonly clock: Clock, private readonly answered: Map<string, Reservation>) { super(); }

  override decide(c: DecideProofCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key), r = this.store.items.find((x) => x.id === c.reservationId), p = r?.payments?.find((x) => x.id === c.paymentId);
    if (known) return of(known);
    if (!this.capabilities.canDecideProof()) return refuse(403, 'No tienes permiso para validar soportes de pago.');
    if (!r || !p || p.proofStatus !== 'EN_VALIDACION') return refuse(409, p ? 'Este soporte ya fue decidido. No se puede volver a decidir sobre el mismo intento.' : 'No se encontró el soporte de pago seleccionado.');
    const approved = c.decision === 'APROBADO';
    if (approved && c.verifiedAmountCents <= 0) return refuse(409, 'Registra un monto mayor a $0.');
    const review = { decision: c.decision, verifiedAmountCents: approved ? c.verifiedAmountCents : null, reason: c.reason, actorLabel: this.user.label(), decidedAt: new Date(this.clock.now()).toISOString() };
    let next: Reservation = { ...r, payments: r.payments!.map((x) => (x.id === p.id ? { ...x, proofStatus: c.decision, review } : x)) };
    if (approved) {
      const applied = Math.min(c.verifiedAmountCents, r.balanceCents), validatedCents = (r.validatedCents ?? 0) + applied, balanceCents = r.balanceCents - applied;
      if (c.verifiedAmountCents > applied) this.handedExcess.push({ reservationId: r.id, amountCents: c.verifiedAmountCents - applied });
      const reached = r.paymentType === 'PARTIAL' ? validatedCents >= minimumPartial(r) : balanceCents === 0;
      const status = r.status === 'PENDIENTE_DE_PAGO' && reached ? 'CONFIRMADA' : r.status;
      next = { ...next, status, validatedCents, balanceCents, financialStatus: situation({ ...r, status }, validatedCents, balanceCents) };
    }
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(key, next);
    return of(next);
  }
}

/** Registered in sources.demo.ts after paymentsDemoProviders(), over the same store; the answered keys belong to the page. */
export function proofReviewDemoProviders(): Provider[] {
  const clock = new DemoClock(), answered = new Map<string, Reservation>();
  return [
    { provide: Clock, useValue: clock },
    { provide: PendingProofsSource, useFactory: (s: ReservationsSource, c: Clock) => new DemoPendingProofs(s as DemoReservationsStore, c), deps: [ReservationsSource, Clock] },
    { provide: ProofReviewWriter, useFactory: (s: ReservationsSource, k: PortalCapabilities, u: RegisteringUser, c: Clock) =>
      new DemoProofReviewWriter(s as DemoReservationsStore, k, u, c, answered), deps: [ReservationsSource, PortalCapabilities, RegisteringUser, Clock] },
  ];
}

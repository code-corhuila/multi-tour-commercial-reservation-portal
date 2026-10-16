import { Optional, Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CreditBalanceWriter } from '../credit-balance/data/credit-balance-ports';
import { RegisteringUser } from '../payments/data/payments-writer';
import { DecideProofCommand, PendingProofs, PendingProofsSource, ProofReviewWriter } from '../payments/data/proof-review-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { Reservation } from '../reservations/model/reservation';
import { Clock } from '../shared/clock';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { PaymentParametersSource } from '../payment-parameters/data/payment-parameters-ports';
import { ReservationParametersLookup, SEED_LOOKUP, minimumDepositCents } from '../payment-parameters/model/payment-parameters';
import { demoNow } from './demo-fixtures';
import { lookupOf } from './payment-parameters-demo';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 010- DD-PV1, DD-PV3, G-PERM): decisions are written on the payment lines of the one reservations store (plan D-02).
const DAY = 24 * 60 * 60 * 1000;
const refuse = (status: number, userMessage: string) => throwError(() => ({ status, userMessage }));
/** DP-PV1 NO DEFINIDO: the minimum partial comes from the payment parameters (009- AC-PY.12); the demo seed is one third of the final value ($100.000 of $300.000). DP-PV2: below it, Parcial. */
export const minimumPartial = (r: Reservation, parameters: ReservationParametersLookup = SEED_LOOKUP) =>
  minimumDepositCents(r.quote.finalCents, parameters.forReservation(r).minDepositPercent);
export const situation = (r: Reservation, validated: number, balance: number): Reservation['financialStatus'] =>
  balance === 0 ? 'PAGO_COMPLETO' : r.status === 'CONFIRMADA' && r.paymentType === 'PARTIAL' ? 'ABONO_RECIBIDO' : validated > 0 ? 'PARCIAL' : 'SIN_PAGO';

/** DD-PV3: the demo clock, ?demoNow on the area address (e2e README 2.3). */
export class DemoClock extends Clock { override now(): number { return demoNow(); } }

/** RN-RES-006C: a proof 24 running hours En validación is marked; the mark changes nothing (job 2 in production). Every proof is listed. */
export class DemoPendingProofs extends PendingProofsSource {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock) { super(); }
  override list(): Observable<PendingProofs> {
    const now = this.clock.now(), rows = this.store.items.flatMap((reservation) => (reservation.payments ?? []).filter((p) => p.proofName)
      .map((payment) => ({ reservation, payment, overdue: payment.proofStatus === 'EN_VALIDACION' && !!payment.presentedAt && now - Date.parse(payment.presentedAt) >= DAY })));
    return of({ rows, overdueCount: rows.filter((row) => row.overdue).length });
  }
}

/** D-04, D-05: permission first; an approval applies up to the balance and confirms at the threshold; a rejection changes only its line. */
export class DemoProofReviewWriter extends ProofReviewWriter {
  /** RN-PV7: the excess handed to the store; the credit balance it becomes is HU-COM-017's (DP-CB5, nothing drawn). */
  readonly handedExcess: { reservationId: string; amountCents: number }[] = [];
  constructor(private readonly store: DemoReservationsStore, private readonly capabilities: PortalCapabilities, private readonly user: RegisteringUser,
    private readonly clock: Clock, private readonly answered: Map<string, Reservation>, private readonly credit?: CreditBalanceWriter,
    private readonly parameters: ReservationParametersLookup = SEED_LOOKUP) { super(); }

  override decide(c: DecideProofCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key), r = this.store.items.find((x) => x.id === c.reservationId), p = r?.payments?.find((x) => x.id === c.paymentId);
    if (known) return of(known);
    if (!this.capabilities.canDecideProof()) return refuse(403, 'No tienes permiso para validar comprobantes de pago.');
    if (!r || !p || p.proofStatus !== 'EN_VALIDACION') return refuse(409, p ? 'Este comprobante ya fue decidido. No se puede volver a decidir sobre el mismo comprobante.' : 'No se encontró el comprobante seleccionado.');
    const approved = c.decision === 'APROBADO', reason = c.reason.trim();
    if (approved && c.verifiedAmountCents <= 0) return refuse(409, 'Registra el monto verificado (mayor a $0).');
    if (!approved && !reason) return refuse(409, 'Registra el motivo obligatorio del rechazo.');
    if (approved && c.verifiedAmountCents !== p.amountCents && !reason) return refuse(409, 'El monto verificado es distinto al declarado en el comprobante: registra el motivo de la diferencia.');
    // RN-RES-006A: a cancelled reservation is not reactivated; the value waits for treatment. Otherwise only the balance is applied.
    const cancelled = r.status === 'CANCELADA', applied = !approved || cancelled ? 0 : Math.min(c.verifiedAmountCents, r.balanceCents);
    const surplus = approved && !cancelled ? c.verifiedAmountCents - applied : 0, untreated = approved && cancelled ? c.verifiedAmountCents : 0;
    const review = { decision: c.decision, verifiedAmountCents: approved ? c.verifiedAmountCents : null, reason, actorLabel: this.user.label(), decidedAt: new Date(this.clock.now()).toISOString(),
      appliedCents: applied, surplusCents: surplus, pendingTreatmentCents: untreated };
    let next: Reservation = { ...r, payments: r.payments!.map((x) => (x.id === p.id ? { ...x, proofStatus: c.decision, review } : x)) };
    if (approved && !cancelled) {
      const validatedCents = (r.validatedCents ?? 0) + applied, balanceCents = r.balanceCents - applied;
      if (surplus > 0) { this.handedExcess.push({ reservationId: r.id, amountCents: surplus }); this.credit?.recordExcess(r, c.verifiedAmountCents, `excess-${key}`).subscribe(); }
      const reached = r.paymentType === 'PARTIAL' ? validatedCents >= minimumPartial(r, this.parameters) : balanceCents === 0;
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
    { provide: ProofReviewWriter, useFactory: (s: ReservationsSource, k: PortalCapabilities, u: RegisteringUser, c: Clock, credit: CreditBalanceWriter | null, p: PaymentParametersSource | null) =>
      new DemoProofReviewWriter(s as DemoReservationsStore, k, u, c, answered, credit ?? undefined, lookupOf(p)),
      deps: [ReservationsSource, PortalCapabilities, RegisteringUser, Clock, [new Optional(), CreditBalanceWriter], [new Optional(), PaymentParametersSource]] },
  ];
}

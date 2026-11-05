import { Observable, forkJoin, map } from 'rxjs';
import { Reservation, ReservationsSource, STATUS_CODE } from '../../reservations/data/reservations-source';
import { MyReservationsSource } from '../../self-service-reservation/data/my-reservations-source';
import { noticeLines } from '../economic-rows';
import { ContinuePaymentTarget, CustomerPaymentSummary, MyPaymentsSource, PaymentNotice } from './my-payments-source';

// HU-COM-014 (spec 014-, DD-1, plan D-03): Mis pagos over the one reservations source, which holds the payment lines (HU-COM-009) and the
// cancellation (HU-COM-013). Whose they are is decided by the source of 008- (RN-MP3); nothing is stored here. The demo and the default module
// provide it over their own sources.
const summaryOf = (r: Reservation): CustomerPaymentSummary => ({
  reservationId: r.id, tourName: r.tourName, departureAt: r.departureDate, reservationStatus: STATUS_CODE[r.status],
  paymentType: r.paymentType, paymentMethod: r.paymentMethod, proofStatus: r.payments?.at(-1)?.proofStatus ?? 'SIN_COMPROBANTE',
  // As the store and mis-pagos.html: a cancelled reservation without validated values has no financial situation.
  financialStatus: r.status === 'CANCELADA' && !r.validatedCents ? null : r.financialStatus,
  validatedCents: r.validatedCents ?? 0, balanceCents: r.balanceCents, cancellationCause: r.cancellation?.cause,
  // v1.9 fields the store can answer. The store keeps no credit balance (HU-017 has no portal), so none is ever available here.
  people: r.people, finalValueCents: r.quote.finalCents, refundedCents: r.refund?.execution ? r.refund.amountCents : 0, creditBalanceCents: 0,
  pendingTreatmentCents: r.financialDecision?.outcome === null ? (r.financialDecision.refundableCents ?? r.validatedCents ?? 0) : 0,
  deadlineAt: r.deadline?.extendedUntil ?? r.deadline?.dueAt, reschedulingPending: r.reschedulingPending,
  receipts: (r.payments ?? []).map((p) => ({ support: p.proofName ?? '', amountCents: p.amountCents, status: p.proofStatus,
    ...(p.review?.decision === 'RECHAZADO' && { rejectionReason: p.review.reason }) })),
});

export class ReservationsMyPayments extends MyPaymentsSource {
  constructor(private readonly store: ReservationsSource, private readonly mine: MyReservationsSource) { super(); }

  override listMine(): Observable<readonly CustomerPaymentSummary[]> {
    return forkJoin({ own: this.mine.listMine(), all: this.store.list() }).pipe(map(({ own, all }) => {
      const codes = new Set(own.map((r) => r.reservationId));
      return all.filter((r) => codes.has(r.id)).map(summaryOf);
    }));
  }

  /** DP-MP4, demo reading: the own reservations the mockup's notifications have something to say about (app.js 4758). */
  override notices(): Observable<readonly PaymentNotice[]> {
    return this.listMine().pipe(map((all) => all.filter((r) => noticeLines(r).length > 0)));
  }

  /** DP-MP3, PROPUESTO: the own Pendiente de pago reservation paid by transfer (screen 24) with the nearest departure, for its balance;
   * one whose proof is already En validación waits for the operator, so it is not offered. */
  override continuePaymentTarget(): Observable<ContinuePaymentTarget | null> {
    return this.listMine().pipe(map((all) => {
      const next = all.filter((r) => r.reservationStatus === 'PENDING_PAYMENT' && r.paymentMethod === 'BANK_TRANSFER' && r.proofStatus !== 'EN_VALIDACION')
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt))[0];
      return next ? { reservationId: next.reservationId, paymentType: next.paymentType, amountCents: next.balanceCents } : null;
    }));
  }
}


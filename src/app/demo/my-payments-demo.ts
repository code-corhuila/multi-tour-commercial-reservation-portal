import { Provider } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ContinuePaymentTarget, CustomerPaymentSummary, MyPaymentsSource, PaymentNotice } from '../my-payments/data/my-payments-source';
import { Reservation, ReservationsSource, STATUS_CODE } from '../reservations/data/reservations-source';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';

// DEMO (spec 014- DD-1, plan D-03): Mis pagos over the one reservations store of HU-COM-007, where HU-COM-009 writes the
// payment lines and HU-COM-013 the cancellation. Whose they are is decided by the source of 008- (RN-MP3); nothing is stored here.
const summaryOf = (r: Reservation): CustomerPaymentSummary => ({
  reservationId: r.id, tourName: r.tourName, departureAt: r.departureDate, reservationStatus: STATUS_CODE[r.status],
  paymentType: r.paymentType, paymentMethod: r.paymentMethod, proofStatus: r.payments?.at(-1)?.proofStatus ?? 'SIN_COMPROBANTE',
  // As the store and mis-pagos.html: a cancelled reservation without validated values has no financial situation.
  financialStatus: r.status === 'CANCELADA' && !r.validatedCents ? null : r.financialStatus,
  validatedCents: r.validatedCents ?? 0, balanceCents: r.balanceCents, cancellationCause: r.cancellation?.cause,
});

export class DemoMyPayments extends MyPaymentsSource {
  constructor(private readonly store: ReservationsSource, private readonly mine: MyReservationsSource) { super(); }

  override listMine(): Observable<readonly CustomerPaymentSummary[]> {
    return forkJoin({ own: this.mine.listMine(), all: this.store.list() }).pipe(map(({ own, all }) => {
      const codes = new Set(own.map((r) => r.reservationId));
      return all.filter((r) => codes.has(r.id)).map(summaryOf);
    }));
  }

  /** DP-MP4, demo reading: one notice per own reservation whose last proof is En validación. */
  override notices(): Observable<readonly PaymentNotice[]> {
    return this.listMine().pipe(map((all) => all.filter((r) => r.proofStatus === 'EN_VALIDACION').map(({ reservationId, proofStatus }) => ({ reservationId, proofStatus }))));
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

/** After reservationDemoProviders() and selfServiceDemoProviders(), over their store and the customer's own reservations. */
export function myPaymentsDemoProviders(): Provider[] {
  return [{ provide: MyPaymentsSource, useFactory: (s: ReservationsSource, m: MyReservationsSource) => new DemoMyPayments(s, m), deps: [ReservationsSource, MyReservationsSource] }];
}

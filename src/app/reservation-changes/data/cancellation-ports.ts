import { inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Reservation, STATUS_LABEL } from '../../reservations/data/reservations-source';
import { RESERVATION_CHANGES_COPY, refusalOf } from '../reservation-changes-copy';
import { ReservationChangeType } from './reservation-change-types';

/** RN-CN1, RN-CN7: only allowed is cancelled here (HU-OPS-005 owns the emergency of En ejecución). */
export type Eligibility = 'allowed' | 'terminal' | 'in-execution' | 'rescheduling-pending';
/** RN-CN4, already resolved: an amount, pending the penalty policy (DP-CN1), or nothing validated. */
export type RefundableAmount = { readonly kind: 'amount'; readonly cents: number; readonly penaltyCents: number }
  | { readonly kind: 'pending-policy' } | { readonly kind: 'no-payments' };
export interface CancellationQuoteResult { readonly reservation: Reservation; readonly eligibility: Eligibility; readonly refundable: RefundableAmount }

/** Plan D-03, D-05: one answer for the 10A button and the screen; null when the reservation is unknown. */
export abstract class CancellationQuote {
  abstract quote(code: string): Observable<CancellationQuoteResult | null>;
}

export interface CancelCommand { readonly code: string; readonly cause: string; readonly idempotencyKey: string }
export type CancellationOutcome = { readonly kind: 'registered'; readonly reservation: Reservation }
  | { readonly kind: 'refused'; readonly eligibility: Eligibility; readonly reservation: Reservation };

/** One cancellation per Idempotency-Key; the service re-checks the quote and is the authority (gap G-B: no path yet). */
export abstract class CancellationWriter {
  abstract cancel(command: CancelCommand): Observable<CancellationOutcome>;
}

/** The instant of the cancellation and of the decision's recognizedAt; the view never reads the system clock. */
export abstract class Clock {
  abstract now(): string;
}

/** The "Cancelación" entry of RESERVATION_CHANGE_TYPES, over the writer of this build. */
export function cancellationChangeType(): ReservationChangeType {
  const writer = inject(CancellationWriter);
  return {
    key: 'cancellation', label: RESERVATION_CHANGES_COPY.cancellationType,
    submit: ({ reservationCode, cause, idempotencyKey }) => writer.cancel({ code: reservationCode, cause, idempotencyKey }).pipe(map((o) =>
      o.kind === 'registered' ? { kind: 'registered' as const } : { kind: 'refused' as const, reason: refusalOf(o.eligibility, STATUS_LABEL[o.reservation.status]) ?? '' })),
  };
}

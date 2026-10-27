import { Observable } from 'rxjs';

/** PROPUESTO (G-B): the percentage is in basis points, the authorizer is never typed (the service answers it from the session, plan D-06). */
export type AdditionalDiscountCommand = { readonly reservationId: string; readonly percentageBasisPoints: number; readonly reason: string };
/** What the service stored on the reservation (additionalDiscount) and what it recalculated. */
export type AdditionalDiscountApplied = AdditionalDiscountCommand & {
  readonly appliedBy: string; readonly appliedAt: string; readonly previousValueCents: number; readonly amountCents: number;
  readonly newValueCents: number; readonly excessCents: number;
};

/** PROPUESTO (G-API): one Idempotency-Key per intention, reused on retry (norm 5.3.8). */
export abstract class AdditionalDiscountWriter {
  abstract register(command: AdditionalDiscountCommand, idempotencyKey: string): Observable<AdditionalDiscountApplied>;
}

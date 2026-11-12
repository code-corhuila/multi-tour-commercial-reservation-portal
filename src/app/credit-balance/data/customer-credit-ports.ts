import { Observable } from 'rxjs';
import { CreditApplyOutcome } from './credit-balance-ports';

/** HU-COM-017 AC-CB.13 (DP-CB6, PROPUESTO): what the final customer reads of their own credit in Mis pagos; every figure is the port's (pillar 2). */
export type CustomerCreditLine = { readonly reservationId: string; readonly availableCents: number };
export type CustomerCreditRequest = { readonly id: string; readonly reservationId: string; readonly amountCents: number;
  readonly state: 'PENDIENTE_DE_AUTORIZACION' | 'AUTORIZADA' | 'RECHAZADA'; readonly requestedAt: string };
export type CustomerCredit = { readonly totalCents: number; readonly sources: readonly CustomerCreditLine[]; readonly requests: readonly CustomerCreditRequest[] };

/** Only the credit of the own reservations; the service decides whose they are and the portal sends no customer. */
export abstract class CustomerCreditSource {
  abstract mine(): Observable<CustomerCredit>;
}

/** The mockup requests everything available of an origin (D-7); an unknown origin is a 404, an amount of zero or above the available a 422, and one key answers once. */
export abstract class CustomerCreditWriter {
  abstract requestRefund(sourceReservationId: string, amountCents: number, idempotencyKey: string): Observable<CustomerCreditRequest>;
  /** AC-CB.12 (D-11, no capability): the own credit paid as a validated payment without proof to an own reservation, for the least of the credit and its pending balance; the first payment holds the seat in the same operation. */
  abstract apply(targetReservationId: string, idempotencyKey: string): Observable<CreditApplyOutcome>;
}

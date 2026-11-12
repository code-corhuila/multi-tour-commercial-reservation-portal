import { Observable } from 'rxjs';

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
}

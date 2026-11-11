import { Observable } from 'rxjs';
import { Quote } from '../model/reservation';

/** What is quoted: the departure, the services and the people (007- amendment, plan H-D7). */
export type QuoteRequest = { readonly departureId: string; readonly serviceIds: readonly string[]; readonly people: number };

/**
 * The service quotes a selection in cents (RN-RC4, RN-RC5); the portal shows the Quote and adds nothing up.
 * Field names follow the contract when it is published (gap G-B); the demo build supplies an in-memory one.
 */
export abstract class ReservationQuoteSource {
  abstract quote(request: QuoteRequest): Observable<Quote>;
}

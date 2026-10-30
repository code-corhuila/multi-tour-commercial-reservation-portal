import { Observable, forkJoin, map } from 'rxjs';
import { CatalogItem } from '../catalog/model/catalog-item';
import { QuoteRequest, ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { Quote } from '../reservations/model/reservation';
import { PortalApiClient } from '../shell-contract';
import { call, catalogPath, reservationQuotesPath } from './api-paths';

interface ValueLineDto { readonly amountCents: number }
/** ReservationDiscountLine of the contract (PROPOSED): in application order. The cap of the rule (DP-RC13) is not drawn yet. */
interface DiscountLineDto { readonly name: string; readonly calculationBase: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly amountCents: number }
/** ReservationQuote of the contract (PROPOSED): every figure in integer cents; `transportLine` is absent when no transport is needed. */
export interface ReservationQuoteDto {
  readonly tourLine: ValueLineDto; readonly transportLine?: ValueLineDto; readonly projectedValueCents: number;
  readonly discounts: readonly DiscountLineDto[]; readonly finalValueCents: number;
}

/** The quote as the screens read it: the lines the service returned, added to nothing (RN-RC4, RN-RC5); the tour line is named by the tour. */
export function quoteFrom(dto: ReservationQuoteDto, tourName: string): Quote {
  return {
    services: [{ name: tourName, cents: dto.tourLine.amountCents }], transportCents: dto.transportLine?.amountCents ?? 0, projectedCents: dto.projectedValueCents,
    discounts: dto.discounts.map((d) => ({ name: d.name, base: d.calculationBase, amountCents: d.amountCents })),
    discountCents: dto.discounts.reduce((sum, d) => sum + d.amountCents, 0), finalCents: dto.finalValueCents,
  };
}

/**
 * The value of a selection over POST /reservation-quotes: it sends the tour, the departure and the people, never a value, a tenant or a
 * user. One tour per reservation (DP-11), so the first service of the selection is the tour; the catalog gives its name for the line.
 */
export class ReservationQuoteApiSource extends ReservationQuoteSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override quote(request: QuoteRequest): Observable<Quote> {
    const serviceId = request.serviceIds[0];
    return forkJoin({
      quote: call<ReservationQuoteDto>(this.client, reservationQuotesPath(), { method: 'POST', body: { serviceId, salidaId: request.departureId, people: request.people } }),
      tour: call<CatalogItem>(this.client, catalogPath(serviceId)),
    }).pipe(map(({ quote, tour }) => quoteFrom(quote, tour.commercialName)));
  }
}

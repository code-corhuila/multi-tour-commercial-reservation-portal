import { Observable, forkJoin, map, take } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationDiscounts } from '../reservations/data/reservation-integrations';
import { QuoteRequest, ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { Quote } from '../reservations/model/reservation';

/**
 * DEMO (007- amendment, plan H-D7): what the service will compute, in memory, until the -api quotes (gap G-B).
 * Integer cents only (RN-RC4). DP-RC1 PROPUESTO: every rate is per person. The discounts come from the
 * calculation of HU-COM-004 (RN-RC5); this only subtracts the lines it returns.
 */
export class DemoReservationQuotes extends ReservationQuoteSource {
  constructor(private readonly departures: DeparturesSource, private readonly catalog: CatalogItemsSource,
    private readonly discountsOn: ReservationDiscounts) { super(); }

  override quote(request: QuoteRequest): Observable<Quote> {
    return forkJoin({ all: this.departures.list().pipe(take(1)), items: this.catalog.list().pipe(take(1)) }).pipe(map(({ all, items }) => {
      const departure = all.find((d) => d.id === request.departureId);
      if (!departure) throw new Error('Unknown departure');
      const lines = items.filter((i) => request.serviceIds.includes(i.serviceId))
        .map((i) => ({ name: i.commercialName, cents: i.baseRateCents * request.people }));
      const transportCents = departure.transportPerPersonCents * request.people;
      const projectedCents = lines.reduce((sum, line) => sum + line.cents, transportCents);
      const discounts = this.discountsOn.apply(projectedCents);
      const discountCents = discounts.reduce((sum, d) => sum + d.amountCents, 0);
      return { services: lines, transportCents, projectedCents, discounts, discountCents, finalCents: Math.max(0, projectedCents - discountCents) };
    }));
  }
}

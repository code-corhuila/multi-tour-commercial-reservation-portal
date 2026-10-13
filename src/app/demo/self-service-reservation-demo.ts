import { Provider } from '@angular/core';
import { Observable, forkJoin, map, of, throwError } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { DeparturesSource } from '../reservations/data/departures-source';
import { LeadCustomersSource } from '../reservations/data/reservation-integrations';
import { ReservationsSource, STATUS_CODE } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { Reservation } from '../reservations/model/reservation';
import { CustomerContext } from '../self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource } from '../self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, ReservationSelection, SelectionQuote } from '../self-service-reservation/model/self-service-reservation';
import { ApiError } from '../shell-contract';

// DEMO (spec DD-1): the customer side of the one demo store of HU-COM-007 (reservations-demo.ts), so the
// operator and the customer read the same reservation under the same code. Debt: the contract has no
// reservation path yet (G-B); the service will decide whose reservations they are (RN-RS8).
/** PROVISIONAL, demo only: the lead customer the signed-in final customer stands for (no customer id in the session yet). */
const DEMO_FINAL_CUSTOMER = 'demo-cus-3';

const asCustomer = (r: Reservation, selection: Partial<ReservationSelection>): CustomerReservation => ({
  reservationId: r.id, tourName: r.tourName, departureAt: r.departureDate, departureId: selection.departureId ?? '',
  serviceIds: selection.serviceIds ?? [], people: r.people, projectedValueCents: r.quote.projectedCents, finalValueCents: r.quote.finalCents,
  reservationStatus: STATUS_CODE[r.status], paymentStatus: r.financialStatus,
});

export class DemoMyReservationsStore extends MyReservationsSource {
  items: CustomerReservation[] = [
    reservation('RES-1843', 'demo-dep-1', ['demo-svc-1'], 2),
    reservation('RES-1842', 'demo-dep-2', ['demo-svc-2', 'demo-svc-4'], 1),
  ];
  override listMine(): Observable<readonly CustomerReservation[]> { return of([...this.items]); }
}

export class DemoPaymentMethods extends PaymentMethodsSource {
  private readonly methods: readonly PaymentMethod[] = [
    { code: 'BANK_TRANSFER', label: 'Transferencia' },
    { code: 'CASH_AT_OFFICE', label: 'Efectivo' },
  ];
  override listEnabled(): Observable<readonly PaymentMethod[]> { return of(this.methods); }
}

/** One reservation per key (AC-RS.6); a full departure creates nothing and is refused (AC-RS.3). */
export class DemoReservationRequester extends ReservationRequester {
  private readonly byKey = new Map<string, CustomerReservation>();
  constructor(private readonly store: DemoMyReservationsStore) { super(); }
  override request(selection: ReservationSelection, _paymentMethod: string, idempotencyKey: string): Observable<CustomerReservation> {
    const known = this.byKey.get(idempotencyKey);
    if (known) return of(known);
    if (selection.departureId === FULL_DEPARTURE) {
      const refusal: ApiError = { status: 409, code: 'CAPACITY_UNAVAILABLE', message: 'No effective capacity', details: [], traceId: 'demo-trace', userMessage: '' };
      return throwError(() => refusal);
    }
    const created = reservation(`RES-${1843 + this.store.items.length}`, selection.departureId, selection.serviceIds, selection.people);
    this.byKey.set(idempotencyKey, created);
    this.store.items = [...this.store.items, created];
    return of(created);
  }
}

/** The calculation of HU-COM-007 (quote), reused over its departures and the catalog rates; no discount until HU-COM-004. */
export class DemoSelectionQuotes extends SelectionQuoteSource {
  constructor(private readonly departures: DeparturesSource, private readonly catalog: CatalogItemsSource) { super(); }
  override quote(selection: ReservationSelection): Observable<SelectionQuote> {
    return forkJoin({ all: this.departures.list(), items: this.catalog.list() }).pipe(map(({ all, items }) => {
      const departure = all.find((d) => d.id === selection.departureId);
      if (!departure) throw new Error('Unknown departure');
      const services = items.filter((i) => selection.serviceIds.includes(i.serviceId)).map((i) => ({ id: i.serviceId, name: i.commercialName, rateCents: i.baseRateCents }));
      const q = quote(services, selection.people, departure, () => []);
      return { tourName: departure.tourName, departureAt: departure.date, baseValueCents: q.projectedCents, discountCents: q.projectedCents - q.finalCents, finalValueCents: q.finalCents };
    }));
  }
}

export function selfServiceDemoProviders(): Provider[] {
  const store = new DemoMyReservationsStore();
  return [
    { provide: MyReservationsSource, useValue: store },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: SelectionQuoteSource, useFactory: (d: DeparturesSource, c: CatalogItemsSource) => new DemoSelectionQuotes(d, c), deps: [DeparturesSource, CatalogItemsSource] },
    { provide: ReservationRequester, useValue: new DemoReservationRequester(store) },
  ];
}

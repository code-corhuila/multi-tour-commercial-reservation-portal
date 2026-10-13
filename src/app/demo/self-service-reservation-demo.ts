import { Provider } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { DeparturesSource } from '../reservations/data/departures-source';
import { LeadCustomersSource } from '../reservations/data/reservation-integrations';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { Quote, Reservation, quote } from '../reservations/model/reservation';
import { CustomerContext } from '../self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource } from '../self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, ReservationSelection, SelectionQuote } from '../self-service-reservation/model/self-service-reservation';

// DEMO (spec DD-1): the customer side of the one demo store of HU-COM-007 (reservations-demo.ts), so the
// operator and the customer read the same reservation under the same code. Debt: the contract has no
// reservation path yet (G-B); the service will decide whose reservations they are (RN-RS8).
/** PROVISIONAL, demo only: the lead customer the signed-in final customer stands for (no customer id in the session yet). */
const DEMO_FINAL_CUSTOMER = 'demo-cus-3';
const STATUS: Readonly<Record<Reservation['status'], string>> = { PENDIENTE_DE_PAGO: 'PENDING_PAYMENT' };

const asCustomer = (r: Reservation, selection: Partial<ReservationSelection>): CustomerReservation => ({
  reservationId: r.id, tourName: r.tourName, departureAt: r.departureDate, departureId: selection.departureId ?? '',
  serviceIds: selection.serviceIds ?? [], people: r.people, projectedValueCents: r.quote.projectedCents, finalValueCents: r.quote.finalCents,
  reservationStatus: STATUS[r.status], paymentStatus: r.financialStatus,
});

/** The reservations whose lead customer is the demo final customer, read from the shared store; nothing for any other standing. */
export class DemoMyReservations extends MyReservationsSource {
  /** The selections made here, so a created reservation keeps its departure and services. */
  readonly selections = new Map<string, ReservationSelection>();
  constructor(private readonly store: ReservationsSource, private readonly leads: LeadCustomersSource, private readonly customer: CustomerContext) { super(); }
  override listMine(): Observable<readonly CustomerReservation[]> {
    if (this.customer.standing !== 'FINAL_CUSTOMER') return of([]);
    return forkJoin({ all: this.store.list(), leads: this.leads.list() }).pipe(map(({ all, leads }) => {
      const name = leads.find((l) => l.id === DEMO_FINAL_CUSTOMER)?.fullName;
      return all.filter((r) => r.leadCustomerName === name).map((r) => asCustomer(r, this.selections.get(r.id) ?? {}));
    }));
  }
}

export class DemoPaymentMethods extends PaymentMethodsSource {
  private readonly methods: readonly PaymentMethod[] = [
    { code: 'BANK_TRANSFER', label: 'Transferencia' },
    { code: 'CASH_AT_OFFICE', label: 'Efectivo' },
  ];
  override listEnabled(): Observable<readonly PaymentMethod[]> { return of(this.methods); }
}

/** The calculation of HU-COM-007 (quote), reused over its departures and the catalog rates; no discount until HU-COM-004. */
export class DemoSelectionQuotes extends SelectionQuoteSource {
  constructor(private readonly departures: DeparturesSource, private readonly catalog: CatalogItemsSource) { super(); }
  full(selection: ReservationSelection): Observable<{ readonly summary: SelectionQuote; readonly quote: Quote }> {
    return forkJoin({ all: this.departures.list(), items: this.catalog.list() }).pipe(map(({ all, items }) => {
      const departure = all.find((d) => d.id === selection.departureId);
      if (!departure) throw new Error('Unknown departure');
      const services = items.filter((i) => selection.serviceIds.includes(i.serviceId)).map((i) => ({ id: i.serviceId, name: i.commercialName, rateCents: i.baseRateCents }));
      const q = quote(services, selection.people, departure, () => []);
      return { quote: q, summary: { tourName: departure.tourName, departureAt: departure.date, baseValueCents: q.projectedCents, discountCents: q.projectedCents - q.finalCents, finalValueCents: q.finalCents } };
    }));
  }
  override quote(selection: ReservationSelection): Observable<SelectionQuote> { return this.full(selection).pipe(map((f) => f.summary)); }
}

/**
 * Creates through the writer of HU-COM-007 with the quote the summary showed. The writer keeps one
 * reservation per Idempotency-Key (AC-RS.6) and refuses a departure without capacity (AC-RS.3).
 */
export class DemoReservationRequester extends ReservationRequester {
  constructor(private readonly writer: ReservationsWriter, private readonly quotes: DemoSelectionQuotes, private readonly mine: DemoMyReservations) { super(); }
  override request(selection: ReservationSelection, _paymentMethod: string, idempotencyKey: string): Observable<CustomerReservation> {
    return this.quotes.full(selection).pipe(
      switchMap(({ quote: q }) => this.writer.create({ leadCustomerId: DEMO_FINAL_CUSTOMER, ...selection, quote: q }, idempotencyKey)),
      map((created) => { this.mine.selections.set(created.id, selection); return asCustomer(created, selection); }),
    );
  }
}

/** Over the providers of reservationDemoProviders() and the CustomerContext, which must come first. */
export function selfServiceDemoProviders(): Provider[] {
  return [
    { provide: DemoMyReservations, useFactory: (s: ReservationsSource, l: LeadCustomersSource, c: CustomerContext) => new DemoMyReservations(s, l, c), deps: [ReservationsSource, LeadCustomersSource, CustomerContext] },
    { provide: MyReservationsSource, useExisting: DemoMyReservations },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: DemoSelectionQuotes, useFactory: (d: DeparturesSource, c: CatalogItemsSource) => new DemoSelectionQuotes(d, c), deps: [DeparturesSource, CatalogItemsSource] },
    { provide: SelectionQuoteSource, useExisting: DemoSelectionQuotes },
    { provide: ReservationRequester, useFactory: (w: ReservationsWriter, q: DemoSelectionQuotes, m: DemoMyReservations) => new DemoReservationRequester(w, q, m), deps: [ReservationsWriter, DemoSelectionQuotes, DemoMyReservations] },
  ];
}

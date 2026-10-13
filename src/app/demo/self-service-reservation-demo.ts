import { Provider } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { LeadCustomersSource } from '../reservations/data/reservation-integrations';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { Reservation } from '../reservations/model/reservation';
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
  constructor(private readonly store: ReservationsSource, private readonly leads: LeadCustomersSource, private readonly customer: CustomerContext,
    readonly selections = new Map<string, ReservationSelection>()) { super(); }
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
  override listTypes(): Observable<readonly PaymentMethod[]> { return of([{ code: 'TOTAL', label: 'Pago total' }, { code: 'PARTIAL', label: 'Abono' }]); }
}

/** 008- H-D9: the summary of a selection over the quote source of HU-COM-007; it computes nothing of its own. */
export class DemoSelectionQuotes extends SelectionQuoteSource {
  constructor(private readonly departures: DeparturesSource, private readonly quotes: ReservationQuoteSource) { super(); }
  override quote(selection: ReservationSelection): Observable<SelectionQuote> {
    return forkJoin({ all: this.departures.list(), q: this.quotes.quote(selection) }).pipe(map(({ all, q }) => {
      const departure = all.find((d) => d.id === selection.departureId);
      if (!departure) throw new Error('Unknown departure');
      return { tourName: departure.tourName, departureAt: departure.date, baseValueCents: q.projectedCents, discountCents: q.discountCents, finalValueCents: q.finalCents };
    }));
  }
}

/**
 * Creates through the writer of HU-COM-007, which quotes with the same source the summary read. The writer keeps one
 * reservation per Idempotency-Key (AC-RS.6) and refuses a departure without capacity (AC-RS.3).
 */
export class DemoReservationRequester extends ReservationRequester {
  constructor(private readonly writer: ReservationsWriter, private readonly mine: DemoMyReservations) { super(); }
  override request(selection: ReservationSelection, _paymentMethod: string, idempotencyKey: string): Observable<CustomerReservation> {
    const { departureId, serviceIds, people } = selection;
    return this.writer.create({ leadCustomerId: DEMO_FINAL_CUSTOMER, departureId, serviceIds, people }, idempotencyKey).pipe(
      map((created) => { this.mine.selections.set(created.id, selection); return asCustomer(created, selection); }),
    );
  }
}

/** Over the providers of reservationDemoProviders() and the CustomerContext, which must come first. */
export function selfServiceDemoProviders(): Provider[] {
  const selections = new Map<string, ReservationSelection>();
  return [
    { provide: DemoMyReservations, useFactory: (s: ReservationsSource, l: LeadCustomersSource, c: CustomerContext) => new DemoMyReservations(s, l, c, selections), deps: [ReservationsSource, LeadCustomersSource, CustomerContext] },
    { provide: MyReservationsSource, useExisting: DemoMyReservations },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: SelectionQuoteSource, useFactory: (d: DeparturesSource, q: ReservationQuoteSource) => new DemoSelectionQuotes(d, q), deps: [DeparturesSource, ReservationQuoteSource] },
    { provide: ReservationRequester, useFactory: (w: ReservationsWriter, m: DemoMyReservations) => new DemoReservationRequester(w, m), deps: [ReservationsWriter, DemoMyReservations] },
  ];
}

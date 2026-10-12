import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource } from '../self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, ReservationSelection, SelectionQuote } from '../self-service-reservation/model/self-service-reservation';
import { ApiError } from '../shell-contract';

// DEMO (spec DD-1): in-memory data, invented. Debt: the contract has no reservation path yet (G-B), and the
// values and the capacity check belong to HU-COM-007 (G-DEP); this store only imitates their answers.
const FULL_DEPARTURE = 'demo-dep-full';
const DEMO_PRICE_PER_PERSON_CENTS = 64_950_000;
const DEMO_TOURS: Readonly<Record<string, readonly [string, string]>> = {
  'demo-dep-1': ['Ruta Andina', '2026-09-18T06:30:00'],
  'demo-dep-2': ['Tour Montañas', '2026-09-15T07:00:00'],
};
const tourOf = (departureId: string) => DEMO_TOURS[departureId] ?? ['Tour Desierto de la Tatacoa', '2026-09-22T05:30:00'];

const reservation = (id: string, departureId: string, serviceIds: readonly string[], people: number): CustomerReservation => ({
  reservationId: id, tourName: tourOf(departureId)[0], departureAt: tourOf(departureId)[1], departureId, serviceIds, people,
  projectedValueCents: DEMO_PRICE_PER_PERSON_CENTS * people, finalValueCents: DEMO_PRICE_PER_PERSON_CENTS * people,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'SIN_PAGO',
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

/** The values the calculation of HU-COM-007 would return: no discount in the demo. */
export class DemoSelectionQuotes extends SelectionQuoteSource {
  override quote(selection: ReservationSelection): Observable<SelectionQuote> {
    const [tourName, departureAt] = tourOf(selection.departureId);
    const value = DEMO_PRICE_PER_PERSON_CENTS * selection.people;
    return of({ tourName, departureAt, baseValueCents: value, discountCents: 0, finalValueCents: value });
  }
}

export function selfServiceDemoProviders(): Provider[] {
  const store = new DemoMyReservationsStore();
  return [
    { provide: MyReservationsSource, useValue: store },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: SelectionQuoteSource, useValue: new DemoSelectionQuotes() },
    { provide: ReservationRequester, useValue: new DemoReservationRequester(store) },
  ];
}

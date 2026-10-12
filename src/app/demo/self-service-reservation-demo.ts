import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester } from '../self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, ReservationSelection } from '../self-service-reservation/model/self-service-reservation';
import { ApiError } from '../shell-contract';

// DEMO (spec DD-1): in-memory data, invented. Debt: the contract has no reservation path yet (G-B), and the
// values and the capacity check belong to HU-COM-007 (G-DEP); this store only imitates their answers.
const FULL_DEPARTURE = 'demo-dep-full';
const DEMO_PRICE_PER_PERSON_CENTS = 18_000_000;

const reservation = (id: string, departureId: string, serviceIds: readonly string[], people: number): CustomerReservation => ({
  reservationId: id, departureId, serviceIds, people,
  projectedValueCents: DEMO_PRICE_PER_PERSON_CENTS * people, finalValueCents: DEMO_PRICE_PER_PERSON_CENTS * people,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'SIN_PAGO',
});

export class DemoMyReservationsStore extends MyReservationsSource {
  items: CustomerReservation[] = [
    reservation('demo-res-1', 'demo-dep-1', ['demo-svc-1'], 2),
    reservation('demo-res-2', 'demo-dep-2', ['demo-svc-2', 'demo-svc-4'], 1),
  ];
  override listMine(): Observable<readonly CustomerReservation[]> { return of([...this.items]); }
}

export class DemoPaymentMethods extends PaymentMethodsSource {
  private readonly methods: readonly PaymentMethod[] = [
    { code: 'BANK_TRANSFER', label: 'Transferencia bancaria' },
    { code: 'CASH_AT_OFFICE', label: 'Efectivo en la oficina' },
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
    const created = reservation(`demo-res-${this.store.items.length + 1}`, selection.departureId, selection.serviceIds, selection.people);
    this.byKey.set(idempotencyKey, created);
    this.store.items = [...this.store.items, created];
    return of(created);
  }
}

export function selfServiceDemoProviders(): Provider[] {
  const store = new DemoMyReservationsStore();
  return [
    { provide: MyReservationsSource, useValue: store },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: ReservationRequester, useValue: new DemoReservationRequester(store) },
  ];
}

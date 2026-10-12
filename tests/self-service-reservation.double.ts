import { Observable } from 'rxjs';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import {
  PaymentMethodsSource,
  ReservationRequester,
  ReservationSelectionSource,
} from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import {
  CustomerReservation,
  CustomerStanding,
  PaymentMethod,
  ReservationSelection,
} from '../src/app/self-service-reservation/model/self-service-reservation';
import { ApiError } from '../src/app/shell-contract';

type Pending<T> = { reply: (value: T) => void; fail: (error?: unknown) => void; isOpen: () => boolean };

function controllable<T>(requests: Pending<T>[]): Observable<T> {
  return new Observable<T>((subscriber) => {
    requests.push({
      reply: (value) => { subscriber.next(value); subscriber.complete(); },
      fail: (error = new Error('unavailable')) => subscriber.error(error),
      isOpen: () => !subscriber.closed,
    });
  });
}

export const SELECTION: ReservationSelection = { departureId: 'demo-dep-7', serviceIds: ['demo-svc-1', 'demo-svc-2'], people: 2 };
export const METHODS: readonly PaymentMethod[] = [
  { code: 'BANK_TRANSFER', label: 'Bank transfer' },
  { code: 'CASH_AT_OFFICE', label: 'Cash at the office' },
];

export function reservationFor(selection: ReservationSelection = SELECTION, id = 'demo-res-1'): CustomerReservation {
  return {
    reservationId: id, departureId: selection.departureId, serviceIds: selection.serviceIds, people: selection.people,
    projectedValueCents: 36_000_000, finalValueCents: 36_000_000, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'SIN_PAGO',
  };
}

export function noCapacity(overrides: Partial<ApiError> = {}): ApiError {
  return { status: 409, code: 'CAPACITY_UNAVAILABLE', message: 'no capacity', details: [], traceId: 'trace-9', userMessage: '', ...overrides };
}

export class ControllableMyReservationsSource extends MyReservationsSource {
  readonly requests: Pending<readonly CustomerReservation[]>[] = [];
  override listMine(): Observable<readonly CustomerReservation[]> { return controllable(this.requests); }
}

export class ControllablePaymentMethods extends PaymentMethodsSource {
  readonly requests: Pending<readonly PaymentMethod[]>[] = [];
  override listEnabled(): Observable<readonly PaymentMethod[]> { return controllable(this.requests); }
}

export class RecordingRequester extends ReservationRequester {
  readonly calls: (Pending<CustomerReservation> & { selection: ReservationSelection; paymentMethod: string; idempotencyKey: string })[] = [];
  override request(selection: ReservationSelection, paymentMethod: string, idempotencyKey: string): Observable<CustomerReservation> {
    const pending: Pending<CustomerReservation>[] = [];
    return new Observable<CustomerReservation>((subscriber) => {
      const inner = controllable(pending).subscribe(subscriber);
      this.calls.push({ ...pending[0], selection, paymentMethod, idempotencyKey });
      return inner;
    });
  }
}

export function selectionAt(selection: ReservationSelection | null): ReservationSelectionSource {
  return new (class extends ReservationSelectionSource { override current() { return selection; } })();
}

export class CustomerAs extends CustomerContext {
  signInRequests = 0;
  constructor(override readonly standing: CustomerStanding) { super(); }
  override requestSignIn(): void { this.signInRequests += 1; }
}

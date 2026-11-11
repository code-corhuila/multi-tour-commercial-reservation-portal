import { Observable, of } from 'rxjs';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import {
  PaymentMethodsSource,
  ReservationRequester,
  ReservationSelectionSource,
  SelectionQuoteSource,
} from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import {
  CustomerReservation,
  PaymentMethod,
  ReservationSelection,
  SelectionQuote,
} from '../src/app/self-service-reservation/model/self-service-reservation';
import { ApiError } from '../src/app/shell-contract';
import { CustomerStanding } from '../src/app/shared/portal-capabilities';

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
export const TYPES: readonly PaymentMethod[] = [{ code: 'TOTAL', label: 'Pago total' }, { code: 'PARTIAL', label: 'Abono' }];
export const METHODS: readonly PaymentMethod[] = [
  { code: 'BANK_TRANSFER', label: 'Transferencia' },
  { code: 'CASH_AT_OFFICE', label: 'Efectivo' },
];

// The values of the service, in cents: $2.598.000 base, -$519.600 of discounts, $2.078.400 final.
export const QUOTE: SelectionQuote = {
  tourName: 'Ruta Andina', departureAt: '2026-09-18T06:30:00', baseValueCents: 259_800_000, discountCents: 51_960_000, finalValueCents: 207_840_000,
};

export function reservationFor(selection: ReservationSelection = SELECTION, id = 'RES-1843'): CustomerReservation {
  return {
    reservationId: id, tourName: 'Ruta Andina', departureAt: '2026-09-18T06:30:00',
    departureId: selection.departureId, serviceIds: selection.serviceIds, people: selection.people,
    projectedValueCents: 129_900_000, finalValueCents: 129_900_000, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'SIN_PAGO',
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
  override listTypes(): Observable<readonly PaymentMethod[]> { return of(TYPES); }
  override bankAccount() { return of({ bank: 'Banco de prueba', accountType: 'Ahorros', accountNumber: '111', holder: 'Operador de prueba' }); }
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

/** Answers at once: the confirmation waits for the methods, which the tests control. */
export function quoteOf(quote: SelectionQuote = QUOTE): SelectionQuoteSource {
  return new (class extends SelectionQuoteSource { override quote() { return of(quote); } })();
}

export function selectionAt(selection: ReservationSelection | null): ReservationSelectionSource {
  return new (class extends ReservationSelectionSource { override current() { return selection; } })();
}

export class CustomerAs extends CustomerContext {
  signInRequests = 0;
  constructor(override readonly standing: CustomerStanding) { super(); }
  override requestSignIn(): void { this.signInRequests += 1; }
}

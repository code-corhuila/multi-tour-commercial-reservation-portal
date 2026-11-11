import { Provider } from '@angular/core';
import { ReservationsMyPayments } from '../my-payments/data/reservations-my-payments';
import { MyPaymentsSource } from '../my-payments/data/my-payments-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';

// DEMO (spec 014- DD-1): the same read port, over the demo store.
export class DemoMyPayments extends ReservationsMyPayments {}

/** After reservationDemoProviders() and selfServiceDemoProviders(), over their store and the customer's own reservations. */
export function myPaymentsDemoProviders(): Provider[] {
  return [{ provide: MyPaymentsSource, useFactory: (s: ReservationsSource, m: MyReservationsSource) => new DemoMyPayments(s, m), deps: [ReservationsSource, MyReservationsSource] }];
}

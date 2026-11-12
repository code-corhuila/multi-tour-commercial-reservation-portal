import { Provider } from '@angular/core';
import { Observable, forkJoin, map, of, throwError } from 'rxjs';
import { CustomerCredit, CustomerCreditRequest, CustomerCreditSource, CustomerCreditWriter } from '../credit-balance/data/customer-credit-ports';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import { seeded } from './credit-balance-demo';
import { overviewOf } from './credit-overview-demo';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 017- DD-1, DP-CB6): the customer sees the credit book of the one reservations store, restricted to the origins of their own reservations.
const HOUR = 3_600_000;
const colombian = (ms: number) => `${new Date(ms - 5 * HOUR).toISOString().slice(0, 19)}-05:00`;
const REASON = 'Solicitud de devolución del saldo a favor registrada por el cliente';

const creditOf = (store: DemoReservationsStore, mine: MyReservationsSource, now: number): Observable<CustomerCredit> =>
  mine.listMine().pipe(map((own) => {
    const ids = new Set(own.map((r) => r.reservationId)), all = overviewOf(store, now);
    const sources = all.customers.flatMap((c) => c.sources).filter((s) => ids.has(s.reservationId) && s.availableCents > 0).map((s) => ({ reservationId: s.reservationId, availableCents: s.availableCents }));
    const requests = store.creditRequests.filter((q) => ids.has(q.reservationId)).map((q): CustomerCreditRequest =>
      ({ id: q.id, reservationId: q.reservationId, amountCents: q.amountCents, state: q.state, requestedAt: q.requestedAt }));
    return { totalCents: sources.reduce((total, s) => total + s.availableCents, 0), sources, requests };
  }));

export class DemoCustomerCreditSource extends CustomerCreditSource {
  constructor(private readonly store: DemoReservationsStore, private readonly mineOf: MyReservationsSource, private readonly clock: Clock) { super(); }
  override mine(): Observable<CustomerCredit> { return creditOf(this.store, this.mineOf, Date.parse(this.clock.now())); }
}

/** The request is a line of the store the operator screen and HU-COM-016 read; it sets the amount aside and the decision waits 24 running hours. */
export class DemoCustomerCreditWriter extends CustomerCreditWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly mineOf: MyReservationsSource, private readonly clock: Clock,
    private readonly answered = new Map<string, CustomerCreditRequest>()) { super(); }

  override requestRefund(sourceReservationId: string, amountCents: number, key: string): Observable<CustomerCreditRequest> {
    const known = this.answered.get(key);
    if (known) return of(known);
    const now = this.clock.now();
    return creditOf(this.store, this.mineOf, Date.parse(now)).pipe(map((credit) => {
      const source = credit.sources.find((s) => s.reservationId === sourceReservationId);
      if (!source) throw { status: 404 };
      if (!(amountCents > 0) || amountCents > source.availableCents) throw { status: 422 };
      const request = { id: `SAR-${this.store.creditRequests.length + 1}`, reservationId: sourceReservationId, customer: this.store.items.find((r) => r.id === sourceReservationId)?.leadCustomerName ?? '',
        amountCents, state: 'PENDIENTE_DE_AUTORIZACION' as const, reason: REASON, requestedBy: 'Cliente', requestedAt: now, decisionDueAt: colombian(Date.parse(now) + 24 * HOUR), tenant: 'tenant-demo' };
      this.store.creditRequests = [...this.store.creditRequests, request];
      const stored: CustomerCreditRequest = { id: request.id, reservationId: request.reservationId, amountCents, state: request.state, requestedAt: now };
      this.answered.set(key, stored);
      return stored;
    }));
  }
}

/** After creditBalanceDemoProviders() (it seeds the store) and selfServiceDemoProviders(); the answered keys belong to the page. */
export function customerCreditDemoProviders(): Provider[] {
  const answered = new Map<string, CustomerCreditRequest>();
  return [
    { provide: CustomerCreditSource, useFactory: (s: ReservationsSource, m: MyReservationsSource, c: Clock) => new DemoCustomerCreditSource(seeded(s as DemoReservationsStore), m, c), deps: [ReservationsSource, MyReservationsSource, Clock] },
    { provide: CustomerCreditWriter, useFactory: (s: ReservationsSource, m: MyReservationsSource, c: Clock) => new DemoCustomerCreditWriter(seeded(s as DemoReservationsStore), m, c, answered), deps: [ReservationsSource, MyReservationsSource, Clock] },
  ];
}

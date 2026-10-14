import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { selfServiceDemoProviders } from '../src/app/demo/self-service-reservation-demo';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { ReservationRequester, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ReservationSelection } from '../src/app/self-service-reservation/model/self-service-reservation';

// Audit 2026-10-12 (S23, S24): the demo of HU-COM-008 must create exactly what the customer chose,
// in the one demo store of HU-COM-007 that the operator reads too.
const TATACOA: ReservationSelection = { departureId: 'demo-dep-1', serviceIds: ['demo-svc-1'], people: 2 };

function demoAs(roles: string[]) {
  TestBed.configureTestingModule({ providers: [
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(),
    { provide: CustomerContext, useValue: customerContextFor(roles, () => undefined) },
    ...selfServiceDemoProviders(),
  ] });
  return {
    request: (selection: ReservationSelection, key: string) => firstValueFrom(TestBed.inject(ReservationRequester).request(selection, 'BANK_TRANSFER', key)),
    quote: (selection: ReservationSelection) => firstValueFrom(TestBed.inject(SelectionQuoteSource).quote(selection)),
    mine: () => firstValueFrom(TestBed.inject(MyReservationsSource).listMine()),
    operator: () => firstValueFrom(TestBed.inject(ReservationsSource).list()),
  };
}

describe('theDemoReservationCarriesTheSelectionAndItsQuote (audit S23)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('creates the chosen tour, departure and people with the values of the summary', async () => {
    const demo = demoAs(['FINAL_CUSTOMER']);
    const quote = await demo.quote(TATACOA);
    const created = await demo.request(TATACOA, 'key-1');
    expect(created.tourName).toBe(quote.tourName);
    expect(created.tourName).toContain('Tatacoa');
    expect(created.departureAt).toBe(quote.departureAt);
    expect(created.departureId).toBe('demo-dep-1');
    expect(created.serviceIds).toEqual(['demo-svc-1']);
    expect(created.people).toBe(2);
    expect(created.projectedValueCents).toBe(quote.baseValueCents);
    expect(created.finalValueCents).toBe(quote.finalValueCents);
    expect(created.finalValueCents).toBe(41_000_000);
    expect(created.reservationStatus).toBe('PENDING_PAYMENT');
  });

  it('one Idempotency-Key never creates two reservations (AC-RS.6)', async () => {
    const demo = demoAs(['FINAL_CUSTOMER']);
    const before = (await demo.operator()).length;
    const first = await demo.request(TATACOA, 'key-1');
    const again = await demo.request(TATACOA, 'key-1');
    expect(again.reservationId).toBe(first.reservationId);
    expect((await demo.operator()).length).toBe(before + 1);
  });

  it('a departure without capacity creates nothing (AC2)', async () => {
    const demo = demoAs(['FINAL_CUSTOMER']);
    const before = (await demo.operator()).length;
    await expect(demo.request({ departureId: 'demo-dep-2', serviceIds: ['demo-svc-2'], people: 3 }, 'key-2')).rejects.toMatchObject({ status: 409 });
    expect((await demo.operator()).length).toBe(before);
  });
});

describe('theOperatorAndTheCustomerShareOneDemoStore (audit S24)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('the reservation of the customer is the same one in the operator list, under the same code', async () => {
    const demo = demoAs(['FINAL_CUSTOMER']);
    const created = await demo.request(TATACOA, 'key-1');
    const operatorRow = (await demo.operator()).find((r) => r.id === created.reservationId);
    expect(operatorRow?.tourName).toBe(created.tourName);
    expect(operatorRow?.people).toBe(2);
    expect(operatorRow?.quote.finalCents).toBe(created.finalValueCents);
    expect((await demo.mine()).map((r) => r.reservationId)).toContain(created.reservationId);
  });

  it('Mis reservas lists only the reservations of the customer, under the codes the operator reads', async () => {
    const demo = demoAs(['FINAL_CUSTOMER']);
    const operator = await demo.operator();
    const mine = (await demo.mine()).map((r) => r.reservationId);
    // The seeded RES-1842 is the one of the demo final customer, Laura Gómez; RES-1841 is of another customer.
    expect(operator.find((r) => r.id === 'RES-1842')?.leadCustomerName).toBe('Laura Gómez (demo)');
    // HU-COM-014: the demo customer also owns the four payment situations of the mockup's demo data.
    // HU-COM-018: the demo customer also owns RES-1829 (a proposal to answer) and RES-1828 (an episode to propose).
    const OWN = ['RES-1842', 'RES-1840', 'RES-1832', 'RES-1831', 'RES-1830', 'RES-1829', 'RES-1828'];
    expect(mine).toEqual(OWN);
    const created = await demo.request(TATACOA, 'key-1');
    expect(operator.length + 1).toBe((await demo.operator()).length);
    expect((await demo.operator()).find((r) => r.id === created.reservationId)?.leadCustomerName).toBe('Laura Gómez (demo)');
    expect((await demo.mine()).map((r) => r.reservationId)).toEqual([created.reservationId, ...OWN]);
  });

  it('lists nothing for a session that is not a final customer', async () => {
    const demo = demoAs(['TENANT_ADMINISTRATOR']);
    expect(await demo.mine()).toEqual([]);
  });
});

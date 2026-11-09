import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { MyReservationsApiSource, ReservationRequesterApi, SelectionQuoteApiSource } from '../src/app/http/self-service-api-sources';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { ReservationRequester, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ReservationSelection } from '../src/app/self-service-reservation/model/self-service-reservation';
import { TENANT_IDENTIFIER } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-008 over the contract (PROPOSED routes of HU-COM-007 that the Final Customer shares, api spec DP-01 and DP-06): the same
// routes, filtered by the service to the customer's own. The portal sends no customer, tenant, user or value (AC-08.9).
const TENANT = 'agencia-ficticia';
const selection: ReservationSelection = { departureId: 'd-1', serviceIds: ['t-1'], people: 3 };
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3,
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, projectedValueCents: 5997,
  discounts: [{ order: 1, name: 'Temporada baja', calculationBase: 'ORIGINAL_VALUE', baseCents: 5997, amountCents: 600, subtotalCents: 5397 }], finalValueCents: 5397,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentMethod: 'TRANSFER', pendingBalanceCents: 5397, seatHeld: false, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const summary = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z',
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 5397 };
const mine = {
  reservationId: 'r-1', tourName: 'Desierto de la Tatacoa', departureAt: '2026-11-07T06:30:00Z', departureId: 'd-1', serviceIds: ['t-1'], people: 3,
  projectedValueCents: 5997, finalValueCents: 5397, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'SIN_PAGO', paymentMethod: 'BANK_TRANSFER',
};
const quote = { tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, projectedValueCents: 5997, discounts: detail.discounts, finalValueCents: 5397 };
const publicTour = { serviceId: 't-1', commercialName: 'Desierto de la Tatacoa', transportIncluded: false, baseValueCents: 1999, finalValueCents: 1799, discountPercentageBp: 1000, maxTravelers: 12,
  departures: [{ departureId: 'd-1', startsAt: '2026-11-07T06:30:00Z', availableSeats: 8 }] };

describe('myReservationsOverTheApiClient', () => {
  it('lists the reservations the service returns for the customer and reads each one, with no customer or tenant in the request', async () => {
    const { client, calls } = fakeClient({ ok: page([summary]) }, { ok: detail });
    const all = await firstValueFrom(new MyReservationsApiSource(client).listMine());
    expect(calls).toEqual([{ path: `${API_BASE}/reservations?page=1&limit=100&scope=all` }, { path: `${API_BASE}/reservations/r-1` }]);
    expect(all).toEqual([mine]);
  });

  it('reads the finished state of the wire as the code the customer area knows', async () => {
    const { client } = fakeClient({ ok: page([summary]) }, { ok: { ...detail, reservationStatus: 'COMPLETED', paymentStatus: 'FULLY_PAID', pendingBalanceCents: 0 } });
    const [one] = await firstValueFrom(new MyReservationsApiSource(client).listMine());
    expect(one).toMatchObject({ reservationStatus: 'FINALIZED', paymentStatus: 'PAGO_COMPLETO' });
  });

  it('answers an empty list without any detail read and shows a refusal as the page error', async () => {
    const empty = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new MyReservationsApiSource(empty.client).listMine())).toEqual([]);
    expect(empty.calls).toHaveLength(1);
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } });
    expect(await firstValueFrom(new MyReservationsApiSource(client).listMine()).catch((e) => e)).toMatchObject({ status: 403, userMessage: 'Sin permiso.' });
  });
});

describe('selectionQuoteOverTheApiClient', () => {
  it('quotes the selection and reads the tour and its departure from the public route of the tenant: the customer cannot read the catalog', async () => {
    const { client, calls } = fakeClient({ ok: quote }, { ok: publicTour });
    const summaryOfSelection = await firstValueFrom(new SelectionQuoteApiSource(client, () => TENANT).quote(selection));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservation-quotes`, method: 'POST', body: { serviceId: 't-1', salidaId: 'd-1', people: 3 } });
    expect(calls[1]).toEqual({ path: `${API_BASE}/public/tenants/${TENANT}/tours/t-1` });
    expect(summaryOfSelection).toEqual({
      tourName: 'Desierto de la Tatacoa', departureAt: '2026-11-07T06:30:00Z', baseValueCents: 5997, discountCents: 600, finalValueCents: 5397,
      discountLines: [{ order: 1, name: 'Temporada baja', base: 'ORIGINAL_VALUE', amountCents: 600, subtotalCents: 5397 }],
    });
  });

  it('sends nothing and fails in the error state when the channel has no tenant identifier', async () => {
    const { client, calls } = fakeClient();
    expect(await firstValueFrom(new SelectionQuoteApiSource(client, () => null).quote(selection)).catch((e) => e)).toMatchObject({ code: 'NO_TENANT_IDENTIFIER' });
    expect(calls).toEqual([]);
  });

  it('fails when the departure is no longer offered by the tour, and shows the refusal of the quote as it comes', async () => {
    const gone = fakeClient({ ok: quote }, { ok: { ...publicTour, departures: [] } });
    expect(await firstValueFrom(new SelectionQuoteApiSource(gone.client, () => TENANT).quote(selection)).catch((e) => e)).toMatchObject({ status: 404 });
    const refused = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } }, { ok: publicTour });
    expect(await firstValueFrom(new SelectionQuoteApiSource(refused.client, () => TENANT).quote(selection)).catch((e) => e)).toMatchObject({ status: 403, userMessage: 'Sin permiso.' });
  });
});

describe('reservationRequesterOverTheApiClient', () => {
  it('creates under the key with the selection and the chosen method only: no customer, holder, tenant, user or value', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const created = await firstValueFrom(new ReservationRequesterApi(client).request(selection, 'BANK_TRANSFER', 'key-12345678'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { serviceId: 't-1', salidaId: 'd-1', people: 3, paymentMethod: 'TRANSFER' } });
    expect(created).toEqual(mine);
  });

  it('adds the companions with the three fields the contract has, and not the phone or the emergency contact (gap G-B)', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) });
    const companion = { fullName: 'Acompañante Ficticio Uno', document: 'DEMO-2001', birthDate: '2001-05-01', phone: '300 000 2001', emergency: 'Contacto Ficticio 300' };
    await firstValueFrom(new ReservationRequesterApi(client).request(selection, 'BANK_TRANSFER', 'key-12345678', [companion]));
    expect(calls[0].body).toEqual({ serviceId: 't-1', salidaId: 'd-1', people: 3, paymentMethod: 'TRANSFER',
      companions: [{ fullName: 'Acompañante Ficticio Uno', documentNumber: 'DEMO-2001', birthDate: '2001-05-01' }] });
  });

  it('leaves the method out when none was chosen and sends the same key again on a retry', async () => {
    const { client, calls } = fakeClient({ ok: detail }, { ok: page([summary]) }, { ok: detail }, { ok: page([summary]) });
    const requester = new ReservationRequesterApi(client);
    await firstValueFrom(requester.request(selection, '', 'key-12345678'));
    await firstValueFrom(requester.request(selection, '', 'key-12345678'));
    expect(calls.filter((c) => c.method === 'POST').map((c) => (c.body as object))).toEqual([{ serviceId: 't-1', salidaId: 'd-1', people: 3 }, { serviceId: 't-1', salidaId: 'd-1', people: 3 }]);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.headers?.['Idempotency-Key'])).toEqual(['key-12345678', 'key-12345678']);
  });

  it('shows the refusal of the service, such as a departure without seats, as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'La salida no tiene cupo.', traceId: 't-1' } });
    expect(await firstValueFrom(new ReservationRequesterApi(client).request(selection, '', 'key-12345678')).catch((e) => e)).toMatchObject({ status: 422, userMessage: 'La salida no tiene cupo.' });
  });
});

describe('sourceProvidersOfTheSelfServiceReservation', () => {
  it('provides the panel, the summary and the creation over the container client, with the tenant of the link', () => {
    const injector = Injector.create({ providers: [{ provide: TENANT_IDENTIFIER, useValue: TENANT }, ...sourceProviders(fakeClient().client)] });
    expect(injector.get(MyReservationsSource)).toBeInstanceOf(MyReservationsApiSource);
    expect(injector.get(SelectionQuoteSource)).toBeInstanceOf(SelectionQuoteApiSource);
    expect(injector.get(ReservationRequester)).toBeInstanceOf(ReservationRequesterApi);
  });
});

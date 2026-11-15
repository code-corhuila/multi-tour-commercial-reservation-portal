import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ReservationQuoteApiSource } from '../src/app/http/reservation-quote-api-source';
import { ReservationQuoteSource } from '../src/app/reservations/data/reservation-quote-source';
import { sourceProviders } from '../src/app/sources';
import { fakeClient } from './api-client.double';

const request = { departureId: 'd-1', serviceIds: ['t-1'], people: 3 };
const quote = {
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, transportLine: { ratePerPersonCents: 500, people: 3, amountCents: 1500 },
  projectedValueCents: 7497,
  discounts: [
    { order: 1, discountRuleId: 'r-1', name: 'Temporada baja', calculationBase: 'ORIGINAL_VALUE', baseCents: 7497, amountCents: 750, capCents: 1000, subtotalCents: 6747 },
    { order: 2, name: 'Grupo', calculationBase: 'PREVIOUS_SUBTOTAL', baseCents: 6747, amountCents: 0, subtotalCents: 6747 },
  ],
  finalValueCents: 6747,
};
const tour = { serviceId: 't-1', commercialName: 'Desierto de la Tatacoa' };

// RN-RC4, RN-RC5: the service quotes in cents and the portal shows what it returned; it sends the selection and nothing else.
describe('reservationQuoteOverTheApiClient', () => {
  it('asks the quote route with the tour, the departure and the people only: no tenant, user or value', async () => {
    const { client, calls } = fakeClient({ ok: quote }, { ok: tour });
    await firstValueFrom(new ReservationQuoteApiSource(client).quote(request));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservation-quotes`, method: 'POST', body: { serviceId: 't-1', salidaId: 'd-1', people: 3 } });
  });

  it('answers the lines of the service in cents, the discounts in the order applied with their base, and the tour by its name', async () => {
    const { client, calls } = fakeClient({ ok: quote }, { ok: tour });
    const result = await firstValueFrom(new ReservationQuoteApiSource(client).quote(request));
    expect(calls[1].path).toBe(`${API_BASE}/catalog/services/t-1`);
    expect(result).toEqual({
      services: [{ name: 'Desierto de la Tatacoa', cents: 5997 }], transportCents: 1500, projectedCents: 7497,
      discounts: [{ name: 'Temporada baja', base: 'ORIGINAL_VALUE', amountCents: 750 }, { name: 'Grupo', base: 'PREVIOUS_SUBTOTAL', amountCents: 0 }],
      discountCents: 750, finalCents: 6747,
    });
  });

  it('draws the transport as zero when the quote has no transport line', async () => {
    const { transportLine: _none, ...withoutTransport } = quote;
    const { client } = fakeClient({ ok: { ...withoutTransport, projectedValueCents: 5997, discounts: [], finalValueCents: 5997 } }, { ok: tour });
    expect(await firstValueFrom(new ReservationQuoteApiSource(client).quote(request))).toMatchObject({ transportCents: 0, projectedCents: 5997, discounts: [], discountCents: 0, finalCents: 5997 });
  });

  it('shows the refusal of the service as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'La salida no está abierta.', traceId: 't-1' } }, { ok: tour });
    expect(await firstValueFrom(new ReservationQuoteApiSource(client).quote(request)).catch((e) => e)).toMatchObject({ status: 422, code: 'BUSINESS_RULE_VIOLATION', userMessage: 'La salida no está abierta.' });
  });

  it('is provided over the container client', () => {
    const providers = sourceProviders(fakeClient().client) as { provide: unknown; useValue?: unknown }[];
    expect(providers.find((p) => p.provide === ReservationQuoteSource)?.useValue).toBeInstanceOf(ReservationQuoteApiSource);
  });
});

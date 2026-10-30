import { Injector } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import * as entry from '../src/mount-entry';
import { API_BASE } from '../src/app/http/api-paths';
import { PublicEstablishmentsApiSource, PublicOfferApiSource } from '../src/app/http/public-offer-api-sources';
import { PublicEstablishmentsSource, PublicOfferSource } from '../src/app/public-offer/data/public-offer-sources';
import { PortalApiClient, TENANT_IDENTIFIER } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';

// HU-COM-006 portal spec section 7 and plan D-04, D-05: the public offer over the public routes of the contract
// (GET /public/tenants/{identifier}/tours and /associated-establishments), through the container client only.
interface Call { path: string; method?: string; body?: unknown; headers?: Record<string, string> }
function fakeClient(...replies: Array<{ ok: unknown } | { fail: unknown }>) {
  const calls: Call[] = [];
  const client: PortalApiClient = {
    request: ((path: string, init?: Omit<Call, 'path'>) => {
      calls.push({ path, ...init });
      const reply = replies.shift() ?? { ok: {} };
      return 'fail' in reply ? Promise.reject(reply.fail) : Promise.resolve(reply.ok);
    }) as PortalApiClient['request'],
  };
  return { client, calls };
}
const page = (data: unknown[], extra: { page?: number; totalPages?: number } = {}) => ({ data, meta: { page: extra.page ?? 1, limit: 100, total: data.length, totalPages: extra.totalPages ?? 1 } });
const TENANT = 'agencia-ficticia';
const toursPath = `${API_BASE}/public/tenants/${TENANT}/tours`;
const placesPath = `${API_BASE}/public/tenants/${TENANT}/associated-establishments`;
const tourDto = { serviceId: 't-1', commercialName: 'Caminata Ficticia al Mirador', transportIncluded: true, baseValueCents: 15_000_000, finalValueCents: 13_500_000, discountPercentageBp: 1000, maxTravelers: 12 };
const placeDto = { associationId: 'a-1', establishmentType: 'HOTEL', commercialName: 'Hotel Ficticio del Valle', commercialInformation: 'Hotel de ejemplo con contacto contacto@example.invalid', imageUrl: `${API_BASE}/public/tenants/${TENANT}/associated-establishments/a-1/image` };

describe('publicOfferOverTheApiClient', () => {
  it('reads the tours of the tenant of the link with a plain GET: no body, no key, no token of its own', async () => {
    const { client, calls } = fakeClient({ ok: page([tourDto]) });
    await firstValueFrom(new PublicOfferApiSource(client, () => TENANT).listAvailable('2026-12-01'));
    expect(calls).toEqual([{ path: `${toursPath}?page=1&limit=100` }]);
  });

  it('shows the public projection of a tour with its value in force and never the capacity of the contract answer (RN-PO6)', async () => {
    const { client } = fakeClient({ ok: page([tourDto]) });
    const [tour] = await firstValueFrom(new PublicOfferApiSource(client, () => TENANT).listAvailable('2026-12-01'));
    expect(tour).toEqual({ serviceId: 't-1', commercialName: 'Caminata Ficticia al Mirador', baseRateCents: 15_000_000, transportIncluded: true, available: true, finalValueCents: 13_500_000, discountPercentageBp: 1000 });
  });

  it('follows every page of the offer', async () => {
    const { client, calls } = fakeClient({ ok: page([tourDto], { page: 1, totalPages: 2 }) }, { ok: page([{ ...tourDto, serviceId: 't-2' }], { page: 2, totalPages: 2 }) });
    const tours = await firstValueFrom(new PublicOfferApiSource(client, () => TENANT).listAvailable('2026-12-01'));
    expect(tours.map((t) => t.serviceId)).toEqual(['t-1', 't-2']);
    expect(calls.map((c) => c.path)).toEqual([`${toursPath}?page=1&limit=100`, `${toursPath}?page=2&limit=100`]);
  });

  it('does not invent a date parameter: the contract has none (gap G-SAL), so the same offer answers every date', async () => {
    const { client, calls } = fakeClient({ ok: page([]) }, { ok: page([]) });
    const source = new PublicOfferApiSource(client, () => TENANT);
    await firstValueFrom(source.listAvailable('2026-12-01'));
    await firstValueFrom(source.listAvailable('2027-01-15'));
    expect(calls[0].path).toBe(calls[1].path);
    expect(calls[0].path).not.toContain('2026');
  });

  it('answers an empty offer as an empty list, so the page shows its empty state', async () => {
    const { client } = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new PublicOfferApiSource(client, () => TENANT).listAvailable('2026-12-01'))).toEqual([]);
  });

  it('reads the active establishments of the tenant and projects them without a status of their own', async () => {
    const { client, calls } = fakeClient({ ok: page([placeDto]) });
    const [place] = await firstValueFrom(new PublicEstablishmentsApiSource(client, () => TENANT).listActive());
    expect(calls).toEqual([{ path: `${placesPath}?page=1&limit=100` }]);
    expect(place).toEqual({ establishmentId: 'a-1', establishmentType: 'HOTEL', commercialName: 'Hotel Ficticio del Valle', commercialInformation: placeDto.commercialInformation, imageReference: placeDto.imageUrl, active: true });
  });

  it('puts the tenant identifier in the path encoded, never in a query, a header or a body', async () => {
    const { client, calls } = fakeClient({ ok: page([]) });
    await firstValueFrom(new PublicOfferApiSource(client, () => 'agencia ficticia/1').listAvailable('2026-12-01'));
    expect(calls[0].path.startsWith(`${API_BASE}/public/tenants/agencia%20ficticia%2F1/tours?`)).toBe(true);
    expect(calls[0].headers).toBeUndefined();
    expect(calls[0].body).toBeUndefined();
  });

  it('shows the failure of the service as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'No encontrado.', traceId: 't-1' } });
    const error = await firstValueFrom(new PublicOfferApiSource(client, () => TENANT).listAvailable('2026-12-01')).catch((e) => e);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', userMessage: 'No encontrado.' });
  });

  it('without a tenant identifier sends nothing and fails with a declared error in both ports', async () => {
    const { client, calls } = fakeClient();
    const tours = await firstValueFrom(new PublicOfferApiSource(client, () => null).listAvailable('2026-12-01')).catch((e) => e);
    const places = await firstValueFrom(new PublicEstablishmentsApiSource(client, () => null).listActive()).catch((e) => e);
    expect(tours).toMatchObject({ code: 'NO_TENANT_IDENTIFIER' });
    expect(places).toMatchObject({ code: 'NO_TENANT_IDENTIFIER' });
    expect(calls).toEqual([]);
  });

  it('is provided by the default sources with the identifier the container sent', async () => {
    const { client, calls } = fakeClient({ ok: page([]) }, { ok: page([]) });
    const injector = Injector.create({ providers: [{ provide: TENANT_IDENTIFIER, useValue: TENANT }, ...sourceProviders(client)] });
    expect(injector.get(PublicOfferSource)).toBeInstanceOf(PublicOfferApiSource);
    expect(injector.get(PublicEstablishmentsSource)).toBeInstanceOf(PublicEstablishmentsApiSource);
    await firstValueFrom(injector.get(PublicOfferSource).listAvailable('2026-12-01'));
    await firstValueFrom(injector.get(PublicEstablishmentsSource).listActive());
    expect(calls.map((c) => c.path)).toEqual([`${toursPath}?page=1&limit=100`, `${placesPath}?page=1&limit=100`]);
  });
});

describe('mountEntryHandsTheTenantIdentifierToThePublicOffer', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); host.remove(); });

  it('asks the public tours of the identifier the container mounted with', async () => {
    const paths: string[] = [];
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mount(host, {
      identifier: TENANT,
      apiClient: { request: async (path: string) => { paths.push(path); return page([]); } } as never,
      session: { roles: ['FINAL_CUSTOMER'], open: () => undefined, close: () => undefined },
    });
    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const wait = () => paths.includes(`${toursPath}?page=1&limit=100`) ? resolve() : Date.now() - started > 4000 ? reject(new Error(`asked only ${JSON.stringify(paths)}`)) : setTimeout(wait, 20);
      wait();
    });
  });
});

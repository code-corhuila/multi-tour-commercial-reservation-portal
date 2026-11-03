import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../src/app/http/api-paths';
import { DeparturesApiSource } from '../src/app/http/departures-api-source';
import { PublicDeparturesApiSource } from '../src/app/http/public-offer-api-sources';
import { PublicDeparturesSource } from '../src/app/public-offer/data/public-offer-sources';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { PortalApiClient, TENANT_IDENTIFIER } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';

// HU-COM-006 portal spec A.6b (decision of 2026-11-03, PROPOSED): the departures of a visitor come from the public tour detail
// (GET /public/tenants/{identifier}/tours/{serviceId}, field `departures`), never from the authenticated reader of HU-COM-007.
function fakeClient(...replies: Array<{ ok: unknown } | { fail: unknown }>) {
  const calls: Array<{ path: string; method?: string; body?: unknown; headers?: Record<string, string> }> = [];
  const client: PortalApiClient = {
    request: ((path: string, init?: object) => {
      calls.push({ path, ...init });
      const reply = replies.shift() ?? { ok: {} };
      return 'fail' in reply ? Promise.reject(reply.fail) : Promise.resolve(reply.ok);
    }) as PortalApiClient['request'],
  };
  return { client, calls };
}
const page = (data: unknown[]) => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } });
const TENANT = 'agencia-ficticia';
const toursPath = `${API_BASE}/public/tenants/${TENANT}/tours`;
const tour = (serviceId: string, commercialName: string) => ({ serviceId, commercialName, transportIncluded: false, baseValueCents: 100_000, finalValueCents: 100_000, discountPercentageBp: null, maxTravelers: 12 });
const detail = (serviceId: string, commercialName: string, departures: unknown[]) => ({ ...tour(serviceId, commercialName), departures });

describe('publicDeparturesOverThePublicTourDetail', () => {
  it('reads the public tours and then the public detail of each, with plain GETs and no authenticated route', async () => {
    const { client, calls } = fakeClient(
      { ok: page([tour('t-1', 'Caminata Ficticia'), tour('t-2', 'Rafting Ficticio')]) },
      { ok: detail('t-1', 'Caminata Ficticia', [{ departureId: 'd-1', startsAt: '2027-01-15T13:00:00Z', availableSeats: 8 }]) },
      { ok: detail('t-2', 'Rafting Ficticio', []) });
    await firstValueFrom(new PublicDeparturesApiSource(client, () => TENANT).list());
    expect(calls.map((c) => c.path)).toEqual([`${toursPath}?page=1&limit=100`, `${toursPath}/t-1`, `${toursPath}/t-2`]);
    expect(calls.every((c) => c.method === undefined && c.body === undefined && c.headers === undefined)).toBe(true);
    expect(calls.some((c) => c.path.includes('/catalog/'))).toBe(false);
  });

  it('projects each open departure with the tour name, the start and the seats the service says are free', async () => {
    const { client } = fakeClient(
      { ok: page([tour('t-1', 'Caminata Ficticia')]) },
      { ok: detail('t-1', 'Caminata Ficticia', [{ departureId: 'd-1', startsAt: '2027-01-15T13:00:00Z', availableSeats: 8 }, { departureId: 'd-2', startsAt: '2027-02-01T13:00:00Z', availableSeats: 1 }]) });
    const departures = await firstValueFrom(new PublicDeparturesApiSource(client, () => TENANT).list());
    expect(departures).toEqual([
      { id: 'd-1', tourName: 'Caminata Ficticia', date: '2027-01-15T13:00:00Z', state: 'PROGRAMADA', openForReservations: true, effectiveCapacity: 8, transportPerPersonCents: 0, conditions: '' },
      { id: 'd-2', tourName: 'Caminata Ficticia', date: '2027-02-01T13:00:00Z', state: 'PROGRAMADA', openForReservations: true, effectiveCapacity: 1, transportPerPersonCents: 0, conditions: '' },
    ]);
  });

  it('answers an empty list when no tour has an open departure, and when the tenant offers no tour', async () => {
    const none = fakeClient({ ok: page([tour('t-1', 'Caminata Ficticia')]) }, { ok: detail('t-1', 'Caminata Ficticia', []) });
    expect(await firstValueFrom(new PublicDeparturesApiSource(none.client, () => TENANT).list())).toEqual([]);
    const empty = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new PublicDeparturesApiSource(empty.client, () => TENANT).list())).toEqual([]);
    expect(empty.calls).toHaveLength(1);
  });

  it('without a tenant identifier sends nothing and fails with the declared error', async () => {
    const { client, calls } = fakeClient();
    const error = await firstValueFrom(new PublicDeparturesApiSource(client, () => null).list()).catch((e) => e);
    expect(error).toMatchObject({ code: 'NO_TENANT_IDENTIFIER' });
    expect(calls).toEqual([]);
  });

  it('is provided by the default sources and leaves the authenticated reader of HU-COM-007 as it was', () => {
    const { client } = fakeClient();
    const injector = Injector.create({ providers: [{ provide: TENANT_IDENTIFIER, useValue: TENANT }, ...sourceProviders(client)] });
    expect(injector.get(PublicDeparturesSource)).toBeInstanceOf(PublicDeparturesApiSource);
    expect(injector.get(DeparturesSource)).toBeInstanceOf(DeparturesApiSource);
  });
});

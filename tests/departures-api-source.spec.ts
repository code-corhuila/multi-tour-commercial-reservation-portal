import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { DepartureApiCapacity, DeparturesApiSource } from '../src/app/http/departures-api-source';
import { sourceProviders } from '../src/app/sources';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { DepartureCapacity } from '../src/app/reservations/data/departure-capacity';
import { departureOf } from './reservations.double';
import { fakeClient, page } from './api-client.double';

const tour = (id: string, name: string, over: object = {}) => ({ serviceId: id, serviceType: 'TOUR', commercialName: name, catalogStatus: 'ACTIVE', baseRateCents: 100, ...over });
const open = { departureId: 'd-1', startsAt: '2026-11-07T06:30:00Z', estimatedEndsAt: null, availableSeats: 4, totalSeats: 10, full: false };

describe('departuresOverTheApiClient', () => {
  it('lists the departures of every active tour from the route of the departures of a tour', async () => {
    const { client, calls } = fakeClient({ ok: page([tour('t-1', 'Tatacoa'), tour('t-2', 'Café'), tour('t-3', 'Viejo', { catalogStatus: 'INACTIVE' }), tour('t-4', 'Bus', { serviceType: 'TRANSPORTATION' })]) },
      { ok: page([open]) }, { ok: page([{ ...open, departureId: 'd-2', availableSeats: 0, full: true }]) });
    const all = await firstValueFrom(new DeparturesApiSource(client).list());
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/catalog/services?page=1&limit=100`,
      `${API_BASE}/catalog/services/t-1/departures?page=1&limit=100`, `${API_BASE}/catalog/services/t-2/departures?page=1&limit=100`]);
    expect(all).toEqual([
      { id: 'd-1', tourName: 'Tatacoa', date: '2026-11-07T06:30:00Z', state: 'PROGRAMADA', openForReservations: true, effectiveCapacity: 4, transportPerPersonCents: 0, conditions: '' },
      { id: 'd-2', tourName: 'Café', date: '2026-11-07T06:30:00Z', state: 'PROGRAMADA', openForReservations: false, effectiveCapacity: 0, transportPerPersonCents: 0, conditions: '' },
    ]);
  });

  it('answers an empty list when there is no active tour, without asking for departures', async () => {
    const { client, calls } = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new DeparturesApiSource(client).list())).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('shows the refusal of the service as the page error', async () => {
    const { client } = fakeClient({ ok: page([tour('t-1', 'Tatacoa')]) }, { fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } });
    expect(await firstValueFrom(new DeparturesApiSource(client).list()).catch((e) => e)).toMatchObject({ status: 403, code: 'FORBIDDEN', userMessage: 'Sin permiso.' });
  });
});

// RN-RES-007: the seats are the ones the service says are left; the portal compares and holds none.
describe('departureApiCapacity', () => {
  const capacity = new DepartureApiCapacity();
  it('fits the people that do not exceed the seats left and refuses the rest with the same words as the demo', () => {
    expect(capacity.fits(departureOf(1, { effectiveCapacity: 3 }), 3)).toBe(true);
    expect(capacity.fits(departureOf(1, { effectiveCapacity: 3 }), 4)).toBe(false);
    expect(capacity.refusal(departureOf(1, { effectiveCapacity: 3 }))).toBe('No hay cupo suficiente en esta salida: quedan 3 cupos. No se registró la reserva.');
    expect(capacity.hasSeats(departureOf(1, { effectiveCapacity: 0 }))).toBe(false);
  });
});

describe('sourceProvidersOfTheDepartures', () => {
  it('provides the departures and the seat rule over the container client', () => {
    const providers = sourceProviders(fakeClient().client) as { provide: unknown; useValue?: unknown }[];
    expect(providers.find((p) => p.provide === DeparturesSource)?.useValue).toBeInstanceOf(DeparturesApiSource);
    expect(providers.find((p) => p.provide === DepartureCapacity)?.useValue).toBeInstanceOf(DepartureApiCapacity);
  });
});

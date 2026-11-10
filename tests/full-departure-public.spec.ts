import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoDeparturesStore } from '../src/app/demo/reservations-demo';
import { DepartureApiCapacity } from '../src/app/http/departures-api-source';
import { PublicDeparturesApiSource } from '../src/app/http/public-offer-api-sources';
import { openDepartures } from '../src/app/reservations/model/reservation';
import { PortalApiClient } from '../src/app/shell-contract';

// HU-COM-008, AC-RS.10 (docs #759): the mockup draws "Salida llena" for a full departure (app.js 3233 and 3391) and does not let it be chosen.
// The service sends `full` in each element of `departures` of GET /public/tenants/{identifier}/tours/{serviceId} (api #187).
const TENANT = 'agencia-ficticia';
const page = (data: unknown[]) => ({ data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } });
const tour = { serviceId: 't-1', commercialName: 'Caminata Ficticia', transportIncluded: false, baseValueCents: 100_000, finalValueCents: 100_000, discountPercentageBp: null, maxTravelers: 12 };

function clientWith(departures: unknown[]): PortalApiClient {
  const replies = [page([tour]), { ...tour, departures }];
  return { request: (() => Promise.resolve(replies.shift())) as PortalApiClient['request'] };
}

describe('aFullDepartureOfThePublicDetailReadsAsFullAndStaysListed (AC-RS.10)', () => {
  it('follows the field full: no seats are left, the departure stays in the list and the seat rule says it is full', async () => {
    const client = clientWith([
      { departureId: 'd-1', startsAt: '2027-01-15T13:00:00Z', availableSeats: 2, full: true },
      { departureId: 'd-2', startsAt: '2027-02-01T13:00:00Z', availableSeats: 5, full: false },
    ]);
    const departures = await firstValueFrom(new PublicDeparturesApiSource(client, () => TENANT).list());
    expect(departures.map((d) => [d.id, d.effectiveCapacity])).toEqual([['d-1', 0], ['d-2', 5]]);
    expect(openDepartures(departures).map((d) => d.id)).toEqual(['d-1', 'd-2']);
    const rule = new DepartureApiCapacity();
    expect(departures.map((d) => rule.hasSeats(d))).toEqual([false, true]);
  });
});

describe('theDemoKeepsAFullDeparture (AC-RS.10, delivered portal must show data)', () => {
  it('has a Programada departure of a catalog tour with no seats left, listed among the open ones', async () => {
    const all = await firstValueFrom(new DemoDeparturesStore().list());
    const full = openDepartures(all).filter((d) => d.effectiveCapacity === 0);
    expect(full.length).toBeGreaterThan(0);
    expect(full.every((d) => d.tourName === 'Ruta del café en Pitalito')).toBe(true);
  });
});


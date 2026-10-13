import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoDeparturesStore, DemoReservationsStore, DemoReservationsWriter } from '../src/app/demo/reservations-demo';
import { hasCapacity, openDepartures, validateReservation } from '../src/app/reservations/model/reservation';
import { DemoReservationQuotes } from '../src/app/demo/reservation-quote-demo';
import { AppliedDiscount } from '../src/app/reservations/model/reservation';
import { ReservationDiscounts } from '../src/app/reservations/data/reservation-integrations';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { StubCatalog, StubDepartures, departureOf, serviceOf } from './reservations.double';
import { parseMoney } from '../src/app/shared/money';

const cents = (text: string) => { const parsed = parseMoney(text); if (parsed.kind !== 'valid') throw new Error(text); return parsed.minorUnits; };
/** 007- H-D7: the cents rules now live in the demo quote source, which stands in for the service. */
const quoteOver = (rateCents: number, people: number, transportPerPersonCents: number, apply: (original: number) => readonly AppliedDiscount[] = () => []) =>
  firstValueFrom(new DemoReservationQuotes(new StubDepartures(() => of([departureOf(1, { transportPerPersonCents })])),
    new StubCatalog([serviceOf('Kayak', rateCents)]), new (class extends ReservationDiscounts { override apply(o: number) { return apply(o); } })())
    .quote({ departureId: 'dep-1', serviceIds: ['svc-Kayak'], people }));

describe('departureSelectorOffersOnlyProgramadaAndOpenDepartures', () => {
  it('keeps only departures that are Programada and open for reservations', () => {
    const all = [departureOf(1), departureOf(2, { state: 'CANCELADA' }), departureOf(3, { openForReservations: false }), departureOf(4, { state: 'FINALIZADA' })];
    expect(openDepartures(all).map((d) => d.id)).toEqual(['dep-1']);
  });
});

describe('projectedValueAddsServicesAndPerPersonTransportInCents', () => {
  it('multiplies whole cents read from the text, so 19.99 for 3 people is 5997', async () => {
    const q = await quoteOver(cents('19.99'), 3, cents('5'));
    expect(q.services).toEqual([{ name: 'Kayak', cents: 5997 }]);
    expect(q.transportCents).toBe(1500);
    expect(q.projectedCents).toBe(7497);
    expect(q.finalCents).toBe(7497);
  });

  it('passes the original value to the discount calculation and subtracts each line in order', async () => {
    const bases: number[] = [];
    const q = await quoteOver(1000, 2, 0, (original) => {
      bases.push(original);
      return [{ name: 'Early', base: 'ORIGINAL_VALUE', amountCents: 200 }, { name: 'Group', base: 'PREVIOUS_SUBTOTAL', amountCents: 180 }];
    });
    expect(bases).toEqual([2000]);
    expect(q.discounts.map((d) => d.name)).toEqual(['Early', 'Group']);
    expect(q.finalCents).toBe(1620);
  });
});

describe('missing mandatory data and capacity, as rules', () => {
  const blank = { leadCustomerId: '', departureId: '', serviceIds: [], people: '' };
  it('names each missing datum', () => {
    expect(Object.keys(validateReservation(blank, undefined)).sort()).toEqual(['departureId', 'leadCustomerId', 'people', 'serviceIds']);
  });
  it('refuses zero, decimals and words as a number of people', () => {
    for (const people of ['0', '2.5', 'two', '-1']) {
      expect(validateReservation({ ...blank, people }, departureOf(1)).people).toBeDefined();
    }
  });
  it('refuses more people than the effective capacity, and accepts exactly the capacity', () => {
    const full = { leadCustomerId: 'c', departureId: 'dep-1', serviceIds: ['s'], people: '3' };
    expect(validateReservation(full, departureOf(1, { effectiveCapacity: 2 })).people).toContain('No hay cupo suficiente');
    expect(validateReservation(full, departureOf(1, { effectiveCapacity: 3 }))).toEqual({});
    expect(hasCapacity(departureOf(1, { effectiveCapacity: 3 }), 4)).toBe(false);
  });
});

describe('readOnlyRolesAndUnknownRolesGetNoCreateAction (rule)', () => {
  it('lets only the administrator and the collaborator create', () => {
    expect(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'].map((role) => PortalCapabilities.for(role).canCreateReservations())).toEqual([true, true]);
    expect(['MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY', 'SOMETHING_ELSE', ''].some((role) => PortalCapabilities.for(role).canCreateReservations())).toBe(false);
  });
});

describe('the demo writer', () => {
  const setup = () => {
    const departures = new DemoDeparturesStore(), store = new DemoReservationsStore();
    const open = departures.items.find((d) => d.state === 'PROGRAMADA' && d.openForReservations)!;
    const command = (people: number) => ({ leadCustomerId: 'demo-cus-1', departureId: open.id, serviceIds: ['x'], people });
    const quotes = new DemoReservationQuotes(departures, new StubCatalog([]), new (class extends ReservationDiscounts { override apply() { return []; } })());
    return { departures, store, open, command, writer: new DemoReservationsWriter(store, departures, quotes) };
  };

  it('capacityCheckHoldsNoSeat: neither a refused nor a created reservation changes the effective capacity', async () => {
    const { departures, open, command, writer } = setup();
    const before = departures.items.map((d) => d.effectiveCapacity);
    await expect(firstValueFrom(writer.create(command(open.effectiveCapacity + 1), 'k1'))).rejects.toMatchObject({ code: 'insufficient-capacity' });
    const created = await firstValueFrom(writer.create(command(1), 'k2'));
    expect(created).toMatchObject({ status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false });
    expect(departures.items.map((d) => d.effectiveCapacity)).toEqual(before);
  });

  it('aRetriedCreationReusesItsIdempotencyKey: the same key leaves one reservation', async () => {
    const { store, command, writer } = setup();
    const first = await firstValueFrom(writer.create(command(2), 'same'));
    const again = await firstValueFrom(writer.create(command(2), 'same'));
    expect(again.id).toBe(first.id);
    expect((await firstValueFrom(store.list())).length).toBe(1);
    await firstValueFrom(writer.create(command(2), 'other'));
    expect((await firstValueFrom(store.list())).length).toBe(2);
  });

  it('refuses a departure that is not open', async () => {
    const { departures, command, writer } = setup();
    const closed = departures.items.find((d) => !(d.state === 'PROGRAMADA' && d.openForReservations))!;
    await expect(firstValueFrom(writer.create({ ...command(1), departureId: closed.id }, 'k'))).rejects.toMatchObject({ code: 'departure-not-open' });
  });

  it('holds several open departures and at least one closed, so the filter shows', () => {
    const { departures } = setup();
    expect(openDepartures(departures.items).length).toBeGreaterThan(1);
    expect(departures.items.length).toBeGreaterThan(openDepartures(departures.items).length);
  });
});

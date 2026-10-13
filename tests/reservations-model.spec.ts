import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { parseMoney } from '../src/app/catalog/model/money';
import { DemoDeparturesStore, DemoReservationsStore, DemoReservationsWriter } from '../src/app/demo/reservations-demo';
import { canCreateReservations, hasCapacity, openDepartures, quote, validateReservation } from '../src/app/reservations/model/reservation';
import { departureOf } from './reservations.double';

const cents = (text: string) => { const parsed = parseMoney(text); if (parsed.kind !== 'valid') throw new Error(text); return parsed.minorUnits; };
const none = () => [];

describe('departureSelectorOffersOnlyProgramadaAndOpenDepartures', () => {
  it('keeps only departures that are Programada and open for reservations', () => {
    const all = [departureOf(1), departureOf(2, { state: 'CANCELADA' }), departureOf(3, { openForReservations: false }), departureOf(4, { state: 'FINALIZADA' })];
    expect(openDepartures(all).map((d) => d.id)).toEqual(['dep-1']);
  });
});

describe('projectedValueAddsServicesAndPerPersonTransportInCents', () => {
  it('multiplies whole cents read from the text, so 19.99 for 3 people is 5997', () => {
    const q = quote([{ id: 's', name: 'Kayak', rateCents: cents('19.99') }], 3, departureOf(1, { transportPerPersonCents: cents('5') }), none);
    expect(q.services).toEqual([{ name: 'Kayak', cents: 5997 }]);
    expect(q.transportCents).toBe(1500);
    expect(q.projectedCents).toBe(7497);
    expect(q.finalCents).toBe(7497);
  });

  it('passes the original value to the discount calculation and subtracts each line in order', () => {
    const bases: number[] = [];
    const q = quote([{ id: 's', name: 'A', rateCents: 1000 }], 2, departureOf(1, { transportPerPersonCents: 0 }), (original) => {
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
    expect(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'].map((role) => canCreateReservations({ role }))).toEqual([true, true]);
    expect(['MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY', 'SOMETHING_ELSE', ''].some((role) => canCreateReservations({ role }))).toBe(false);
  });
});

describe('the demo writer', () => {
  const setup = () => {
    const departures = new DemoDeparturesStore(), store = new DemoReservationsStore();
    const open = departures.items.find((d) => d.state === 'PROGRAMADA' && d.openForReservations)!;
    const command = (people: number) => ({ leadCustomerId: 'demo-cus-1', departureId: open.id, serviceIds: ['x'], people,
      quote: { services: [], transportCents: 0, projectedCents: 0, discounts: [], finalCents: 0 } });
    return { departures, store, open, command, writer: new DemoReservationsWriter(store, departures) };
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUITE_NOW } from './setup-clock';

// The delivered demo is opened on any real day: its programmed departures must be ahead, its payment deadlines still running and
// its discount rules in force, with the same relations between them that the screens were designed with (the data is written for 13 oct 2026).
const NOWS = ['2026-11-20T10:00:00-05:00', '2027-02-01T10:00:00-05:00', '2027-12-31T10:00:00-05:00'];
const startOf = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00-05:00`);

async function demoAt(now: string) {
  vi.setSystemTime(new Date(now));
  vi.resetModules();
  const { reservationDemoProviders } = await import('../src/app/demo/reservations-demo');
  const { DemoDiscountRulesStore } = await import('../src/app/demo/discounts-demo');
  const valued = reservationDemoProviders() as { provide: { name: string }; useValue?: unknown }[];
  const value = <T>(name: string) => valued.find((p) => p.provide.name === name)!.useValue as T;
  return {
    now: Date.parse(now),
    departures: value<{ items: { id: string; date: string; state: string }[] }>('DeparturesSource').items,
    reservations: value<{ items: { id: string; departureId?: string; deadline?: { dueAt: string; extendedUntil?: string }; payments?: { presentedAt?: string }[] }[] }>('ReservationsSource').items,
    rules: new DemoDiscountRulesStore().rules,
  };
}

afterEach(() => { vi.setSystemTime(SUITE_NOW); vi.resetModules(); });

describe.each(NOWS)('the demo data when the real day is %s', (now) => {
  it('keeps every programmed departure ahead of the clock', async () => {
    const demo = await demoAt(now);
    const programmed = demo.departures.filter((d) => d.state === 'PROGRAMADA');
    expect(programmed.length).toBeGreaterThanOrEqual(4);
    for (const departure of programmed) expect(startOf(departure.date), departure.id).toBeGreaterThan(demo.now);
  });

  it('keeps the departure of each reservation waiting for payment ahead and its deadline still running', async () => {
    const demo = await demoAt(now);
    const waiting = demo.reservations.filter((r) => r.deadline && r.departureId);
    expect(waiting.map((r) => r.id)).toEqual(expect.arrayContaining(['RES-1842', 'RES-1841']));
    for (const reservation of waiting) {
      const departure = demo.departures.find((d) => d.id === reservation.departureId)!;
      const due = Date.parse(reservation.deadline!.extendedUntil ?? reservation.deadline!.dueAt);
      expect(due, reservation.id).toBeGreaterThan(demo.now);
      expect(due, reservation.id).toBeLessThan(startOf(departure.date));
    }
  });

  it('keeps the proofs presented in the past', async () => {
    const demo = await demoAt(now);
    for (const reservation of demo.reservations) for (const payment of reservation.payments ?? []) {
      if (payment.presentedAt) expect(Date.parse(payment.presentedAt), reservation.id).toBeLessThanOrEqual(demo.now);
    }
  });

  it('keeps the discount rule of the Tatacoa in force and the old one expired', async () => {
    const demo = await demoAt(now);
    const byId = (id: string) => demo.rules.find((r) => r.id === id)!;
    expect(byId('demo-discount-1').validity.inForce).toBe(true);
    expect(byId('demo-discount-3').validity.inForce).toBe(false);
  });
});

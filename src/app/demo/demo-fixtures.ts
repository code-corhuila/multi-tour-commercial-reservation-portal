/**
 * DEMO build only (spec 009- DD-3, G-OPS): the e2e suite asks for seeded situations with ?demoFixtures=a,b and for a clock with
 * ?demoNow=<ISO> on the area address (multi-agents e2e README 2.3, PROPUESTO). Only src/app/demo reads the address; the portal does not.
 */
import { Provider } from '@angular/core';
import { tenantDay } from '../shared/clock';
import { SESSION_IDENTITY, sessionIdentityOf } from '../shared/session-identity';

const query = () => new URLSearchParams(globalThis.location?.search ?? '');

/** The day the demo data was written for (the demo clock of 13 oct 2026): every date below is stored as of that day. */
const DEMO_ANCHOR_DAY = '2026-10-13';
const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/**
 * Moves a seeded date or date-time (YYYY-MM-DD, with or without time and offset) by the whole days between the anchor day and the browser's
 * day (tenant calendar), so the demo keeps its relations (a departure ahead, a deadline soon, a history behind) whatever the real date is.
 * The text keeps its format; ?demoNow does not move the data, it only sets the instant the rules compare against.
 */
export function demoDate(seeded: string): string {
  const shift = dayNumber(tenantDay(Date.now())) - dayNumber(DEMO_ANCHOR_DAY);
  return new Date((dayNumber(seeded.slice(0, 10)) + shift) * DAY_MS).toISOString().slice(0, 10) + seeded.slice(10);
}

/** Fixtures of HU-COM-009: closed-cash-session, full-departure. */
export const demoFixture = (name: string): boolean => (query().get('demoFixtures') ?? '').split(',').includes(name);

/** The demo clock: demoNow when given and valid, else the browser's. */
export function demoNow(): number {
  const asked = Date.parse(query().get('demoNow') ?? '');
  return Number.isNaN(asked) ? Date.now() : asked;
}

/** Fixture of HU-FRT-001 amendment 003: ?demoFixtures=named-session stands in for a container that sends the person's name. */
export const demoSessionProviders = (): Provider[] =>
  demoFixture('named-session') ? [{ provide: SESSION_IDENTITY, useValue: sessionIdentityOf({ displayName: 'Camila Restrepo' }) }] : [];

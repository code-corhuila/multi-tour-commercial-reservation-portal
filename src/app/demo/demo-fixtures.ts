/**
 * DEMO build only (spec 009- DD-3, G-OPS): the e2e suite asks for seeded situations with ?demoFixtures=a,b and for a clock with
 * ?demoNow=<ISO> on the area address (multi-agents e2e README 2.3, PROPUESTO). Only src/app/demo reads the address; the portal does not.
 */
import { Provider } from '@angular/core';
import { SESSION_IDENTITY, sessionIdentityOf } from '../shared/session-identity';

const query = () => new URLSearchParams(globalThis.location?.search ?? '');

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

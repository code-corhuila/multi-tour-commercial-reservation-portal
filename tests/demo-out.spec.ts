import { readFileSync } from 'node:fs';
import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { ActorContext } from '../src/app/shared/actor-context';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { withoutComments } from './source-files';

// Amendment 2026-10-13, HC-1 (plan H-D1, task H-T2): invented people and reservations never reach a tenant.
// The production module registers only adapters over the container client; the demo build swaps
// sources.ts for sources.demo.ts, which registers every in-memory store of src/app/demo/.

describe('productionModuleRegistersNoDemoProvider', () => {
  it.each(['src/mount-entry.ts', 'src/app/sources.ts'])('%s imports nothing from src/app/demo and names no demo store', (file) => {
    const code = withoutComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/from\s+['"][^'"]*\/demo\//);
    expect(code).not.toMatch(/\bDemo[A-Z]\w*|\w+DemoProviders\b|currentDiscountsProviders/);
  });

  it('keeps every in-memory store of the demo build in sources.demo.ts', () => {
    const demo = withoutComments(readFileSync('src/app/sources.demo.ts', 'utf8'));
    for (const store of ['currentDiscountsProviders', 'customersDemoProviders', 'reservationDemoProviders', 'selfServiceDemoProviders']) {
      expect(demo, store).toContain(store);
    }
  });
});

describe('anAreaWhosePortIsMissingIsNotOffered', () => {
  // The administrator and a final customer: every area would be offered to one of them if its port existed.
  const injectorFor = (role: 'TENANT_ADMINISTRATOR' | 'READ_ONLY', roles: string[]) => {
    const actor: ActorContext = actorAs(role);
    return Injector.create({ providers: [
      { provide: ActorContext, useValue: actor },
      { provide: PortalCapabilities, useValue: PortalCapabilities.of(actor) },
      { provide: CustomerContext, useValue: customerContextFor(roles, () => undefined) },
    ] });
  };

  it.each(PORTAL_AREAS.map((area) => [area.key, area] as const))('does not offer %s without its port', (_key, area) => {
    expect(area.isAvailable, 'every area declares the port it needs').toBeDefined();
    expect(area.isAvailable!(injectorFor('TENANT_ADMINISTRATOR', ['TENANT_ADMINISTRATOR']))).toBe(false);
    expect(area.isAvailable!(injectorFor('READ_ONLY', ['FINAL_CUSTOMER']))).toBe(false);
  });
});

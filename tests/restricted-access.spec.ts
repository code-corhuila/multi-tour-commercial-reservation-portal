import { afterEach, describe, expect, it } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

// HU-COM-020: the restricted access of the Administrator of an inactive tenant opens only Reservas and Pagos,
// where the pending proofs, cancellations, refunds and episodes are regularized (the container's operatorNav does the same).
const request = async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } });
const propsFor = (access?: 'restricted' | 'password-change', extra: Partial<MountProps> = {}): MountProps => ({
  apiClient: { request } as never,
  session: { roles: ['TENANT_ADMINISTRATOR'], ...(access && { access }), open: () => undefined, close: () => undefined },
  ...extra,
});

let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (access?: 'restricted' | 'password-change', extra: Partial<MountProps> = {}) => {
  host = document.createElement('div');
  document.body.append(host);
  cleanup = entry.mountWith(host, propsFor(access, extra), demoSources);
};
const menu = () => Array.from(host.querySelectorAll('.crp-operator-nav button')).map((b) => b.textContent?.trim());

afterEach(() => { cleanup?.(); host.remove(); });

describe('restrictedAccessKeepsOnlyReservasAndPagos', () => {
  it('draws only Reservas and Pagos in the menu of a restricted session', async () => {
    mountAs('restricted');
    await expect.poll(() => menu().length).toBeGreaterThan(0);
    expect(menu()).toEqual(['Reservas', 'Pagos']);
  });

  it('lands on Reservas', async () => {
    mountAs('restricted');
    await expect.poll(() => host.querySelector('.crp-operator-content h1')?.textContent).toBeTruthy();
    expect(host.querySelector('.crp-operator-nav .crp-is-active')?.textContent?.trim()).toBe('Reservas');
  });

  it('opens no area outside the regularization work even when the container asks for it', async () => {
    mountAs('restricted', { chrome: 'container', initialParams: { area: 'discounts' } });
    await expect.poll(() => host.querySelector('.crp-operator-content h1')?.textContent).toBeTruthy();
    expect(host.querySelector('.crp-operator-content h1')?.textContent).not.toBe('Descuentos');
  });

  it('keeps the full menu of the Administrator without the restricted access', async () => {
    mountAs();
    await expect.poll(() => menu().length).toBeGreaterThan(2);
    expect(menu()).toEqual(expect.arrayContaining(['Reservas', 'Catálogos', 'Descuentos', 'Pagos']));
  });

  it('does not treat a temporary credential as a restricted one', async () => {
    mountAs('password-change');
    await expect.poll(() => menu().length).toBeGreaterThan(2);
  });
});

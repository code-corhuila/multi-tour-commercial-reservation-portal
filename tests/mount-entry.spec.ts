import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { API_BASE } from '../src/app/http/api-paths';
import type { MountProps } from '../src/app/shell-contract';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';

const rows = (key: string) => [1, 2, 3, 4].map((n) => ({ [key]: 'id' + n, commercialName: 'Row ' + n, serviceType: 'TOUR', catalogStatus: 'ACTIVE', associationStatus: 'ACTIVE', establishmentType: 'HOTEL', commercialInformation: 'info' }));
// The container client, faked: the portal reads whatever this answers, so it must go through apiClient.
const request = vi.fn(async (path: string) => ({ data: rows(path.includes('associated') ? 'associationId' : 'serviceId'), meta: { page: 1, limit: 100, total: 4, totalPages: 1 } }));
const propsFor = (roles: string[]): MountProps => ({
  apiClient: { request } as never,
  session: { roles, open: () => undefined, close: () => undefined },
});

let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (roles: string[]) => {
  host = document.createElement('div');
  document.body.append(host);
  cleanup = entry.mount(host, propsFor(roles));
};
const text = () => host.textContent ?? '';
/** The operator lands on Reservas (AC-P1.17): a list of Catálogos is reached through the hub card. */
const goToCard = async (card: string) => {
  await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
  Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find((b) => b.textContent?.trim() === 'Catálogos')!.click();
  await vi.waitFor(() => expect(host.querySelector('.crp-catalog-grid')).toBeTruthy());
  Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-catalog-grid button')).find((b) => b.textContent?.trim() === card)!.click();
};

afterEach(() => {
  cleanup?.();
  host.remove();
  request.mockClear();
});

describe('mountEntryContract', () => {
  it('exports mount, which paints into the element and whose cleanup empties it', async () => {
    expect(typeof entry.mount).toBe('function');
    mountAs(['TENANT_ADMINISTRATOR']);
    expect(host.classList.contains('crp-root')).toBe(true);
    await vi.waitFor(() => expect(text()).not.toBe(''));
    cleanup!();
    expect(host.innerHTML).toBe('');
  });

  it('shows the demo catalog and establishments with their actions to the administrator', async () => {
    mountAs(['TENANT_ADMINISTRATOR']);
    await goToCard('Ver tours');
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] tbody tr').length).toBeGreaterThan(3));
    expect(text()).toContain(CATALOG_COPY.newItem);
    expect(text()).toMatch(new RegExp(`${CATALOG_COPY.inactivate}|${CATALOG_COPY.reactivate}`));
    await goToCard('Gestionar establecimientos');
    await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain(ESTABLISHMENTS_COPY.title.all));
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] tbody tr').length).toBeGreaterThan(3));
    expect(text()).toContain(ESTABLISHMENTS_COPY.newEstablishment);
  });

  it('fails closed to the client layout for an unknown or empty role: no operator area and no actions', async () => {
    for (const roles of [['SOMETHING_ELSE'], []]) {
      mountAs(roles);
      // The site header, or the compact one of the panel cliente where a visitor without a session lands.
      await vi.waitFor(() => expect(host.querySelector('.crp-client-header, .crp-client-panel-header')).toBeTruthy());
      expect(host.querySelector('.crp-operator-sidebar')).toBeNull();
      // The panel copy names "Desactivar" as prose, so the actions are looked for among the buttons.
      const buttons = Array.from(host.querySelectorAll('button'), (button) => button.textContent?.trim() ?? '').join('|');
      expect(buttons).not.toMatch(new RegExp(`${CATALOG_COPY.newItem}|${CATALOG_COPY.inactivate}|${CATALOG_COPY.reactivate}|${CATALOG_COPY.edit}`));
      cleanup!();
      host.remove();
    }
  });

  it('reads through the container client and makes no direct network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('[data-state="data"]')).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalled();
    expect(request.mock.calls.every(([path]) => path.startsWith(API_BASE))).toBe(true);
    fetchSpy.mockRestore();
  });
});

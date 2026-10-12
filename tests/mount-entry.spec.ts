import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { HUB_COPY } from '../src/app/hub/hub-copy';

const request = vi.fn();
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
const press = (label: string, index = 0) =>
  Array.from(host.querySelectorAll('button')).filter((b) => b.textContent?.trim() === label)[index]!.click();
const openFromHub = async (label: string, index = 0) => {
  await vi.waitFor(() => expect(host.querySelector('.crp-catalog-grid')).toBeTruthy());
  press(label, index);
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
    await openFromHub(HUB_COPY.cards.tours.action);
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] tbody tr').length).toBeGreaterThan(1));
    expect(text()).toContain(CATALOG_COPY.newItem);
    expect(text()).toMatch(new RegExp(`${CATALOG_COPY.inactivate}|${CATALOG_COPY.reactivate}`));
    press(HUB_COPY.back);
    await openFromHub(HUB_COPY.cards.lodging.action, 0);
    await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain(ESTABLISHMENTS_COPY.title.HOTEL));
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] tbody tr').length).toBeGreaterThan(1));
    expect(text()).toContain(ESTABLISHMENTS_COPY.newEstablishment);
  });

  it('fails closed to READ_ONLY for an unknown or empty role: data but no actions', async () => {
    for (const roles of [['SOMETHING_ELSE'], []]) {
      mountAs(roles);
      await openFromHub(HUB_COPY.cards.tours.action);
      await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] tbody tr').length).toBeGreaterThan(0));
      expect(text()).not.toMatch(new RegExp(`${CATALOG_COPY.newItem}|${CATALOG_COPY.inactivate}|${CATALOG_COPY.reactivate}|${CATALOG_COPY.edit}`));
      cleanup!();
      host.remove();
    }
  });

  it('makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('[data-state="data"]')).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

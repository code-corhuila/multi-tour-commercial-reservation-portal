import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';

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
const goToEstablishments = async () => {
  await vi.waitFor(() => expect(host.querySelector('[data-state="data"]')).toBeTruthy());
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Establishments'))!.click();
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
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] li').length).toBeGreaterThan(3));
    expect(text()).toContain('New item');
    expect(text()).toMatch(/Inactivate|Reactivate/);
    await goToEstablishments();
    await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain('Associated establishments'));
    await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] li').length).toBeGreaterThan(3));
    expect(text()).toContain('New establishment');
  });

  it('fails closed to READ_ONLY for an unknown or empty role: data but no actions', async () => {
    for (const roles of [['SOMETHING_ELSE'], []]) {
      mountAs(roles);
      await vi.waitFor(() => expect(host.querySelectorAll('[data-state="data"] li').length).toBeGreaterThan(0));
      expect(text()).not.toMatch(/New item|Inactivate|Reactivate|Edit/);
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

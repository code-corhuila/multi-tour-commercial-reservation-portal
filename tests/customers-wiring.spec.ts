import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWith } from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

const request = vi.fn(async (_path: string) => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }));
let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (roles: string[]) => {
  host = document.createElement('div'); document.body.append(host);
  cleanup = mountWith(host, { apiClient: { request } as never, session: { roles, open: () => undefined, close: () => undefined } }, demoSources);
};
const peopleEntry = () => Array.from(host.querySelectorAll('nav button')).find((b) => b.textContent?.trim() === 'Titular y acompañantes') as HTMLButtonElement | undefined;

afterEach(() => { cleanup?.(); host.remove(); });

describe('customers wiring in the mounted portal', () => {
  it('offers the Titular y acompañantes entry to the administrator and shows the demo group, masked', async () => {
    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(peopleEntry()).toBeTruthy());
    peopleEntry()!.click();
    await vi.waitFor(() => expect(host.querySelector('.customers-page [data-state="data"]')).toBeTruthy());
    expect(host.textContent).toContain('Restringido');
    expect(request.mock.calls.every(([path]) => !String(path).includes('customer'))).toBe(true);
  });

  it('hides the Titular y acompañantes entry from the accountant', async () => {
    mountAs(['ACCOUNTANT']);
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    expect(peopleEntry()).toBeUndefined();
  });
});

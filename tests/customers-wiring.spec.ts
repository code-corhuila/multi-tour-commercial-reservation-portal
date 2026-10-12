import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../src/mount-entry';

const request = vi.fn(async (_path: string) => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }));
let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (roles: string[]) => {
  host = document.createElement('div'); document.body.append(host);
  cleanup = mount(host, { apiClient: { request } as never, session: { roles, open: () => undefined, close: () => undefined } });
};
const peopleEntry = () => Array.from(host.querySelectorAll('nav button')).find((b) => b.textContent?.trim() === 'People') as HTMLButtonElement | undefined;

afterEach(() => { cleanup?.(); host.remove(); });

describe('customers wiring in the mounted portal', () => {
  it('offers the People entry to the administrator and shows the demo group, masked', async () => {
    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(peopleEntry()).toBeTruthy());
    peopleEntry()!.click();
    await vi.waitFor(() => expect(host.querySelector('.customers-page [data-state="data"]')).toBeTruthy());
    expect(host.textContent).toContain('Restringido');
    expect(request.mock.calls.every(([path]) => !String(path).includes('customer'))).toBe(true);
  });

  it('hides the People entry from the accountant', async () => {
    mountAs(['ACCOUNTANT']);
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    expect(peopleEntry()).toBeUndefined();
  });
});

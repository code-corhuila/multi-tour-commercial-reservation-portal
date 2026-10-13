import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { SELF_SERVICE_TEXT } from '../src/app/self-service-reservation/model/self-service-reservation';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

// HU-COM-009 plan D-02 (lesson 5): one demo store per aggregate and per page. The container mounts the
// portal again when the role changes; a reservation created in one mount must still be there in the next.
const propsFor = (roles: string[], initialParams?: Record<string, string>): MountProps => ({
  apiClient: { request: vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } })) } as never,
  session: { roles, open: () => undefined, close: () => undefined },
  initialParams,
});
let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (roles: string[], initialParams?: Record<string, string>) => {
  host = document.createElement('div');
  document.body.append(host);
  cleanup = entry.mountWith(host, propsFor(roles, initialParams), demoSources);
};
const unmount = () => { cleanup?.(); cleanup = undefined; host.remove(); };
afterEach(() => unmount());

describe('theDemoStoreIsOnePerPage', () => {
  it('shows to the operator, after a remount, the reservation the customer created in the previous mount', async () => {
    mountAs(['FINAL_CUSTOMER'], { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' });
    await vi.waitFor(() => expect(host.querySelector('app-confirm-reservation-page select')).toBeTruthy());
    const select = host.querySelector('select') as HTMLSelectElement;
    select.value = select.options[1].value; select.dispatchEvent(new Event('change'));
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.click());
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === SELF_SERVICE_TEXT.confirm)!.click();
    await vi.waitFor(() => expect(host.textContent).toContain('RES-1843'));
    unmount();

    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find((b) => b.textContent?.trim() === 'Reservas')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-state="data"]')?.textContent).toContain('#RES-1843'));
    expect(host.querySelector('[data-state="data"]')?.textContent).toContain('#RES-1842');
  });

  it('hands every mount of the page the same in-memory stores', () => {
    const first = demoSources({} as never), second = demoSources({} as never);
    expect(second).toBe(first);
  });
});

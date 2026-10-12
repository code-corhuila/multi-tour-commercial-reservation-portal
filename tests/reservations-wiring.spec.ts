import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';

// The container client, faked: catalog reads go through it; reservations use their demo stores (gap G-B).
const request = vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }));
let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountAs = (roles: string[]) => {
  host = document.createElement('div');
  document.body.append(host);
  cleanup = entry.mount(host, { apiClient: { request } as never, session: { roles, open: () => undefined, close: () => undefined } } as MountProps);
};
const goToReservations = async () => {
  await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
  Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find((b) => b.textContent?.trim() === 'Reservas')!.click();
  await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain('Reservas'));
};

afterEach(() => { cleanup?.(); host.remove(); request.mockClear(); });

describe('the reservations area is wired into the shell', () => {
  it('offers New reservation to the collaborator through the navigation', async () => {
    mountAs(['OPERATIONAL_COLLABORATOR']);
    await goToReservations();
    await vi.waitFor(() => expect(host.querySelector('[data-state="empty"], [data-state="data"]')).toBeTruthy());
    expect(host.textContent).toContain('Crear reserva');
  });

  it('leaves an unknown role reading, with no create action', async () => {
    mountAs(['SOMETHING_ELSE']);
    await goToReservations();
    await vi.waitFor(() => expect(host.querySelector('[data-state="empty"], [data-state="data"]')).toBeTruthy());
    expect(host.textContent).not.toContain('Crear reserva');
  });
});

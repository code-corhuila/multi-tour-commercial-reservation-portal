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
  // HU-COM-005 amendment A.1 (AC-PC.16): the people are drawn inside 10B, so the sidebar has no item for them.
  it('draws sections 01 and 03 inside Crear reserva and no Titular y acompañantes entry for the administrator', async () => {
    mountAs(['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    expect(peopleEntry()).toBeUndefined();
    await vi.waitFor(() => expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Crear reserva')).toBe(true));
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Crear reserva')!.click();
    await vi.waitFor(() => expect(host.textContent).toContain('01. Cliente titular'));
    expect(host.textContent).toContain('03. Acompañantes');
    expect(request.mock.calls.every(([path]) => !String(path).includes('customer'))).toBe(true);
  });

  it('draws the strip Operador activo with the commercial name the container sends', async () => {
    host = document.createElement('div'); document.body.append(host);
    cleanup = mountWith(host, { apiClient: { request } as never, commercialName: 'Travesía Natural', session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Crear reserva')).toBe(true));
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Crear reserva')!.click();
    await vi.waitFor(() => expect(host.querySelector('.crp-reservations-tenant-context')?.textContent).toContain('Travesía Natural'));
  });

  it('hides the Titular y acompañantes entry from the accountant', async () => {
    mountAs(['ACCOUNTANT']);
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    expect(peopleEntry()).toBeUndefined();
  });
});

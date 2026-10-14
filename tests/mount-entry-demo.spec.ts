import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { SIGN_IN_REQUESTED_EVENT } from '../src/app/self-service-reservation/data/customer-context';
import { SELF_SERVICE_TEXT } from '../src/app/self-service-reservation/self-service-reservation-copy';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

const propsFor = (roles: string[], initialParams?: Record<string, string>): MountProps => ({
  apiClient: { request: vi.fn() } as never,
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
afterEach(() => { cleanup?.(); host.remove(); });

describe('mountEntryWiresTheSelfServiceReservation', () => {
  // The client layout lands on the panel cliente; Ver mis reservas opens the list, and a selection in the URL opens Finalizar reserva at once.
  const openSelfService = async () => {
    await vi.waitFor(() => expect(host.querySelector('.crp-client-content app-client-panel-page')).toBeTruthy());
    Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-panel-card button')).find((b) => b.textContent?.trim() === 'Ver mis reservas')?.click();
    await vi.waitFor(() => expect(host.querySelector('.crp-client-content app-my-reservations-page')).toBeTruthy());
  };
  afterEach(() => history.replaceState(null, '', '/'));

  it('shows the demo reservations of a final customer, read-only', async () => {
    mountAs(['FINAL_CUSTOMER']);
    await openSelfService();
    await vi.waitFor(() => expect(host.querySelectorAll('.self-service-panel [data-state="data"] li').length).toBeGreaterThan(0));
    // No action on a reservation but the ones of the mockup card that only open screens: Responder propuesta of HU-COM-018 (24A), Continuar pago and
    // Ver pagos y comprobantes of HU-COM-014 (24 and Mis pagos); and no back link in the body.
    const labels = Array.from(host.querySelectorAll('.self-service-panel button'), (b) => b.textContent?.trim());
    expect(new Set(labels)).toEqual(new Set(['Responder propuesta', 'Continuar pago', 'Ver pagos y comprobantes']));
    expect(labels.filter((l) => l === 'Responder propuesta')).toEqual(['Responder propuesta']);
    expect(host.querySelector('.crp-client-panel-header')?.textContent).toContain('Volver al panel');
    expect(host.querySelector('.self-service-panel')?.textContent).toContain('Pendiente de pago');
    for (const raw of ['PENDING_PAYMENT', 'SIN_PAGO', 'demo-dep-1', 'demo-res']) expect(host.textContent).not.toContain(raw);
  });

  // 008- H-D10: the container hands the selection over in initialParams and keeps it across the sign-in; the portal reads no address.
  it('without a session, confirming asks the container to sign in and leaves the address alone', async () => {
    history.replaceState(null, '', '/reserve');
    mountAs([], { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' });
    const asked = vi.fn();
    host.addEventListener(SIGN_IN_REQUESTED_EVENT, asked);
    await vi.waitFor(() => expect(host.querySelector('.crp-client-content app-confirm-reservation-page select')).toBeTruthy());
    const select = host.querySelector('select') as HTMLSelectElement;
    select.value = select.options[1].value; select.dispatchEvent(new Event('change'));
    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.click());
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === SELF_SERVICE_TEXT.confirm)!.click();
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    expect(location.pathname + location.search).toBe('/reserve');
  });
});

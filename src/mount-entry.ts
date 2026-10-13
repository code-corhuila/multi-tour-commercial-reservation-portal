import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { PortalShellComponent } from './app/portal-shell.component';
import { MountProps } from './app/shell-contract';
import { sourceProviders } from './app/sources';
import { currentDiscountsProviders } from './app/demo/current-discounts-demo';
import { customersDemoProviders } from './app/demo/customers-demo';
import { reservationDemoProviders } from './app/demo/reservations-demo';
import { selfServiceDemoProviders } from './app/demo/self-service-reservation-demo';
import { CustomerContext, customerContextFor, SIGN_IN_REQUESTED_EVENT } from './app/self-service-reservation/data/customer-context';
import { roleOf } from './app/shared/portal-capabilities';
import { ActorContext } from './app/shared/actor-context';

/** Portals mounted now; the stylesheet leaves with the last one (001- amendment HC-5, plan H-D4). */
let mounted = 0;

/** One <link> to the portal CSS, next to this module, however many times the portal is mounted. */
export function ensureStylesheet(): void {
  if (document.querySelector('link[data-crp-stylesheet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('commercial-reservation-portal.css', import.meta.url).href;
  link.dataset['crpStylesheet'] = '';
  document.head.append(link);
}

/** ADR-006 F4 contract. Sources come from ./app/sources (apiClient by default, in memory in the demo build). */
export function mount(element: HTMLElement, props: MountProps): () => void {
  ensureStylesheet();
  mounted += 1;
  element.classList.add('crp-root');
  const actor = new (class extends ActorContext { override readonly role = roleOf(props.session.roles); })();
  let app: ApplicationRef | undefined;
  let cleaned = false;
  const release = () => {
    app?.destroy();  // no-op when never created
    element.replaceChildren();
    element.classList.remove('crp-root');
    mounted -= 1;
    if (mounted === 0) document.querySelector('link[data-crp-stylesheet]')?.remove();
  };
  createApplication({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ActorContext, useValue: actor },
      ...sourceProviders(props.apiClient),
      ...currentDiscountsProviders(), // DEMO until G-API: no adapter over apiClient yet (DD-1)
      ...customersDemoProviders(props.session.roles),
      ...reservationDemoProviders(),
      // HU-COM-008 (DP-RS1, DP-RS2): customer standing from the session roles; sign-in is asked of the container.
      { provide: CustomerContext, useValue: customerContextFor(props.session.roles, () => element.dispatchEvent(new CustomEvent(SIGN_IN_REQUESTED_EVENT, { bubbles: true }))) },
      ...selfServiceDemoProviders(),
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(PortalShellComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}

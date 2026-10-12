import { ApplicationRef, Injector, Provider, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { PortalShellComponent } from './app/portal-shell.component';
import { CONTAINER_NAVIGATION, MountProps, PortalApiClient } from './app/shell-contract';
import { sourceProviders } from './app/sources';
import { reservationDemoProviders } from './app/demo/reservations-demo';

const withCancellation = (injector: Injector) => injector.get(CancellationQuote, null) !== null;

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
  return mountWith(element, props, sourceProviders);
}

/** The same mount over other sources: the in-memory stores of sources.demo.ts in tests (001- HC-1). */
export function mountWith(element: HTMLElement, props: MountProps, sources: (client: PortalApiClient) => Provider[]): () => void {
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
      ...reservationDemoProviders(),
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(PortalShellComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}

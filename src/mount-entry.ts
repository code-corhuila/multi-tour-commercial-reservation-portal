import { ApplicationRef, Injector, Provider, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { PortalShellComponent } from './app/portal-shell.component';
import { MountProps, PortalApiClient } from './app/shell-contract';
import { sourceProviders } from './app/sources';
import { SensitiveDataAccess, sensitiveDataAccessFor } from './app/customers/data/customers-source';
import { CustomerContext, customerContextFor, SIGN_IN_REQUESTED_EVENT } from './app/self-service-reservation/data/customer-context';
import { ReservationSelectionSource, selectionSourceFor } from './app/self-service-reservation/data/reservation-confirmation-ports';
import { roleOf } from './app/shared/portal-capabilities';
import { ActorContext } from './app/shared/actor-context';
import { PAYMENTS_DETAIL_BLOCK } from './app/payments/components/reservation-payments-block.component';
import { PAYMENTS_CHECKOUT_BLOCK } from './app/payments/components/checkout-payment-block.component';
import { CHECKOUT_BLOCKS, RESERVATION_DETAIL_BLOCKS, contribute } from './app/shared/portal-slots';
import { RESERVATION_DETAIL_ACTIONS } from './app/shared/portal-slots';
import { CancellationQuote, cancellationChangeType } from './app/reservation-changes/data/cancellation-ports';
import { RESERVATION_CHANGE_TYPES } from './app/reservation-changes/data/reservation-change-types';
import { ReservationChangeActionComponent } from './app/reservation-changes/components/reservation-change-action.component';
import { ReservationChangeBlocksComponent } from './app/reservation-changes/components/reservation-change-blocks.component';
import { provideTravellersModification } from './app/reservation-changes/travellers-modification/data/modification-ports';

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
      // Adapters over the container client; the demo build swaps in every in-memory store (001- HC-1).
      ...sources(props.apiClient),
      { provide: SensitiveDataAccess, useValue: sensitiveDataAccessFor(props.session.roles) },
      // HU-COM-008 (DP-RS1, DP-RS2): customer standing from the session roles; sign-in is asked of the container.
      { provide: CustomerContext, useValue: customerContextFor(props.session.roles, () => element.dispatchEvent(new CustomEvent(SIGN_IN_REQUESTED_EVENT, { bubbles: true }))) },
      { provide: ReservationSelectionSource, useValue: selectionSourceFor(props.initialParams) },
      // HU-COM-009: Pagos y soportes of 10A and Gestionar pago of 10C, drawn only with the payment ports.
      contribute(RESERVATION_DETAIL_BLOCKS, PAYMENTS_DETAIL_BLOCK),
      // HU-COM-013: the 10A action and blocks, and the Cancelación type; each only with the cancellation ports of the build.
      contribute(RESERVATION_DETAIL_ACTIONS, { component: ReservationChangeActionComponent, order: 0, isAvailable: withCancellation }),
      contribute(RESERVATION_DETAIL_BLOCKS, { component: ReservationChangeBlocksComponent, order: 10, isAvailable: withCancellation }),
      { provide: RESERVATION_CHANGE_TYPES, multi: true, useFactory: cancellationChangeType },
      // HU-COM-009: Método y plazo de pago of 21.
      contribute(CHECKOUT_BLOCKS, PAYMENTS_CHECKOUT_BLOCK),
      // HU-COM-012: "Modificación de viajeros", after Cancelación, on the screen of HU-COM-013 only (its area needs the cancellation ports).
      provideTravellersModification(),
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(PortalShellComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}

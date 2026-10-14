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
import { SESSION_IDENTITY, sessionIdentityOf } from './app/shared/session-identity';
import { PAYMENTS_DETAIL_BLOCK } from './app/payments/components/reservation-payments-block.component';
import { PAYMENTS_CHECKOUT_BLOCK } from './app/payments/components/checkout-payment-block.component';
import { CHECKOUT_BLOCKS, OPERATOR_NOTIFICATIONS, PAYMENTS_PAGE_PANELS, RESERVATION_DETAIL_BLOCKS, contribute } from './app/shared/portal-slots';
import { REFUND_DETAIL_LINK } from './app/refunds/components/refund-link.component';
import { REFUND_ALERTS } from './app/refunds/components/refund-alerts.component';
import { REFUNDS_PAYMENTS_PANEL } from './app/refunds/components/refunds-panel.component';
import { RESERVATION_DETAIL_ACTIONS } from './app/shared/portal-slots';
import { CREDIT_BALANCE_PAYMENTS_LINK } from './app/credit-balance/components/credit-balance-links.component';
import { CancellationQuote, cancellationChangeType } from './app/reservation-changes/data/cancellation-ports';
import { RESERVATION_CHANGE_TYPES } from './app/reservation-changes/data/reservation-change-types';
import { ReservationChangeActionComponent } from './app/reservation-changes/components/reservation-change-action.component';
import { ReservationChangeBlocksComponent } from './app/reservation-changes/components/reservation-change-blocks.component';
import { PROOF_REVIEW_CONTRIBUTIONS } from './app/payments/components/proof-review-actions.component';
import { PAYMENT_FOLLOWUP_CONTRIBUTIONS } from './app/payments/components/pending-payment-rows.component';
import { provideTravellersModification } from './app/reservation-changes/travellers-modification/data/modification-ports';
import { MY_PAYMENTS_CONTRIBUTIONS } from './app/my-payments/components/my-payments-panel.component';
import { RESCHEDULING_ENTRY } from './app/rescheduling/components/rescheduling-entry.component';
import { RESCHEDULING_CONTRIBUTIONS } from './app/rescheduling/components/rescheduling-contributions.component';

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
      // HU-FRT-001 amendment 003: the name and the initials of the session, before the sources so a demo fixture may stand in.
      { provide: SESSION_IDENTITY, useValue: sessionIdentityOf(props.session) },
      ...sources(props.apiClient),
      { provide: SensitiveDataAccess, useValue: sensitiveDataAccessFor(props.session.roles) },
      // HU-COM-008 (DP-RS1, DP-RS2): customer standing from the session roles; sign-in is asked of the container.
      { provide: CustomerContext, useValue: customerContextFor(props.session.roles, () => element.dispatchEvent(new CustomEvent(SIGN_IN_REQUESTED_EVENT, { bubbles: true }))) },
      { provide: ReservationSelectionSource, useValue: selectionSourceFor(props.initialParams) },
      // HU-COM-009: Pagos y comprobantes of 10A and Gestionar pago of 10C, drawn only with the payment ports.
      contribute(RESERVATION_DETAIL_BLOCKS, PAYMENTS_DETAIL_BLOCK),
      // HU-COM-013: the 10A action and blocks, and the Cancelación type; each only with the cancellation ports of the build.
      contribute(RESERVATION_DETAIL_ACTIONS, { component: ReservationChangeActionComponent, order: 0, isAvailable: withCancellation }),
      contribute(RESERVATION_DETAIL_BLOCKS, { component: ReservationChangeBlocksComponent, order: 10, isAvailable: withCancellation }),
      { provide: RESERVATION_CHANGE_TYPES, multi: true, useFactory: cancellationChangeType },
      // HU-COM-009: Método y plazo de pago of 21.
      contribute(CHECKOUT_BLOCKS, PAYMENTS_CHECKOUT_BLOCK),
      // HU-COM-010: Validar comprobante of 10, 10A and 13, the review history of 13 and the review limit of 24; only with the review port.
      ...PROOF_REVIEW_CONTRIBUTIONS,
      // HU-COM-011: the Saldo pendiente rows of 13 and the departure start sentence of 21 and 24; only with its ports.
      ...PAYMENT_FOLLOWUP_CONTRIBUTIONS,
      // HU-COM-012: "Modificación de viajeros", after Cancelación, on the screen of HU-COM-013 only (its area needs the cancellation ports).
      provideTravellersModification(),
      // HU-COM-014: Continuar pago, Mis pagos and the proof notice of 17, and the economic lines of Mis reservas; each only with its port.
      ...MY_PAYMENTS_CONTRIBUTIONS,
      // HU-COM-016: "Devoluciones monetarias" of 13, only for who authorizes or executes and with the refund ports.
      contribute(PAYMENTS_PAGE_PANELS, REFUNDS_PAYMENTS_PANEL),
      // HU-COM-016: "Gestionar devolución" of 10A after the HU-COM-013 blocks, and the alert of admin-notificaciones.html.
      contribute(RESERVATION_DETAIL_BLOCKS, REFUND_DETAIL_LINK), contribute(OPERATOR_NOTIFICATIONS, REFUND_ALERTS),
      // HU-COM-018 DP-RP4 (owner decision): Propuesta de reprogramación in the 10A header, after the HU-COM-013 action.
      RESCHEDULING_ENTRY,
      // HU-COM-018: Salida propuesta, the mark and Responder propuesta of Mis reservas, and the notice of 17; only with the proposals port.
      ...RESCHEDULING_CONTRIBUTIONS,
      // HU-COM-017 amendment: the link to admin-saldo-favor.html from 13 (the one from 10A is pending, second branch).
      contribute(PAYMENTS_PAGE_PANELS, CREDIT_BALANCE_PAYMENTS_LINK),
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(PortalShellComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}

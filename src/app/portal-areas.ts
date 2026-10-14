import { AbstractType, InjectionToken, Injector, Type } from '@angular/core';
import { CatalogHubPageComponent } from './catalog/pages/catalog-hub-page.component';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { CurrentDiscountsSource } from './current-discounts/data/current-discounts-source';
import { CurrentDiscountsPageComponent } from './current-discounts/pages/current-discounts-page.component';
import { CustomersSource } from './customers/data/customers-source';
import { CustomersPageComponent } from './customers/pages/customers-page.component';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { DiscountsPageComponent } from './discounts/pages/discounts-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { GastronomyOfferPageComponent, LodgingOfferPageComponent } from './public-offer/pages/establishments-offer-page.component';
import { PublicOfferPageComponent } from './public-offer/pages/public-offer-page.component';
import { ReservationsSource } from './reservations/data/reservations-source';
import { ReservationsPageComponent } from './reservations/pages/reservations-page.component';
import { CustomerContext } from './self-service-reservation/data/customer-context';
import { ClientPanelPageComponent } from './self-service-reservation/pages/client-panel-page.component';
import { RESERVATION_FLOW } from './self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from './self-service-reservation/pages/confirm-reservation-page.component';
import { MyReservationsPageComponent } from './self-service-reservation/pages/my-reservations-page.component';
import { ReserveTourPageComponent } from './self-service-reservation/pages/reserve-tour-page.component';
import { Audience } from './portal-audience';
import { CLIENT_AREA } from './portal-navigation';
import { PortalCapabilities } from './shared/portal-capabilities';
import { CatalogItemsSource } from './catalog/data/catalog-api.service';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { PublicEstablishmentsSource, PublicOfferSource } from './public-offer/data/public-offer-sources';
import { DeparturesSource } from './reservations/data/departures-source';
import { ReservationQuoteSource } from './reservations/data/reservation-quote-source';
import { MyReservationsSource } from './self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource } from './self-service-reservation/data/reservation-confirmation-ports';
import { CancellationQuote, CancellationWriter } from './reservation-changes/data/cancellation-ports';
import { RESERVATION_CHANGE_SCREEN } from './reservation-changes/data/reservation-change-types';
import { ReservationChangePageComponent } from './reservation-changes/pages/reservation-change-page.component';
import { TransferPaymentPageComponent } from './payments/pages/transfer-payment-page.component';
import { PaymentReceivedPageComponent, PaymentRejectedPageComponent } from './payments/pages/payment-result-pages.component';
import { PAYMENT_RESULT_AREA } from './payments/payment-result-copy';
import { PendingProofsSource, ProofReviewWriter } from './payments/data/proof-review-ports';
import { PaymentsPageComponent } from './payments/pages/payments-page.component';
import { ValidateProofPageComponent } from './payments/pages/validate-proof-page.component';
import { PaymentDeadlineReader, PaymentFollowupsWriter } from './payments/data/payment-followup-ports';
import { PaymentFollowupPageComponent } from './payments/pages/payment-followup-page.component';
import { MyPaymentsSource } from './my-payments/data/my-payments-source';
import { MyPaymentsPageComponent } from './my-payments/pages/my-payments-page.component';
import { REFUND_SCREENS, refundsAvailable } from './refunds/data/refunds-ports';
import { RefundDetailPageComponent } from './refunds/pages/refund-detail-page.component';
import { RefundRequestsPageComponent } from './refunds/pages/refund-requests-page.component';
import { MyProposalsSource, PROPOSAL_AREA, ProposalAnswerWriter, RESCHEDULING_AREA, ReschedulingSource, ReschedulingWriter } from './rescheduling/data/rescheduling-ports';
import { ReschedulingProposalPageComponent } from './rescheduling/pages/rescheduling-proposal-page.component';
import { ReschedulingPageComponent } from './rescheduling/pages/rescheduling-page.component';

/** Re-exported for the registry's readers; it lives in portal-navigation.ts so a page can import it without a cycle. */
export { CLIENT_AREA };

/** One area of the shell: an item of the operator sidebar, or a client page opened by the client header, footer or a page. */
export interface PortalArea {
  readonly key: string;
  /** Spanish label of the authorized screen's menu. */
  readonly label: string;
  readonly component: Type<unknown>;
  /** Drawn only when this answers true; absent means always drawn. */
  readonly isAvailable?: (injector: Injector) => boolean;
  /** Who sees it (PortalAudience): the operator sidebar, the default, or the client header. */
  readonly audience?: Audience;
  /** Client chrome: 'site' (tours.html header and footer, the default), 'panel' (compact header of panel-cliente.html, no footer)
   *  or 'none' (a flow screen that draws its own top bar). */
  readonly clientChrome?: 'site' | 'panel' | 'none';
  /** false: a sub-screen opened with PortalNavigation.open from another area, with no sidebar item of its own. */
  readonly menu?: false;
  /** The key of the sidebar item that stays active while this sub-screen is open (Reservas on screen 13). */
  readonly parent?: string;
}

/** 001- HC-1: an area is offered only when the build supplies its ports (an adapter, or a store of the demo build). */
const has = (injector: Injector, ...ports: readonly AbstractType<unknown>[]) => ports.every((port) => injector.get(port, null) !== null);
const isCustomerOrVisitor = (injector: Injector) => injector.get(CustomerContext).standing !== 'OTHER';

/** The areas the shell draws; PORTAL_AREAS unless a test provides others. */
export const PORTAL_AREA_LIST = new InjectionToken<readonly PortalArea[]>('PORTAL_AREA_LIST', { factory: () => PORTAL_AREAS });

/** The sidebar, in order. A new story appends ONE entry here; the shell is not edited. */
export const PORTAL_AREAS: readonly PortalArea[] = Object.freeze([
  // HU-COM-001 (mockup PDR v1.9, AC-P1.17): the operator lands on Reservas, and this story owns the order of the sidebar.
  // Only in a build that supplies reservations (no API contract for them yet, gap G-B).
  { key: 'reservations', label: 'Reservas', component: ReservationsPageComponent, isAvailable: (injector) => has(injector, ReservationsSource, ReservationQuoteSource) },
  // HU-COM-001 admin-catalogos.html (the hub), whose cards open the tour list and, for the Administrator, the establishments.
  { key: 'catalog', label: 'Catálogos', component: CatalogHubPageComponent, isAvailable: (injector) => has(injector, CatalogItemsSource) },
  { key: 'catalog-tours', label: 'Gestionar catálogo de tours', component: CatalogPageComponent, menu: false, parent: 'catalog',
    isAvailable: (injector) => has(injector, CatalogItemsSource) },
  // HU-COM-002: no longer a sidebar item (it was visible to the Collaborator); the hub opens it with { type }.
  { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent, menu: false, parent: 'catalog',
    isAvailable: (injector) => has(injector, AssociatedEstablishmentsSource) },
  {
    key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent,
    // DP-09 role guard, and only in a build that supplies discount rules (no API contract for them yet).
    isAvailable: (injector) => canManageDiscounts(injector.get(ActorContext)) && injector.get(DiscountRulesSource, null) !== null,
  },
  // HU-COM-004: every role reads the values; drawn only in a build that supplies them.
  { key: 'current-discounts', label: 'Descuentos vigentes', component: CurrentDiscountsPageComponent,
    isAvailable: (injector) => has(injector, CurrentDiscountsSource) },
  // HU-COM-006: the read-only public offer, the client pages of tours.html, alojamiento.html and gastronomia.html.
  { key: CLIENT_AREA.tours, label: 'Explorar', component: PublicOfferPageComponent, audience: 'customer',
    isAvailable: (injector) => has(injector, PublicOfferSource) },
  { key: CLIENT_AREA.lodging, label: 'Alojamiento', component: LodgingOfferPageComponent, audience: 'customer',
    isAvailable: (injector) => has(injector, PublicEstablishmentsSource) },
  { key: CLIENT_AREA.gastronomy, label: 'Gastronomía', component: GastronomyOfferPageComponent, audience: 'customer',
    isAvailable: (injector) => has(injector, PublicEstablishmentsSource) },
  {
    key: 'customers', label: 'Titular y acompañantes', component: CustomersPageComponent,
    // Plan D-07 role guard, and only in a build that supplies the customers sources (no API contract for them yet, spec G-B).
    isAvailable: (injector) => injector.get(PortalCapabilities).customers().canRead && has(injector, CustomersSource),
  },
  // HU-COM-008: panel-cliente.html, the landing of the customer and the Mis reservas link of the client header.
  {
    key: CLIENT_AREA.panel, label: 'Mis reservas', component: ClientPanelPageComponent, audience: 'customer', clientChrome: 'panel',
    isAvailable: (injector) => injector.get(CustomerContext).standing !== 'OTHER',
  },
  {
    key: CLIENT_AREA.reservations, label: 'Mis reservas', component: MyReservationsPageComponent, audience: 'customer', clientChrome: 'panel',
    isAvailable: (injector) => injector.get(CustomerContext).standing !== 'OTHER',
  },
  // HU-COM-008 reservar-tour.html: opened by "Reservar tour" of the offer with { tour }.
  {
    key: RESERVATION_FLOW.reserve, label: 'Reservar tour', component: ReserveTourPageComponent, audience: 'customer', clientChrome: 'none',
    isAvailable: (injector) => injector.get(CustomerContext).standing !== 'OTHER',
  },
  // HU-COM-008 finalizar-reserva.html, opened by "Continuar reserva" with { departure, services, people }.
  // DP-RS2: the final customer, or a visitor without a session who is asked to sign in on confirming.
  {
    key: RESERVATION_FLOW.finish, label: 'Finalizar reserva', component: ConfirmReservationPageComponent, audience: 'customer', clientChrome: 'none',
    isAvailable: (injector) => injector.get(CustomerContext).standing !== 'OTHER',
  },
  // HU-COM-013 admin-cancelar-modificar-reserva.html, opened from 10A with { reservation }; Reservas stays active (spec G-NAV closed by the base).
  { key: RESERVATION_CHANGE_SCREEN, label: 'Cancelar o modificar reserva', component: ReservationChangePageComponent, menu: false, parent: 'reservations',
    isAvailable: (injector) => injector.get(PortalCapabilities).canRegisterChange() && has(injector, ReservationsSource, CancellationQuote, CancellationWriter) },
  // HU-COM-009 pago-transferencia.html (24): opened by Continuar al pago of 21 with { reservation, type, amount }.
  { key: 'transfer-payment', label: 'Pago por transferencia', component: TransferPaymentPageComponent, audience: 'customer', clientChrome: 'none', menu: false,
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyReservationsSource, PaymentsWriter, PaymentMethodsSource) },
  // HU-COM-009 pago-exitoso.html (22, "Comprobante recibido") and pago-fallido.html (23, "Comprobante rechazado"), PROPUESTO: opened with { reservation };
  // 22 by the proof sent on 24, 23 by whoever knows a proof was rejected. They read the own reservation through Mis pagos' port.
  { key: PAYMENT_RESULT_AREA.received, label: 'Comprobante recibido', component: PaymentReceivedPageComponent, audience: 'customer', clientChrome: 'none', menu: false,
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyPaymentsSource) },
  { key: PAYMENT_RESULT_AREA.rejected, label: 'Comprobante rechazado', component: PaymentRejectedPageComponent, audience: 'customer', clientChrome: 'none', menu: false,
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyPaymentsSource) },
  // HU-COM-010 admin-pagos.html (13), item Pagos of the mockup's sidebar, and admin-validar-soporte.html opened with { reservation, payment }.
  { key: 'payments', label: 'Pagos', component: PaymentsPageComponent, isAvailable: (injector) => has(injector, PendingProofsSource, ProofReviewWriter, PaymentMethodsSource) },
  { key: 'payments-validate', label: 'Validar comprobante', component: ValidateProofPageComponent, menu: false, parent: 'payments',
    isAvailable: (injector) => has(injector, ReservationsSource, ProofReviewWriter, PaymentMethodsSource) },
  // HU-COM-011 admin-registrar-seguimiento.html, opened by Registrar seguimiento of 13 with { reservation }; Pagos stays active.
  { key: 'payments-followup', label: 'Registrar seguimiento', component: PaymentFollowupPageComponent, menu: false, parent: 'payments',
    isAvailable: (injector) => injector.get(PortalCapabilities).canFollowUp() && has(injector, ReservationsSource, PaymentFollowupsWriter, PaymentDeadlineReader, PaymentMethodsSource) },
  // HU-COM-014 mis-pagos.html, opened by Mis pagos of 17; read only, under the compact header of the panel (Volver al panel).
  { key: CLIENT_AREA.payments, label: 'Mis pagos', component: MyPaymentsPageComponent, audience: 'customer', clientChrome: 'panel', menu: false,
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyPaymentsSource) },
  // HU-COM-016 admin-solicitudes-devolucion.html and admin-detalle-devolucion.html with { refund }, sub-screens of 13; Pagos stays active.
  { key: REFUND_SCREENS.requests, label: 'Solicitudes de devolución', component: RefundRequestsPageComponent, menu: false, parent: 'payments', isAvailable: refundsAvailable },
  { key: REFUND_SCREENS.detail, label: 'Detalle de devolución', component: RefundDetailPageComponent, menu: false, parent: 'payments', isAvailable: refundsAvailable },
  // HU-COM-016 admin-gestionar-devolucion.html (from 10A) and admin-tratamiento-pendiente-devolucion.html, whose decision is the Administrator's.
  { key: REFUND_SCREENS.manage, label: 'Gestionar devolución', component: RefundManagePageComponent, menu: false, parent: 'payments', isAvailable: refundsAvailable },
  { key: REFUND_SCREENS.treatment, label: 'Tratamiento pendiente de devolución', component: RefundTreatmentPageComponent, menu: false, parent: 'payments',
    isAvailable: (injector) => injector.get(PortalCapabilities).canAuthorizeRefund() && refundsAvailable(injector) },
  // HU-COM-016 admin-notificaciones.html, item Notificaciones of the mockup's sidebar, while some alert is offered (DP-RF6).
  { key: 'notifications', label: 'Notificaciones', component: NotificationsPageComponent, isAvailable: hasNotifications },
  // HU-COM-018 admin-reprogramar-reserva.html: opened from the 10A header with { reservation } (DP-RP4); every operator reads it, Reservas stays active.
  { key: RESCHEDULING_AREA, label: 'Propuesta de reprogramación', component: ReschedulingPageComponent, menu: false, parent: 'reservations',
    isAvailable: (injector) => has(injector, ReschedulingSource, ReschedulingWriter) },
  // HU-COM-018 propuesta-reprogramacion.html (24A): opened by Responder propuesta of Mis reservas and of 17 with { reservation }; its own top bar.
  { key: PROPOSAL_AREA, label: 'Propuesta de reprogramación', component: ReschedulingProposalPageComponent, audience: 'customer', clientChrome: 'none', menu: false,
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyProposalsSource, ProposalAnswerWriter) },
]);

export interface ClientLink { readonly key: string; readonly label: string }

/** Links of tours.html (header center, header right Mis reservas (Perfil is the container's, see PROFILE_TARGET), footer Explorar) and of the compact header: panel, other panel areas. */
export const CLIENT_LINKS: Readonly<Record<'nav' | 'account' | 'footer' | 'panel', readonly ClientLink[]>> = Object.freeze({
  nav: [{ key: CLIENT_AREA.tours, label: 'Explorar' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
  account: [{ key: CLIENT_AREA.reservations, label: 'Mis reservas' }],
  panel: [{ key: CLIENT_AREA.tours, label: 'Ver catálogo' }, { key: CLIENT_AREA.panel, label: 'Volver al panel' }],
  footer: [{ key: CLIENT_AREA.tours, label: 'Tours' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
});

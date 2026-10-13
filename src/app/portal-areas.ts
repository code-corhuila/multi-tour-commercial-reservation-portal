import { AbstractType, InjectionToken, Injector, Type } from '@angular/core';
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
import { PaymentsWriter } from './payments/data/payments-writer';
import { PaymentManagementPageComponent } from './payments/pages/payment-management-page.component';

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
  { key: 'catalog', label: 'Catálogos', component: CatalogPageComponent, isAvailable: (injector) => has(injector, CatalogItemsSource) },
  { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent,
    isAvailable: (injector) => has(injector, AssociatedEstablishmentsSource) },
  {
    key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent,
    // DP-09 role guard, and only in a build that supplies discount rules (no API contract for them yet).
    isAvailable: (injector) => injector.get(PortalCapabilities).canManageDiscounts() && has(injector, DiscountRulesSource),
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
  // Only in a build that supplies reservations (no API contract for them yet, gap G-B).
  { key: 'reservations', label: 'Reservas', component: ReservationsPageComponent, isAvailable: (injector) => has(injector, ReservationsSource, ReservationQuoteSource) },
  // HU-COM-008: panel-cliente.html, the landing of the customer and the Mis reservas link of the client header.
  {
    key: CLIENT_AREA.panel, label: 'Mis reservas', component: ClientPanelPageComponent, audience: 'customer', clientChrome: 'panel',
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyReservationsSource),
  },
  {
    key: CLIENT_AREA.reservations, label: 'Mis reservas', component: MyReservationsPageComponent, audience: 'customer', clientChrome: 'panel',
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, MyReservationsSource),
  },
  // HU-COM-008 reservar-tour.html: opened by "Reservar tour" of the offer with { tour }.
  {
    key: RESERVATION_FLOW.reserve, label: 'Reservar tour', component: ReserveTourPageComponent, audience: 'customer', clientChrome: 'none',
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, CatalogItemsSource, DeparturesSource, SelectionQuoteSource),
  },
  // HU-COM-008 finalizar-reserva.html, opened by "Continuar reserva" with { departure, services, people }.
  // DP-RS2: the final customer, or a visitor without a session who is asked to sign in on confirming.
  {
    key: RESERVATION_FLOW.finish, label: 'Finalizar reserva', component: ConfirmReservationPageComponent, audience: 'customer', clientChrome: 'none',
    isAvailable: (injector) => isCustomerOrVisitor(injector) && has(injector, PaymentMethodsSource, SelectionQuoteSource, ReservationRequester),
  },
  // HU-COM-009 admin-gestion-pago.html (13): opened by Gestionar pago of 10A and 10C with { reservation }; Reservas stays active.
  { key: 'payment-management', label: 'Gestión de pago', component: PaymentManagementPageComponent, menu: false, parent: 'reservations',
    isAvailable: (injector) => has(injector, ReservationsSource, PaymentsWriter, PaymentMethodsSource) },
]);

export interface ClientLink { readonly key: string; readonly label: string }

/** Links of tours.html (header center, header right without 'Perfil', footer Explorar) and of the compact header: panel, other panel areas. */
export const CLIENT_LINKS: Readonly<Record<'nav' | 'account' | 'footer' | 'panel', readonly ClientLink[]>> = Object.freeze({
  nav: [{ key: CLIENT_AREA.tours, label: 'Explorar' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
  account: [{ key: CLIENT_AREA.reservations, label: 'Mis reservas' }],
  panel: [{ key: CLIENT_AREA.tours, label: 'Ver catálogo' }, { key: CLIENT_AREA.panel, label: 'Volver al panel' }],
  footer: [{ key: CLIENT_AREA.tours, label: 'Tours' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
});

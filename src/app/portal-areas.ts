import { InjectionToken, Injector, Type } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';
import { ActorRole } from './catalog/model/catalog-item';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { CurrentDiscountsSource } from './current-discounts/data/current-discounts-source';
import { CurrentDiscountsPageComponent } from './current-discounts/pages/current-discounts-page.component';
import { CustomersSource } from './customers/data/customers-source';
import { customersCapabilitiesOf } from './customers/model/customer-group';
import { CustomersPageComponent } from './customers/pages/customers-page.component';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { canManageDiscounts } from './discounts/model/discount-rule';
import { DiscountsPageComponent } from './discounts/pages/discounts-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { GastronomyOfferPageComponent, LodgingOfferPageComponent } from './public-offer/pages/establishments-offer-page.component';
import { PublicOfferPageComponent } from './public-offer/pages/public-offer-page.component';
import { ReservationsSource } from './reservations/data/reservations-source';
import { ReservationsPageComponent } from './reservations/pages/reservations-page.component';
import { Audience } from './portal-audience';
import { CLIENT_AREA } from './portal-navigation';

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
}

/** The areas the shell draws; PORTAL_AREAS unless a test provides others. */
export const PORTAL_AREA_LIST = new InjectionToken<readonly PortalArea[]>('PORTAL_AREA_LIST', { factory: () => PORTAL_AREAS });

/** The sidebar, in order. A new story appends ONE entry here; the shell is not edited. */
export const PORTAL_AREAS: readonly PortalArea[] = Object.freeze([
  { key: 'catalog', label: 'Catálogos', component: CatalogPageComponent },
  { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent },
  {
    key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent,
    // DP-09 role guard, and only in a build that supplies discount rules (no API contract for them yet).
    isAvailable: (injector) => canManageDiscounts(injector.get(ActorContext)) && injector.get(DiscountRulesSource, null) !== null,
  },
  // HU-COM-004: every role reads the values; drawn only in a build that supplies them.
  { key: 'current-discounts', label: 'Descuentos vigentes', component: CurrentDiscountsPageComponent,
    isAvailable: (injector) => injector.get(CurrentDiscountsSource, null) !== null },
  // HU-COM-006: the read-only public offer, the client pages of tours.html, alojamiento.html and gastronomia.html.
  { key: CLIENT_AREA.tours, label: 'Explorar', component: PublicOfferPageComponent, audience: 'customer' },
  { key: CLIENT_AREA.lodging, label: 'Alojamiento', component: LodgingOfferPageComponent, audience: 'customer' },
  { key: CLIENT_AREA.gastronomy, label: 'Gastronomía', component: GastronomyOfferPageComponent, audience: 'customer' },
  {
    key: 'customers', label: 'Titular y acompañantes', component: CustomersPageComponent,
    // Plan D-07 role guard, and only in a build that supplies the customers sources (no API contract for them yet, spec G-B).
    isAvailable: (injector) => customersCapabilitiesOf(injector.get(ActorContext).role).canRead && injector.get(CustomersSource, null) !== null,
  },
  // Only in a build that supplies reservations (no API contract for them yet, gap G-B).
  { key: 'reservations', label: 'Reservas', component: ReservationsPageComponent, isAvailable: (injector) => injector.get(ReservationsSource, null) !== null },
]);

export interface ClientLink { readonly key: string; readonly label: string }

/** Links of tours.html (header center, header right without 'Perfil', footer Explorar) and of the compact header: panel, other panel areas. */
export const CLIENT_LINKS: Readonly<Record<'nav' | 'account' | 'footer' | 'panel', readonly ClientLink[]>> = Object.freeze({
  nav: [{ key: CLIENT_AREA.tours, label: 'Explorar' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
  account: [{ key: CLIENT_AREA.reservations, label: 'Mis reservas' }],
  panel: [{ key: CLIENT_AREA.tours, label: 'Ver catálogo' }, { key: CLIENT_AREA.panel, label: 'Volver al panel' }],
  footer: [{ key: CLIENT_AREA.tours, label: 'Tours' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento' }, { key: CLIENT_AREA.gastronomy, label: 'Gastronomía' }],
});

/** The role line under the brand. */
export const ROLE_LABELS: Readonly<Record<ActorRole, string>> = Object.freeze({
  TENANT_ADMINISTRATOR: 'Administrador del tenant',
  OPERATIONAL_COLLABORATOR: 'Colaborador operativo',
  MANAGER: 'Gerente',
  ANALYST: 'Analista',
  ACCOUNTANT: 'Contador',
  READ_ONLY: 'Solo lectura',
});

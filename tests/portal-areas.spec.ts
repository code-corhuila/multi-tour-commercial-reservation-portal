import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { DemoDiscountRulesStore } from '../src/app/demo/discounts-demo';
import { DemoPublicEstablishmentsSource, DemoPublicOfferSource } from '../src/app/demo/public-offer-demo';
import { PublicEstablishmentsSource, PublicOfferSource } from '../src/app/public-offer/data/public-offer-sources';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { CurrentDiscountsPageComponent } from '../src/app/current-discounts/pages/current-discounts-page.component';
import { CustomersPageComponent } from '../src/app/customers/pages/customers-page.component';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { MyPaymentsPageComponent } from '../src/app/my-payments/pages/my-payments-page.component';
import { GastronomyOfferPageComponent, LodgingOfferPageComponent } from '../src/app/public-offer/pages/establishments-offer-page.component';
import { PublicOfferPageComponent } from '../src/app/public-offer/pages/public-offer-page.component';
import { PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea, ROLE_LABELS } from '../src/app/portal-areas';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ClientPanelPageComponent } from '../src/app/self-service-reservation/pages/client-panel-page.component';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { MyReservationsPageComponent } from '../src/app/self-service-reservation/pages/my-reservations-page.component';
import { ReserveTourPageComponent } from '../src/app/self-service-reservation/pages/reserve-tour-page.component';
import { PaymentManagementPageComponent } from '../src/app/payments/pages/payment-management-page.component';
import { TransferPaymentPageComponent } from '../src/app/payments/pages/transfer-payment-page.component';
import { PaymentReceivedPageComponent, PaymentRejectedPageComponent } from '../src/app/payments/pages/payment-result-pages.component';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ReschedulingProposalPageComponent } from '../src/app/rescheduling/pages/rescheduling-proposal-page.component';
import { actorAs } from './actor-context.double';
import { ReservationChangePageComponent } from '../src/app/reservation-changes/pages/reservation-change-page.component';
import { PaymentsPageComponent } from '../src/app/payments/pages/payments-page.component';
import { ValidateProofPageComponent } from '../src/app/payments/pages/validate-proof-page.component';
import { PaymentFollowupPageComponent } from '../src/app/payments/pages/payment-followup-page.component';
import { RefundDetailPageComponent } from '../src/app/refunds/pages/refund-detail-page.component';
import { RefundManagePageComponent } from '../src/app/refunds/pages/refund-manage-page.component';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { NotificationsPageComponent } from '../src/app/refunds/pages/notifications-page.component';
import { RefundRequestsPageComponent } from '../src/app/refunds/pages/refund-requests-page.component';
import { ActorRole, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';

@Component({ selector: 'crp-test-customer-page', template: '<p>Oferta de prueba</p>' })
class CustomerPageDouble {}
const CUSTOMER_AREA: PortalArea = { key: 'explore', label: 'Área de prueba', component: CustomerPageDouble, audience: 'customer' };

async function openShell(role: ActorRole, withDiscounts = true, extra: PortalArea[] = []) {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) },
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    { provide: PublicOfferSource, useValue: new DemoPublicOfferSource(catalog) },
    { provide: PublicEstablishmentsSource, useValue: new DemoPublicEstablishmentsSource(establishments) },
    ...(withDiscounts ? [{ provide: DiscountRulesSource, useValue: new DemoDiscountRulesStore() }] : []),
    ...(extra.length ? [{ provide: PORTAL_AREA_LIST, useValue: [...PORTAL_AREAS.filter((area) => !area.audience), ...extra] }] : []),
  ] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-operator-sidebar .crp-operator-nav button'));
  const open = async (label: string) => { items().find((b) => b.textContent?.trim() === label)!.click(); await settle(); };
  const navigation = () => fixture.debugElement.injector.get(PortalNavigation);
  return { host, items, open, settle, navigation };
}

describe('portalAreasRegistry', () => {
  it('declares the areas in order with Spanish labels and their page components', () => {
    expect(PORTAL_AREAS.map(({ key, label, component }) => ({ key, label, component }))).toEqual([
      { key: 'catalog', label: 'Catálogos', component: CatalogPageComponent },
      { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent },
      { key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent },
      { key: 'offer', label: 'Explorar', component: PublicOfferPageComponent },
    ]);
    expect(Object.isFrozen(PORTAL_AREAS)).toBe(true);
    // HU-COM-008 DP-RS2: Mis reservas belongs to the client layout of the final customer, not to the operator sidebar.
    expect(PORTAL_AREAS.find((area) => area.key === 'my-reservations')?.audience).toBe('customer');
  });

  it('names every role in Spanish', () => {
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR').roleLabel()).toBe('Administrador del tenant');
    expect((['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY'] as const).map((role) => PortalCapabilities.for(role).roleLabel()).every((label) => /^[A-ZÁÉÍÓÚ][a-záéíóúñ ]+$/.test(label))).toBe(true);
  });
});

describe('operatorShellSidebar', () => {
  it('draws the brand, the Spanish role and one item per available area, the first one active', async () => {
    const { host, items } = await openShell('TENANT_ADMINISTRATOR');
    expect(host.querySelector('.crp-operator-shell > aside.crp-operator-sidebar')).not.toBeNull();
    expect(host.querySelector('.crp-operator-shell > main.crp-operator-content')).not.toBeNull();
    expect(host.querySelector('.crp-operator-brand')?.textContent?.trim()).toBe('MULTITOUR');
    expect(host.querySelector('.crp-operator-role')?.textContent?.trim()).toBe('Administrador del tenant');
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Establecimientos', 'Descuentos']);
    expect(items()[0].classList.contains('crp-is-active')).toBe(true);
    expect(items()[0].getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('app-catalog-page')).not.toBeNull();
  });

  it('renders the selected area and moves the active state with it', async () => {
    const { host, items, open } = await openShell('TENANT_ADMINISTRATOR');
    await open('Establecimientos');
    expect(host.querySelector('app-establishments-page')).not.toBeNull();
    expect(host.querySelector('app-catalog-page')).toBeNull();
    expect(items().filter((b) => b.classList.contains('crp-is-active')).map((b) => b.textContent?.trim())).toEqual(['Establecimientos']);
    await open('Descuentos');
    expect(host.querySelector('app-discounts-page')).not.toBeNull();
  });

  it('hides Descuentos from a role that cannot manage discounts', async () => {
    const { host, items } = await openShell('OPERATIONAL_COLLABORATOR');
    expect(host.querySelector('.crp-operator-role')?.textContent?.trim()).toBe('Colaborador operativo');
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Establecimientos']);
  });

  it('hides Descuentos when the build supplies no discount source', async () => {
    const { items } = await openShell('TENANT_ADMINISTRATOR', false);
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Establecimientos']);
  });

  it('shows the operator no customer area', async () => {
    const { host, items } = await openShell('TENANT_ADMINISTRATOR', true, [CUSTOMER_AREA]);
    expect(items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Establecimientos', 'Descuentos']);
    expect(host.querySelector('.crp-client-header')).toBeNull();
  });
});

describe('customerShellHeader', () => {
  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector)).map((e) => e.textContent?.trim());
  const button = (host: HTMLElement, selector: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!;

  it('draws the header of tours.html: brand, Explorar, Alojamiento and Gastronomía in the center, Mis reservas on the right', async () => {
    const { host } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    expect(host.querySelector('.crp-operator-sidebar')).toBeNull();
    expect(host.textContent).not.toContain('Solo lectura');
    const brand = host.querySelector('.crp-client-shell > header.crp-client-header .crp-client-brand');
    expect(brand?.textContent?.trim()).toBe('MULTITOUR');
    expect(brand?.querySelector('span')?.textContent).toBe('TOUR');
    expect(host.querySelector('.crp-client-nav')?.getAttribute('aria-label')).toBe('Navegación principal del cliente');
    // HU-COM-006: the public offer is the first customer area.
    expect(links(host).map((b) => b.textContent?.trim())).toEqual(['Explorar', 'Área de prueba']);
    expect(host.querySelector('.crp-client-eyebrow')?.textContent?.trim()).toBe('Portal cliente');
    expect(host.querySelector('.crp-client-greeting')?.textContent?.trim()).toMatch(/^Hola/);
    expect(links(host)[0].getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.crp-client-content app-public-offer-page')).not.toBeNull();
  });

  it('shows the customer the public offer under Explorar and no operator page', async () => {
    const { host } = await openShell('READ_ONLY');
    expect(links(host).map((b) => b.textContent?.trim())).toEqual(['Explorar']);
    expect(host.querySelector('.crp-client-content app-public-offer-page')).not.toBeNull();
    expect(host.querySelector('app-catalog-page')).toBeNull();
    expect(PORTAL_AREAS.find((area) => area.key === 'offer')?.audience).toBe('customer');
  });
});

describe('portalAudience', () => {
  const audienceOf = (role: ActorRole) => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role) }] });
    return TestBed.inject(PortalAudience).audience;
  };

  it('is the operator for an operator role', () => {
    expect(audienceOf('OPERATIONAL_COLLABORATOR')).toBe('operator');
  });

  it('is the customer when no operator role exists', () => {
    expect(audienceOf('READ_ONLY')).toBe('customer');
  });

  it('keeps the foundation areas for operators', () => {
    const foundation = PORTAL_AREAS.filter((area) => ['catalog', 'establishments', 'discounts'].includes(area.key));
    expect(foundation.every((area) => (area.audience ?? 'operator') === 'operator')).toBe(true);
  });
});

describe('demoDataSpeaksSpanishWithAccents', () => {
  it('writes the visible demo names and texts with their Spanish accents', () => {
    const catalog = new DemoCatalogStore();
    const tours = ['demo-svc-2', 'demo-svc-3'].map((id) => catalog.find(id).commercialName);
    expect(tours).toEqual(['Ruta del café en Pitalito', 'Canotaje en el Río Suaza']);
    const places = new DemoEstablishmentsStore().items.map((e) => `${e.commercialName} | ${e.commercialInformation}`);
    expect(places).toEqual([
      'Hotel Casa Neiva | Habitaciones con vista al río Magdalena.',
      'Posada del Café | Alojamiento rural entre cafetales.',
      'Hostal La Tatacoa | Cerrado por remodelación.',
      'Sabores del Huila | Cocina típica: asado huilense y tamal.',
      'Fogón del Desierto | Cabrito al horno de barro.',
      'Café Altura | Desayunos de montaña.',
    ]);
  });
});

describe('demoDataSpeaksSpanishWithAccents', () => {
  it('writes the visible demo names and texts with their Spanish accents', () => {
    const catalog = new DemoCatalogStore();
    const tours = ['demo-svc-2', 'demo-svc-3'].map((id) => catalog.find(id).commercialName);
    expect(tours).toEqual(['Ruta del café en Pitalito', 'Canotaje en el Río Suaza']);
    const places = new DemoEstablishmentsStore().items.map((e) => `${e.commercialName} | ${e.commercialInformation}`);
    expect(places).toEqual([
      'Hotel Casa Neiva | Habitaciones con vista al río Magdalena.',
      'Posada del Café | Alojamiento rural entre cafetales.',
      'Hostal La Tatacoa | Cerrado por remodelación.',
      'Sabores del Huila | Cocina típica: asado huilense y tamal.',
      'Fogón del Desierto | Cabrito al horno de barro.',
      'Café Altura | Desayunos de montaña.',
    ]);
  });
});

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
import { CLIENT_AREA, PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea } from '../src/app/portal-areas';
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
const CUSTOMER_AREA: PortalArea = { key: CLIENT_AREA.tours, label: 'Explorar', component: CustomerPageDouble, audience: 'customer' };

/** A client page that opens another area through PortalNavigation, as "Ver mis reservas" or "Volver al panel cliente" do. */
@Component({ selector: 'crp-test-panel-page', template: '<button type="button" class="go" (click)="nav.open(key)">Ver mis reservas</button>' })
class PanelPageDouble { protected readonly nav = inject(PortalNavigation); protected readonly key = CLIENT_AREA.reservations; }
@Component({ selector: 'crp-test-lodging-page', template: '<p>Alojamiento de prueba</p>' })
class LodgingPageDouble {}
@Component({ selector: 'crp-test-gastronomy-page', template: '<p>Gastronomía de prueba</p>' })
class GastronomyPageDouble {}
@Component({ selector: 'crp-test-reservations-page', template: '<p>Reservas de prueba</p>' })
class ReservationsPageDouble {}
const CLIENT_AREAS: PortalArea[] = [
  CUSTOMER_AREA,
  { key: CLIENT_AREA.lodging, label: 'Alojamiento', component: LodgingPageDouble, audience: 'customer' },
  { key: CLIENT_AREA.gastronomy, label: 'Gastronomía', component: GastronomyPageDouble, audience: 'customer' },
  { key: CLIENT_AREA.panel, label: 'Panel cliente', component: PanelPageDouble, audience: 'customer', clientChrome: 'panel' },
  { key: CLIENT_AREA.reservations, label: 'Mis reservas', component: ReservationsPageDouble, audience: 'customer', clientChrome: 'panel' },
];
/** The same areas, all with the site chrome of tours.html. */
const SITE_CLIENT_AREAS: PortalArea[] = CLIENT_AREAS.map((area) => ({ ...area, clientChrome: 'site' }));

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
      { key: 'current-discounts', label: 'Descuentos vigentes', component: CurrentDiscountsPageComponent },
      { key: 'tours', label: 'Explorar', component: PublicOfferPageComponent },
      { key: 'lodging', label: 'Alojamiento', component: LodgingOfferPageComponent },
      { key: 'gastronomy', label: 'Gastronomía', component: GastronomyOfferPageComponent },
      { key: 'customers', label: 'Titular y acompañantes', component: CustomersPageComponent },
      { key: 'reservations', label: 'Reservas', component: ReservationsPageComponent },
      { key: 'client-panel', label: 'Mis reservas', component: ClientPanelPageComponent },
      { key: 'my-reservations', label: 'Mis reservas', component: MyReservationsPageComponent },
      { key: 'reserve', label: 'Reservar tour', component: ReserveTourPageComponent },
      { key: 'finish', label: 'Finalizar reserva', component: ConfirmReservationPageComponent },
      { key: 'payment-management', label: 'Gestión de pago', component: PaymentManagementPageComponent },
      { key: 'reservation-change', label: 'Cancelar o modificar reserva', component: ReservationChangePageComponent },
      { key: 'transfer-payment', label: 'Pago por transferencia', component: TransferPaymentPageComponent },
      { key: 'payment-received', label: 'Comprobante recibido', component: PaymentReceivedPageComponent },
      { key: 'payment-rejected', label: 'Comprobante rechazado', component: PaymentRejectedPageComponent },
      { key: 'payments', label: 'Pagos', component: PaymentsPageComponent },
      { key: 'payments-validate', label: 'Validar comprobante', component: ValidateProofPageComponent },
      { key: 'payments-followup', label: 'Registrar seguimiento', component: PaymentFollowupPageComponent },
      { key: 'my-payments', label: 'Mis pagos', component: MyPaymentsPageComponent },
      { key: 'refund-requests', label: 'Solicitudes de devolución', component: RefundRequestsPageComponent },
      { key: 'refund-detail', label: 'Detalle de devolución', component: RefundDetailPageComponent },
      { key: 'refund-manage', label: 'Gestionar devolución', component: RefundManagePageComponent },
      { key: 'refund-treatment', label: 'Tratamiento pendiente de devolución', component: RefundTreatmentPageComponent },
      { key: 'notifications', label: 'Notificaciones', component: NotificationsPageComponent },
      { key: 'rescheduling', label: 'Propuesta de reprogramación', component: ReschedulingPageComponent },
      { key: 'rescheduling-proposal', label: 'Propuesta de reprogramación', component: ReschedulingProposalPageComponent },
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
    expect(texts(host, '.crp-client-nav button')).toEqual(['Explorar', 'Alojamiento', 'Gastronomía']);
    expect(texts(host, '.crp-client-actions button')).toEqual(['Mis reservas']);
    expect(host.textContent).not.toMatch(/Perfil|Catálogos|Establecimientos|Descuentos/);
  });

  it('lands on the panel cliente and leaves the greeting to that page', async () => {
    const { host } = await openShell('READ_ONLY', true, CLIENT_AREAS);
    expect(host.querySelector('.crp-client-content crp-test-panel-page')).not.toBeNull();
    expect(host.querySelector('.crp-client-greeting')).toBeNull();
  });

  it('opens the reservations list from Mis reservas and marks it active there', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    expect(button(host, '.crp-client-actions button', 'Mis reservas').getAttribute('aria-current')).toBeNull();
    button(host, '.crp-client-actions button', 'Mis reservas').click();
    await settle();
    expect(host.querySelector('crp-test-reservations-page')).not.toBeNull();
    expect(texts(host, '.crp-client-header [aria-current="page"]')).toEqual(['Mis reservas']);
  });

  it('opens the area of each header link and moves the active state with it', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    button(host, '.crp-client-nav button', 'Gastronomía').click();
    await settle();
    expect(host.querySelector('crp-test-gastronomy-page')).not.toBeNull();
    expect(host.querySelector('crp-test-panel-page')).toBeNull();
    expect(texts(host, '.crp-client-header [aria-current="page"]')).toEqual(['Gastronomía']);
  });

  it('lets a client page open another area through PortalNavigation', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, CLIENT_AREAS);
    host.querySelector<HTMLButtonElement>('crp-test-panel-page .go')!.click();
    await settle();
    expect(host.querySelector('crp-test-reservations-page')).not.toBeNull();
  });

  it('hands the parameters of PortalNavigation.open to the opened area and clears them on the next opening', async () => {
    const { host, settle, navigation } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    expect(navigation().params()).toEqual({});
    expect(navigation().open(CLIENT_AREA.reservations, { departure: 'DEP-1', people: '2' })).toBe(true);
    await settle();
    expect(host.querySelector('crp-test-reservations-page')).not.toBeNull();
    expect(navigation().params()).toEqual({ departure: 'DEP-1', people: '2' });
    expect(navigation().open('unknown-area', { departure: 'X' })).toBe(false);
    expect(navigation().params()).toEqual({ departure: 'DEP-1', people: '2' });
    button(host, '.crp-client-nav button', 'Explorar').click();
    await settle();
    expect(navigation().params()).toEqual({});
  });

  it('draws the dark footer of tours.html, its Explorar column opening the areas and no Cuenta column (the session is open)', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    const footer = host.querySelector('.crp-client-shell > footer.crp-client-footer')!;
    expect(footer.querySelector('.crp-client-footer-brand')?.textContent?.trim()).toBe('MULTITOUR');
    expect(footer.textContent).toContain('Plataforma para descubrir, reservar y gestionar experiencias de turismo con operadores locales.');
    expect(texts(host, '.crp-client-footer-col strong')).toEqual(['Explorar']);
    expect(texts(host, '.crp-client-footer-col[aria-label="Explorar"] button')).toEqual(['Tours', 'Alojamiento', 'Gastronomía']);
    expect(footer.textContent).not.toMatch(/Ingresar|Crear cuenta|Cuenta/);
    expect(footer.querySelector('.crp-client-footer-bottom')?.textContent?.trim()).toBe('© 2026 Multitour. Plataforma para operadores de turismo.');
    button(host, '.crp-client-footer-col button', 'Alojamiento').click();
    await settle();
    expect(host.querySelector('crp-test-lodging-page')).not.toBeNull();
  });

  it('draws only the links whose area the build has; the footer keeps the others as text', async () => {
    const { host } = await openShell('READ_ONLY', true, [CUSTOMER_AREA]);
    expect(texts(host, '.crp-client-nav button')).toEqual(['Explorar']);
    expect(texts(host, '.crp-client-actions button')).toEqual([]);
    expect(texts(host, '.crp-client-footer-col[aria-label="Explorar"] button')).toEqual(['Tours']);
    expect(texts(host, '.crp-client-footer-col[aria-label="Explorar"] span')).toEqual(['Alojamiento', 'Gastronomía']);
    expect(host.querySelector('.crp-client-content crp-test-customer-page')).not.toBeNull();
  });

  it('shows the customer the public offer under Explorar and no operator page', async () => {
    const { host } = await openShell('READ_ONLY');
    expect(texts(host, '.crp-client-nav button')).toEqual(['Explorar', 'Alojamiento', 'Gastronomía']);
    expect(host.querySelector('.crp-client-content app-public-offer-page')).not.toBeNull();
    expect(host.querySelector('app-catalog-page')).toBeNull();
    expect(PORTAL_AREAS.find((area) => area.key === CLIENT_AREA.tours)?.audience).toBe('customer');
  });
});

describe('customerPanelChrome', () => {
  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector)).map((e) => e.textContent?.trim());
  const link = '.crp-client-panel-header button:not(.crp-client-panel-brand):not(.crp-client-bell-button)';

  it('draws the compact header of panel-cliente.html inside the canvas, with Ver catálogo, no avatar and no footer', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, CLIENT_AREAS);
    expect(host.querySelector('.crp-client-header')).toBeNull();
    expect(host.querySelector('.crp-client-footer')).toBeNull();
    const header = host.querySelector('.crp-client-content > header.crp-client-panel-header')!;
    // panel-cliente.html draws no brand in its header: Ver catálogo and the bell of Notificaciones.
    expect(header.querySelector('.crp-client-panel-brand')).toBeNull();
    expect(texts(host, link)).toEqual(['Ver catálogo']);
    const bell = header.querySelector<HTMLButtonElement>('.crp-client-bell-button')!;
    expect(header.querySelector('.crp-client-panel-actions > button + .crp-client-bell')).not.toBeNull();
    expect(bell.getAttribute('aria-label')).toBe('Notificaciones');
    expect(bell.getAttribute('aria-expanded')).toBe('false');
    const panel = header.querySelector<HTMLElement>('.crp-client-bell-panel')!;
    expect(panel.hidden).toBe(true);
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe('Notificaciones');
    expect(panel.textContent).toContain('No tienes notificaciones nuevas.');
    bell.click();
    await settle();
    expect(panel.hidden).toBe(false);
    expect(bell.getAttribute('aria-expanded')).toBe('true');
    bell.click();
    await settle();
    expect(panel.hidden).toBe(true);
    expect(host.textContent).not.toMatch(/Perfil/);
    host.querySelector<HTMLButtonElement>(link)!.click();
    await settle();
    expect(host.querySelector('crp-test-customer-page')).not.toBeNull();
    expect(host.querySelector('.crp-client-panel-header')).toBeNull();
    expect(host.querySelector('.crp-client-header')).not.toBeNull();
    expect(host.querySelector('.crp-client-footer')).not.toBeNull();
  });

  it('offers Volver al panel on the reservations list', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, CLIENT_AREAS);
    host.querySelector<HTMLButtonElement>('crp-test-panel-page .go')!.click();
    await settle();
    expect(texts(host, link)).toEqual(['Volver al panel']);
    expect(host.querySelector('.crp-client-panel-brand')?.textContent?.trim()).toBe('Multitour');
    expect(host.querySelector('.crp-client-bell')).toBeNull();
    host.querySelector<HTMLButtonElement>(link)!.click();
    await settle();
    expect(host.querySelector('crp-test-panel-page')).not.toBeNull();
  });
});

@Component({ selector: 'crp-test-flow-page', template: '<header class="flow-bar">Volver al tour</header>' })
class FlowPageDouble {}
@Component({ selector: 'crp-test-go-flow', template: '<button type="button" class="go" (click)="nav.open(\'flow\')">Reservar</button>' })
class GoFlowPageDouble { protected readonly nav = inject(PortalNavigation); }

describe('customerFlowChrome', () => {
  const FLOW_AREAS: PortalArea[] = [
    { key: CLIENT_AREA.panel, label: 'Panel cliente', component: GoFlowPageDouble, audience: 'customer', clientChrome: 'panel' },
    { key: 'flow', label: 'Reservar tour', component: FlowPageDouble, audience: 'customer', clientChrome: 'none' },
  ];

  it('draws no client header, panel header or footer on a flow screen with its own top bar, inside the canvas', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, FLOW_AREAS);
    host.querySelector<HTMLButtonElement>('crp-test-go-flow .go')!.click();
    await settle();
    expect(host.querySelector('.crp-client-content > crp-test-flow-page .flow-bar')).not.toBeNull();
    expect(host.querySelector('.crp-client-header')).toBeNull();
    expect(host.querySelector('.crp-client-panel-header')).toBeNull();
    expect(host.querySelector('.crp-client-footer')).toBeNull();
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

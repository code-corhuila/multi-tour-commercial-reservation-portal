import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { ActorRole } from '../src/app/catalog/model/catalog-item';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { DemoDiscountRulesStore } from '../src/app/demo/discounts-demo';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { CLIENT_AREA, PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea, ROLE_LABELS } from '../src/app/portal-areas';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { actorAs } from './actor-context.double';

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
    ...(withDiscounts ? [{ provide: DiscountRulesSource, useValue: new DemoDiscountRulesStore() }] : []),
    ...(extra.length ? [{ provide: PORTAL_AREA_LIST, useValue: [...PORTAL_AREAS, ...extra] }] : []),
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
    ]);
    expect(Object.isFrozen(PORTAL_AREAS)).toBe(true);
  });

  it('names every role in Spanish', () => {
    expect(ROLE_LABELS.TENANT_ADMINISTRATOR).toBe('Administrador del tenant');
    expect(Object.values(ROLE_LABELS).every((label) => /^[A-ZÁÉÍÓÚ][a-záéíóúñ ]+$/.test(label))).toBe(true);
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

  it('draws the dark footer of tours.html, its Explorar column opening the areas and Cuenta as text', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, SITE_CLIENT_AREAS);
    const footer = host.querySelector('.crp-client-shell > footer.crp-client-footer')!;
    expect(footer.querySelector('.crp-client-footer-brand')?.textContent?.trim()).toBe('MULTITOUR');
    expect(footer.textContent).toContain('Plataforma para descubrir, reservar y gestionar experiencias de turismo con operadores locales.');
    expect(texts(host, '.crp-client-footer-col strong')).toEqual(['Explorar', 'Cuenta']);
    expect(texts(host, '.crp-client-footer-col[aria-label="Explorar"] button')).toEqual(['Tours', 'Alojamiento', 'Gastronomía']);
    expect(texts(host, '.crp-client-footer-col[aria-label="Cuenta"] span')).toEqual(['Ingresar', 'Crear cuenta']);
    expect(footer.querySelector('.crp-client-footer-col[aria-label="Cuenta"] button, .crp-client-footer-col[aria-label="Cuenta"] a')).toBeNull();
    expect(footer.querySelector('.crp-client-footer-bottom')?.textContent?.trim()).toBe('© 2026 Multi Tour. Plataforma para operadores de turismo.');
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

  it('draws the client layout with no area when the build has no customer area', async () => {
    const { host } = await openShell('READ_ONLY');
    expect(host.querySelector('.crp-client-header')).not.toBeNull();
    expect(host.querySelectorAll('.crp-client-header button:not(.crp-client-brand)').length).toBe(0);
    expect(host.querySelector('app-catalog-page')).toBeNull();
  });
});

describe('customerPanelChrome', () => {
  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector)).map((e) => e.textContent?.trim());
  const link = '.crp-client-panel-header button:not(.crp-client-panel-brand)';

  it('draws the compact header of panel-cliente.html inside the canvas, with Ver catálogo, no avatar and no footer', async () => {
    const { host, settle } = await openShell('READ_ONLY', true, CLIENT_AREAS);
    expect(host.querySelector('.crp-client-header')).toBeNull();
    expect(host.querySelector('.crp-client-footer')).toBeNull();
    const header = host.querySelector('.crp-client-content > header.crp-client-panel-header')!;
    expect(header.querySelector('.crp-client-panel-brand')?.textContent?.trim()).toBe('Multi Tour');
    expect(texts(host, link)).toEqual(['Ver catálogo']);
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
    host.querySelector<HTMLButtonElement>(link)!.click();
    await settle();
    expect(host.querySelector('crp-test-panel-page')).not.toBeNull();
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

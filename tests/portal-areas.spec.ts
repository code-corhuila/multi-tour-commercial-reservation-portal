import { Component } from '@angular/core';
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
import { PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea, ROLE_LABELS } from '../src/app/portal-areas';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { SelfServiceAreaComponent } from '../src/app/self-service-reservation/pages/self-service-area.component';
import { actorAs } from './actor-context.double';

@Component({ selector: 'crp-test-customer-page', template: '<p>Oferta de prueba</p>' })
class CustomerPageDouble {}
const CUSTOMER_AREA: PortalArea = { key: 'explore', label: 'Explorar', component: CustomerPageDouble, audience: 'customer' };

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
  return { host, items, open };
}

describe('portalAreasRegistry', () => {
  it('declares the areas in order with Spanish labels and their page components', () => {
    expect(PORTAL_AREAS.map(({ key, label, component }) => ({ key, label, component }))).toEqual([
      { key: 'catalog', label: 'Catálogos', component: CatalogPageComponent },
      { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent },
      { key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent },
      { key: 'my-reservations', label: 'Mis reservas', component: SelfServiceAreaComponent },
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
  const links = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-client-header .crp-client-nav button'));

  it('gives a visitor without an operator role the client layout with only customer areas', async () => {
    const { host } = await openShell('READ_ONLY', true, [CUSTOMER_AREA]);
    expect(host.querySelector('.crp-operator-sidebar')).toBeNull();
    expect(host.textContent).not.toContain('Solo lectura');
    expect(host.querySelector('.crp-client-shell > header.crp-client-header .crp-client-brand')?.textContent?.trim()).toBe('MULTITOUR');
    expect(host.querySelector('.crp-client-nav')?.getAttribute('aria-label')).toBe('Navegación principal del cliente');
    expect(links(host).map((b) => b.textContent?.trim())).toEqual(['Explorar']);
    expect(host.textContent).not.toMatch(/Catálogos|Establecimientos|Descuentos/);
    expect(host.querySelector('.crp-client-eyebrow')?.textContent?.trim()).toBe('Portal cliente');
    expect(host.querySelector('.crp-client-greeting')?.textContent?.trim()).toMatch(/^Hola/);
    expect(links(host)[0].getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.crp-client-content crp-test-customer-page')).not.toBeNull();
  });

  it('draws the client layout with no area when the build has no customer area', async () => {
    const { host } = await openShell('READ_ONLY');
    expect(host.querySelector('.crp-client-header')).not.toBeNull();
    expect(links(host)).toEqual([]);
    expect(host.querySelector('app-catalog-page')).toBeNull();
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

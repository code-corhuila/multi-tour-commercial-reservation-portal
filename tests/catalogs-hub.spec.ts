import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_COPY, formatCop } from '../src/app/catalog/catalog-copy';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { ActorRole, CatalogItem } from '../src/app/catalog/model/catalog-item';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';
import { CatalogsHubComponent, HubTarget, PORTAL_IDENTIFIER } from '../src/app/hub/catalogs-hub.component';
import { DASHBOARD_AREA, DASHBOARD_AVAILABLE, HUB_COPY, activeCount, areaPath, recordCount } from '../src/app/hub/hub-copy';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';

const tour = (name: string, catalogStatus: CatalogItem['catalogStatus'] = 'ACTIVE'): CatalogItem => ({ ...itemNamed(name), catalogStatus });
const transport = (name: string): CatalogItem => ({ ...itemNamed(name), serviceType: 'TRANSPORTATION' });

async function openHub(role: ActorRole = 'TENANT_ADMINISTRATOR', extra: Provider[] = []) {
  const catalog = new ControllableCatalogItemsSource();
  const places = new ControllableEstablishmentsSource();
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) },
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: AssociatedEstablishmentsSource, useValue: places },
    ...extra,
  ] });
  const fixture = TestBed.createComponent(CatalogsHubComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const cardOf = (label: string) => Array.from(host.querySelectorAll('.crp-catalog-grid article'))
    .find((card) => card.querySelector('span')?.textContent === label) as HTMLElement | undefined;
  const valueOf = (label: string) => cardOf(label)?.querySelector('strong')?.textContent;
  const answer = async (items: readonly CatalogItem[], establishments: readonly AssociatedEstablishment[]) => {
    catalog.requests.at(-1)!.reply(items);
    places.requests.at(-1)?.reply(establishments);
    await settle();
  };
  return { fixture, host, settle, catalog, places, cardOf, valueOf, answer };
}

describe('catalogsHub', () => {
  it('shows the landing header and the role notice, and only the loading text until the lists answer', async () => {
    const { host } = await openHub();
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe(HUB_COPY.eyebrow);
    expect(host.querySelector('h1')?.textContent).toBe(HUB_COPY.title);
    expect(host.querySelector('.crp-access-note')?.textContent).toBe(HUB_COPY.accessNote);
    expect(host.querySelector('[data-state="loading"]')?.textContent).toBe(HUB_COPY.loading);
    expect(host.querySelector('.crp-catalog-grid')).toBeNull();
  });

  it('counts each card from the same lists the screens use', async () => {
    const { answer, valueOf, catalog, places } = await openHub();
    await answer(
      [tour('A'), tour('B'), tour('C', 'INACTIVE'), transport('T')],
      [establishmentNamed('H1'), establishmentNamed('H2'), establishmentNamed('R1', 'RESTAURANT')],
    );
    expect(catalog.requests).toHaveLength(1);
    expect(places.requests).toHaveLength(1);
    expect(valueOf(HUB_COPY.cards.tours.label)).toBe(activeCount(2));
    expect(valueOf(HUB_COPY.cards.transport.label)).toBe(activeCount(1));
    expect(valueOf(HUB_COPY.cards.lodging.label)).toBe(recordCount(2));
    expect(valueOf(HUB_COPY.cards.food.label)).toBe(recordCount(1));
  });

  it('leaves the departures card disabled, without a link, for the other domain', async () => {
    const { answer, cardOf } = await openHub();
    await answer([tour('A')], []);
    const card = cardOf(HUB_COPY.cards.departures.label)!;
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.textContent).toContain(HUB_COPY.cards.departures.value);
    expect(card.querySelector('button, a')).toBeNull();
  });

  it('opens the list of the right kind from each card', async () => {
    const { fixture, answer, cardOf } = await openHub();
    const opened: HubTarget[] = [];
    fixture.componentInstance.opened.subscribe((target) => opened.push(target));
    await answer([tour('A')], [establishmentNamed('H1')]);
    for (const label of [HUB_COPY.cards.tours.label, HUB_COPY.cards.lodging.label, HUB_COPY.cards.food.label, HUB_COPY.cards.transport.label]) {
      cardOf(label)!.querySelector('button')!.click();
    }
    expect(opened).toEqual([
      { screen: 'catalog', serviceType: 'TOUR' },
      { screen: 'establishments', establishmentType: 'HOTEL' },
      { screen: 'establishments', establishmentType: 'RESTAURANT' },
      { screen: 'catalog', serviceType: 'TRANSPORTATION' },
    ]);
  });

  it('shows the empty message and still offers every card, so the first record can be registered', async () => {
    const { host, answer, valueOf } = await openHub();
    await answer([], []);
    expect(host.querySelector('[data-state="empty"]')?.textContent).toBe(HUB_COPY.empty);
    expect(valueOf(HUB_COPY.cards.tours.label)).toBe(activeCount(0));
    expect(host.querySelectorAll('.crp-catalog-grid button')).toHaveLength(4);
  });

  it('shows the error with a retry that asks again and then shows the cards', async () => {
    const { host, settle, catalog, places, answer, valueOf } = await openHub();
    catalog.requests[0].fail();
    await settle();
    expect(host.querySelector('[data-state="error"]')).not.toBeNull();
    expect(host.querySelector('.crp-catalog-grid')).toBeNull();
    (host.querySelector('[data-state="error"] button') as HTMLButtonElement).click();
    await settle();
    expect(catalog.requests).toHaveLength(2);
    expect(places.requests).toHaveLength(2);
    await answer([tour('A')], []);
    expect(valueOf(HUB_COPY.cards.tours.label)).toBe(activeCount(1));
  });

  it('offers no cards and asks for nothing to a role without access', async () => {
    const { host, catalog, places } = await openHub('ACCOUNTANT');
    expect(host.querySelector('[data-state="denied"]')?.textContent).toBe(HUB_COPY.denied);
    expect(host.querySelector('.crp-catalog-grid')).toBeNull();
    expect(catalog.requests).toHaveLength(0);
    expect(places.requests).toHaveLength(0);
  });

  it('keeps the associated establishments away from the operational collaborator', async () => {
    const { host, answer, places, cardOf } = await openHub('OPERATIONAL_COLLABORATOR');
    expect(places.requests).toHaveLength(0);
    await answer([tour('A')], []);
    expect(cardOf(HUB_COPY.cards.lodging.label)).toBeUndefined();
    expect(cardOf(HUB_COPY.cards.food.label)).toBeUndefined();
    expect(host.querySelectorAll('.crp-catalog-grid button')).toHaveLength(2);
  });
});

describe('catalogsHubSummaryButton', () => {
  const summary = (host: HTMLElement) => host.querySelector('.crp-page-header a.crp-outline.crp-page-header-action') as HTMLAnchorElement;

  it('puts a control named Resumen at the right of the title, in the header', async () => {
    const { host } = await openHub();
    expect(summary(host).textContent?.trim()).toBe(HUB_COPY.summary);
    expect(summary(host).getAttribute('role')).toBe('link');
    expect(summary(host).closest('.crp-page-header')?.querySelector('h1')).not.toBeNull();
  });

  it('is disabled, without href, and says what it waits for while the dashboard is not available', async () => {
    expect(DASHBOARD_AVAILABLE).toBe(false);
    const { host } = await openHub();
    expect(summary(host).getAttribute('aria-disabled')).toBe('true');
    expect(summary(host).hasAttribute('href')).toBe(false);
    expect(summary(host).getAttribute('tabindex')).toBe('-1');
    expect(summary(host).getAttribute('title')).toBe(HUB_COPY.summaryUnavailable);
  });

  it('links to the dashboard area of the tenant when it is available and the portal has an identifier', async () => {
    const { fixture, host, settle } = await openHub('TENANT_ADMINISTRATOR', [{ provide: PORTAL_IDENTIFIER, useValue: 'acme' }]);
    fixture.componentRef.setInput('dashboardAvailable', true);
    await settle();
    expect(summary(host).getAttribute('href')).toBe('/t/acme/areas/cash-reporting-portal');
    expect(summary(host).hasAttribute('aria-disabled')).toBe(false);
    expect(summary(host).hasAttribute('tabindex')).toBe(false);
  });

  it('links to the dashboard area of the platform when it is available and there is no identifier', async () => {
    const { fixture, host, settle } = await openHub();
    fixture.componentRef.setInput('dashboardAvailable', true);
    await settle();
    expect(summary(host).getAttribute('href')).toBe('/platform/areas/cash-reporting-portal');
  });

  it('builds the area path from one constant and uses no network or forbidden words', () => {
    expect(DASHBOARD_AREA).toBe('cash-reporting-portal');
    expect(areaPath('acme', 'x')).toBe('/t/acme/areas/x');
    expect(areaPath(undefined, 'x')).toBe('/platform/areas/x');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const source = ['src/app/hub/catalogs-hub.component.ts', 'src/app/hub/hub-copy.ts'].map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|delete|remove|erase|destroy|borrar|eliminar|suprimir)\b|window\.location/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('catalogsHubInThePortal', () => {
  async function openPortal() {
    const catalog = new DemoCatalogStore();
    const establishments = new DemoEstablishmentsStore();
    TestBed.configureTestingModule({ providers: [
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      { provide: CatalogItemsSource, useValue: catalog },
      { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
      { provide: AssociatedEstablishmentsSource, useValue: establishments },
      { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    ] });
    const fixture = TestBed.createComponent(PortalShellComponent);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle();
    const host: HTMLElement = fixture.nativeElement;
    const press = async (selector: string, label: string, index = 0) => {
      (Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).filter((button) => button.textContent?.trim() === label)[index]).click();
      await settle();
    };
    return { host, press };
  }

  it('starts on the hub, with no tabs and no second brand', async () => {
    const { host } = await openPortal();
    expect(host.querySelector('h1')?.textContent).toBe(HUB_COPY.title);
    expect(host.querySelector('nav, .crp-brand, .crp-header')).toBeNull();
    expect(host.querySelector('.crp-back')).toBeNull();
  });

  it('opens the transport list with only transport and the back button returns to the hub', async () => {
    const { host, press } = await openPortal();
    await press('.crp-catalog-grid button', HUB_COPY.cards.transport.action);
    expect(host.querySelector('h1')?.textContent).toBe(CATALOG_COPY.title.TRANSPORTATION);
    const types = Array.from(host.querySelectorAll('.crp-table tbody tr'), (row) => row.querySelectorAll('td')[1].textContent?.trim());
    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types)).toEqual(new Set([CATALOG_COPY.types.TRANSPORTATION]));
    await press('.crp-back button', HUB_COPY.back);
    expect(host.querySelector('h1')?.textContent).toBe(HUB_COPY.title);
  });

  it('opens the food list already filtered to restaurants', async () => {
    const { host, press } = await openPortal();
    await press('.crp-catalog-grid button', HUB_COPY.cards.food.action, 1);
    expect(host.querySelector('h1')?.textContent).toBe(ESTABLISHMENTS_COPY.title.RESTAURANT);
    expect((host.querySelector('select[aria-label="Establishment type"]') as HTMLSelectElement).value).toBe('RESTAURANT');
    const types = Array.from(host.querySelectorAll('.crp-table tbody tr'), (row) => row.querySelectorAll('td')[1].textContent?.trim());
    expect(new Set(types)).toEqual(new Set([ESTABLISHMENTS_COPY.types.RESTAURANT]));
  });
});

describe('copFormat', () => {
  it('shows minor units as readable pesos without touching the stored amount', () => {
    expect(formatCop(18_000_000)).toMatch(/^\$\s?180\.000$/);
    expect(formatCop(0)).toMatch(/^\$\s?0$/);
    expect(formatCop(123_456_700)).toMatch(/^\$\s?1\.234\.567$/);
  });
});

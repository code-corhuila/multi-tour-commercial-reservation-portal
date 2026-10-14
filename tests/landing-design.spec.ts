import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { actorAs } from './actor-context.double';

async function openPortal(role: 'TENANT_ADMINISTRATOR' | 'READ_ONLY' = 'TENANT_ADMINISTRATOR') {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) },
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
  ] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  // The sidebar opens the Catálogos hub; the lists are sub-screens it opens (HU-COM-001 v1.9).
  const show = async (area: string) => { fixture.debugElement.injector.get(PortalNavigation).open(area); await settle(); };
  const establishmentsPage = () => show('establishments');
  const catalogPage = () => show('catalog-tours');
  return { host, settle, establishmentsPage, catalogPage };
}

describe('landingComposition', () => {
  it('uses the landing shell, page header, access note, panel and a semantic catalog table', async () => {
    const { host, catalogPage } = await openPortal();
    await catalogPage();
    expect(host.querySelector('.crp-operator-shell .crp-operator-content')).not.toBeNull();
    const header = host.querySelector('.crp-page-header')!;
    expect(header.querySelector('.crp-page-header-main .crp-page-header-eyebrow')?.textContent).toBe('Catálogos');
    expect(header.querySelector('h1.crp-page-header-title.crp-h1')?.textContent).toBe('Gestionar catálogo de tours');
    expect(header.querySelector('.crp-page-header-action button.crp-operator-primary')?.textContent).toBe('Crear tour');
    const panel = host.querySelector('.crp-operator-panel')!;
    expect(panel.querySelector('.crp-operator-panel-head .crp-operator-eyebrow')?.textContent).toBe('Tours y atractivos');
    expect(panel.querySelector('.crp-operator-panel-head h2')?.textContent).toBe('Oferta, salidas y tarifas base');
    expect(panel.querySelector('.crp-operator-copy')?.textContent).toBe(CATALOG_COPY.panelCopy);
    const table = host.querySelector('.crp-table-wrap table.crp-operator-table')!;
    expect(Array.from(table.querySelectorAll('th'), (th) => th.textContent)).toEqual(['Tour', 'Tarifa base', 'Vigencia', 'Estado', 'Acción']);
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
      const cells = row.querySelectorAll('td');
      expect(cells[1].textContent?.trim()).toMatch(/^\$\d{1,3}(\.\d{3})*$/);
      expect(row.querySelector('.crp-operator-status')?.textContent?.trim()).toMatch(/^(Activo|Inactivo)$/);
      expect(Array.from(row.querySelectorAll('button'), (button) => button.textContent?.trim())).toEqual(
        ['Gestionar', row.querySelector('.crp-is-confirmed') ? 'Inactivar' : 'Reactivar']);
    }
  });

  it('keeps establishments filters and actions in the landing composition with both status pills', async () => {
    const { host, establishmentsPage } = await openPortal();
    await establishmentsPage();
    expect(host.querySelector('.crp-page-header h1')?.textContent).toBe(ESTABLISHMENTS_COPY.title.all);
    expect(host.querySelector('.crp-page-header-action')?.textContent).toBe(ESTABLISHMENTS_COPY.newEstablishment);
    expect(host.querySelector('.crp-access-note')?.textContent).toBe(ESTABLISHMENTS_COPY.accessNote);
    expect(host.querySelector('.crp-operator-panel-head h2')?.textContent).toBe(ESTABLISHMENTS_COPY.panelTitle);
    expect(host.querySelectorAll('.crp-filters select')).toHaveLength(2);
    const table = host.querySelector('.crp-table')!;
    expect(Array.from(table.querySelectorAll('th'), (th) => th.textContent)).toEqual(Object.values(ESTABLISHMENTS_COPY.columns));
    expect(table.querySelector('.crp-status.crp-is-confirmed')?.textContent).toBe('ACTIVE');
    expect(table.querySelector('.crp-status.crp-is-pending')?.textContent).toBe('INACTIVE');
  });

  it('retains the same composition in read-only mode without creation or row actions', async () => {
    const { host, catalogPage, establishmentsPage } = await openPortal('READ_ONLY');
    for (const show of [catalogPage, establishmentsPage]) {
      await show();
      expect(host.querySelector('.crp-page-header h1')).not.toBeNull();
      // "Volver a catálogos" is navigation (admin-gestionar-hospedaje.html), not a creation action.
      expect(host.querySelector('.crp-page-header-action.crp-operator-primary, .crp-operator-panel-head button')).toBeNull();
      expect(host.querySelector('.crp-operator-table tbody button')).toBeNull();
      expect(host.querySelectorAll('.crp-operator-table tbody tr').length).toBeGreaterThan(0);
    }
  });
});

describe('landingStylesStayInsideThePortal', () => {
  afterEach(() => document.querySelector('style[data-design-test]')?.remove());
  it('scopes every style rule and keeps assets compatible with the shell CSP', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    expect(css).not.toMatch(/@import|https?:\/\/|@font-face/);
    const style = document.createElement('style');
    style.dataset['designTest'] = '';
    style.textContent = css;
    document.head.append(style);
    const check = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('selectorText' in rule) {
          for (const selector of (rule as CSSStyleRule).selectorText.split(',')) {
            expect(selector.trim()).toMatch(/^\.crp-root(?:\s|$)/);
          }
        } else if ('cssRules' in rule) { check((rule as CSSMediaRule).cssRules); }
      }
    };
    check(style.sheet!.cssRules);
    for (const name of ['operator-shell', 'operator-content', 'operator-panel', 'operator-panel-head',
      'operator-eyebrow', 'table', 'table-wrap', 'status', 'primary', 'outline', 'access-note',
      'page-header', 'page-header-main', 'page-header-eyebrow', 'page-header-title',
      'page-header-desc', 'page-header-action', 'h1', 'is-confirmed', 'is-pending', 'is-cancelled']) {
      expect(css).toContain(`.crp-${name}`);
    }
  });
});

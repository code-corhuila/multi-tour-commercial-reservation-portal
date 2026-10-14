import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { actorAs } from './actor-context.double';
import { ActorContext } from '../src/app/shared/actor-context';

async function openPortal(role: 'TENANT_ADMINISTRATOR' | 'READ_ONLY' = 'TENANT_ADMINISTRATOR') {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) },
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    // The operator pages, also for a read-only operator.
    { provide: PortalAudience, useValue: { audience: 'operator' } },
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
    expect(host.querySelector('.crp-operator-shell .crp-operator-sidebar .crp-operator-nav')).not.toBeNull();
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
    expect(table.textContent).not.toMatch(/ACTIVE|TOUR|TRANSPORTATION/);
  });

  it('keeps establishments filters and actions in the landing composition with both status pills', async () => {
    const { host, establishmentsPage } = await openPortal();
    await establishmentsPage();
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Catálogos');
    expect(host.querySelector('.crp-page-header h1')?.textContent).toBe('Establecimientos asociados');
    expect(host.querySelector('.crp-access-note')?.textContent).toBe('El Colaborador operativo no tiene acceso a esta gestión. '
      + 'Estos registros son convenios informativos y no contienen cupos, tarifas ni inventario reservable.');
    const head = host.querySelector('.crp-operator-panel-head')!;
    expect(head.querySelector('.crp-operator-eyebrow')?.textContent).toBe('Directorio asociado');
    expect(head.querySelector('h2')?.textContent).toBe('Activar, inactivar o reactivar');
    expect(head.querySelector('button.crp-operator-primary')?.textContent).toBe('Agregar establecimiento');
    expect(host.querySelectorAll('.crp-filters select')).toHaveLength(2);
    const table = host.querySelector('.crp-operator-table')!;
    expect(Array.from(table.querySelectorAll('th'), (th) => th.textContent)).toEqual(['Establecimiento', 'Información comercial', 'Estado', 'Acción']);
    expect(table.querySelector('.crp-operator-status.crp-is-confirmed')?.textContent).toBe('Activo');
    expect(table.querySelector('.crp-operator-status.crp-is-pending')?.textContent).toBe('Inactivo');
    expect(table.textContent).not.toMatch(/ACTIVE|HOTEL|RESTAURANT/);
  });

  it('retains the same composition in read-only mode without creation or row actions', async () => {
    const { host, catalogPage, establishmentsPage } = await openPortal('READ_ONLY');
    for (const show of [catalogPage, establishmentsPage]) {
      await show();
      expect(host.querySelector('.crp-page-header h1')).not.toBeNull();
      expect(host.querySelector('.crp-operator-primary, .crp-operator-panel-head button')).toBeNull();
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
    expect(css).toMatch(/grid-template-columns:\s*226px/);
    expect(css).toContain('"Manrope"');
    for (const token of ['--crp-radius-shell: 20px', '--crp-radius-card: 14px', '--crp-space-1: 4px', '--crp-space-8: 64px', '--crp-success: #17685f', '--crp-success-soft: #ddf0e7']) {
      expect(css).toContain(token);
    }
    for (const name of ['operator-shell', 'operator-content', 'operator-panel', 'operator-panel-head',
      'operator-eyebrow', 'table', 'table-wrap', 'status', 'primary', 'outline', 'access-note',
      'page-header', 'page-header-main', 'page-header-eyebrow', 'page-header-title',
      'page-header-desc', 'page-header-action', 'h1', 'is-confirmed', 'is-pending', 'is-cancelled',
      'operator-sidebar', 'operator-brand', 'operator-role', 'operator-nav', 'is-active', 'is-execution', 'is-finalized',
      'operator-primary', 'operator-outline', 'operator-table', 'operator-status']) {
      expect(css).toContain(`.crp-${name}`);
    }
  });
});

// The header and footer stay in the portal column (001- amendment HC-3): portal-column.spec.ts.
describe('customerHeaderLinks', () => {
  const ruleOf = (css: string, selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  };

  it('draws the client canvas of panel-cliente.html and header links without a box, the focus ring only from the keyboard', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    expect(ruleOf(css, '.crp-root .crp-client-content')).toMatch(/width:\s*min\(100% - 32px, 1680px\);\s*margin:\s*12px auto;/);
    const links = ruleOf(css, '.crp-root .crp-client-header button, .crp-root .crp-client-panel-header button');
    expect(links).toMatch(/border:\s*0;/);
    expect(links).toMatch(/background:\s*transparent;/);
    expect(ruleOf(css, '.crp-root .crp-client-header button:focus:not(:focus-visible), .crp-root .crp-client-panel-header button:focus:not(:focus-visible)'))
      .toMatch(/outline: none; box-shadow: none;/);
    expect(ruleOf(css, '.crp-root .crp-client-header button.crp-is-active')).not.toMatch(/text-decoration|border|background/);
  });
});

describe('formGridStaysInTheOperatorShell', () => {
  it('lays forms in two columns only inside the operator shell, never in a client form', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    expect(css).not.toMatch(/\.crp-root form\s*[{>,]/);
    expect(css).toMatch(/\n\.crp-root \.crp-operator-shell form \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });
});

describe('discountScreenStacksAtPhoneWidth', () => {
  it('stacks the operator forms and the discount grid in one column without touching a client form', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    expect(css).toMatch(/\n {2}\.crp-root \.crp-operator-shell form, \.crp-root \.crp-discount-grid, \.crp-root \.crp-discount-hero \{ grid-template-columns: 1fr; \}/);
  });
});

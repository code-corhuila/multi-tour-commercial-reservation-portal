import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
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
  const establishmentsPage = async () => {
    Array.from(host.querySelectorAll('nav button')).find((button) => button.textContent?.trim() === 'Establecimientos')!
      .dispatchEvent(new MouseEvent('click'));
    await settle();
  };
  return { host, settle, establishmentsPage };
}

describe('landingComposition', () => {
  it('uses the landing shell, page header, access note, panel and a semantic catalog table', async () => {
    const { host } = await openPortal();
    expect(host.querySelector('.crp-operator-shell .crp-operator-content')).not.toBeNull();
    expect(host.querySelector('.crp-operator-shell .crp-operator-sidebar .crp-operator-nav')).not.toBeNull();
    const header = host.querySelector('.crp-page-header')!;
    expect(header.querySelector('.crp-page-header-main .crp-page-header-eyebrow')?.textContent).toBe(CATALOG_COPY.eyebrow);
    expect(header.querySelector('h1.crp-page-header-title.crp-h1')?.textContent).toBe(CATALOG_COPY.title.all);
    expect(header.querySelector('button.crp-primary.crp-page-header-action')?.textContent).toBe(CATALOG_COPY.newItem);
    expect(host.querySelector('.crp-access-note')?.textContent).toBe(CATALOG_COPY.accessNote);
    expect(host.querySelector('.crp-operator-panel .crp-operator-panel-head h2')?.textContent).toBe(CATALOG_COPY.panelTitle);
    const table = host.querySelector('.crp-table-wrap table.crp-table')!;
    expect(Array.from(table.querySelectorAll('th'), (th) => th.textContent)).toEqual(Object.values(CATALOG_COPY.columns));
    expect(table.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
    for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
      const cells = row.querySelectorAll('td');
      expect(Object.values(CATALOG_COPY.types)).toContain(cells[1].textContent?.trim());
      expect(cells[2].textContent?.trim()).toMatch(/^\$\s?\d{1,3}(\.\d{3})*$/);
      expect(row.querySelector('.crp-status')?.textContent?.trim()).toMatch(/^(ACTIVE|INACTIVE)$/);
      expect(row.querySelector('button.crp-row-manage, button.crp-row-toggle')).not.toBeNull();
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
    const { host, establishmentsPage } = await openPortal('READ_ONLY');
    for (const show of [async () => undefined, establishmentsPage]) {
      await show();
      expect(host.querySelector('.crp-page-header h1')).not.toBeNull();
      expect(host.querySelector('.crp-page-header-action')).toBeNull();
      expect(host.querySelector('.crp-table tbody button')).toBeNull();
      expect(host.querySelectorAll('.crp-table tbody tr').length).toBeGreaterThan(0);
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

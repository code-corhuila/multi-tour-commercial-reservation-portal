import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { PORTAL_ROUTES, CATALOG_ROUTES } from '../src/app/catalog/catalog.routes';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DISCOUNT_ROUTES } from '../src/app/discounts/discounts.routes';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { actorAs } from './actor-context.double';
import { ControllableDiscountRulesSource, discountNamed } from './discount-rules-source.double';
import { ControllableDiscountRulesWriter } from './discount-rules-writer.double';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';
import { DISCOUNTS_PAGE_PANELS, contribute } from '../src/app/shared/portal-slots';
const RAW_CODES = /\b(ACTIVE|INACTIVE|IN_FORCE|UPCOMING|EXPIRED|PERCENTAGE|FIXED_AMOUNT|ORIGINAL_VALUE|PREVIOUS_SUBTOTAL)\b/;

export async function openDiscounts(role: ActorRole = 'TENANT_ADMINISTRATOR', providers: any[] = []) {
  const source = new ControllableDiscountRulesSource();
  TestBed.configureTestingModule({ providers: [{ provide: DiscountRulesSource, useValue: source },
    { provide: ActorContext, useValue: actorAs(role) }, ...providers] });
  const fixture = TestBed.createComponent(DiscountsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle(); const element: HTMLElement = fixture.nativeElement;
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  return { fixture, element, source, settle, state };
}
describe('discount list states and newest request', () => {
  it('shows loading, error with retry, empty, and priority ordered data including inactive rules', async () => {
    const p = await openDiscounts(); expect(p.state()).toBe('loading');
    p.source.requests[0].fail(); await p.settle(); expect(p.state()).toBe('error');
    Array.from(p.element.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Reintentar')!.click(); await p.settle();
    expect(p.state()).toBe('loading'); p.source.requests[1].reply([]); await p.settle(); expect(p.state()).toBe('empty');
    p.fixture.componentInstance.reload(); p.source.requests[2].reply([discountNamed('Second', 2), { ...discountNamed('First'), status: 'INACTIVE' }]);
    await p.settle(); expect(p.state()).toBe('data');
    const rows = Array.from(p.element.querySelectorAll('li'), r => r.textContent);
    expect(rows[0]).toContain('First'); expect(rows[1]).toContain('Second');
    for (const text of ['First', 'Vigente hasta el 31 dic 2026.', 'Prioridad 1, no acumulable.', '12,5% de descuento', 'Inactivo']) expect(rows[0]).toContain(text);
    expect(rows[0]).not.toMatch(/2026-01-01|12\.50/); expect(p.element.textContent).not.toMatch(RAW_CODES);
  });
  it('draws screen 12: header, hero, numbered panel, promotions and Spanish badges', async () => {
    const p = await openDiscounts('TENANT_ADMINISTRATOR', [{ provide: DiscountRulesWriter, useValue: new ControllableDiscountRulesWriter() }]);
    const rule = (name: string, startsOn: string, endsOn: string, priority: number) => ({ ...discountNamed(name, priority), startsOn, endsOn });
    const capped = { ...rule('Tope', '2000-01-01', '2999-12-31', 5), capCents: 8_000_000, stackable: true, calculationBase: 'PREVIOUS_SUBTOTAL' as const };
    p.source.requests[0].reply([rule('En curso', '2000-01-01', '2999-12-31', 1), rule('Futuro', '2999-01-01', '2999-12-31', 2),
      rule('Pasado', '2000-01-01', '2000-12-31', 3), { ...rule('Apagado', '2000-01-01', '2999-12-31', 4), status: 'INACTIVE' },
      capped]);
    await p.settle(); const e = p.element;
    expect(e.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Reglas comerciales');
    expect(e.querySelector('h1')?.textContent).toBe('Descuentos');
    expect(e.querySelector('.crp-page-header .crp-primary')?.textContent?.trim()).toBe('Crear descuento');
    expect(e.querySelector('.crp-discount-hero')?.textContent).toContain('Descuentos visibles y trazables.');
    expect(e.querySelector('.crp-discount-hero')?.textContent).toContain('Define vigencia, prioridad, acumulación, topes y base de cálculo para los tours. Un descuento general se fija en el contexto comercial de cada reserva al crearla: los cambios posteriores no afectan reservas ya creadas.');
    expect(e.querySelector('.crp-operator-panel .crp-operator-eyebrow')?.textContent).toBe('Vigentes');
    expect(e.querySelector('.crp-operator-panel h2')?.textContent).toBe('Promociones activas');
    expect(e.querySelector('.crp-operator-panel .crp-operator-panel-head .crp-operator-status')?.textContent).toBe('2 activas');
    const items = Array.from(e.querySelectorAll('li.crp-discount-promo'));
    expect(items.map(i => i.querySelector('.crp-operator-status')?.textContent)).toEqual(['Vigente', 'Próximo', 'Vencido', 'Inactivo', 'Vigente']);
    expect(items[0].querySelector('.crp-operator-status')?.classList).toContain('crp-is-confirmed');
    expect(items[3].querySelector('.crp-operator-status')?.classList).toContain('crp-is-pending');
    expect(items[0].querySelector('strong')?.textContent).toBe('12,5% de descuento');
    expect(items[4].querySelector('strong')?.textContent).toBe('12,5% de descuento');
    expect(items[0].querySelector('span')?.textContent).toBe('En curso'); expect(items[0].textContent).toContain('Base de cálculo: valor original.');
    expect(items[4].querySelector('p')?.textContent).toBe('Vigente hasta el 31 dic 2999. Base de cálculo: subtotal resultante del descuento anterior. Prioridad 5, acumulable. Tope: $80.000.');
    expect(items[0].querySelector('p')?.textContent).not.toContain('Tope');
    expect(Array.from(items[0].querySelectorAll('button'), b => b.textContent?.trim())).toEqual(['Editar parámetros', 'Inactivar']);
    expect(Array.from(items[3].querySelectorAll('button'), b => b.textContent?.trim())).toEqual(['Editar parámetros']);
    expect(e.textContent).not.toMatch(RAW_CODES); expect(e.textContent).not.toMatch(/Discount|Retry|Loading|No results/);
  });
  it('writes the loading, empty, error and denied states in Spanish', async () => {
    const p = await openDiscounts(); expect(p.element.textContent).toContain('Cargando descuentos');
    p.source.requests[0].fail(); await p.settle(); expect(p.element.textContent).toContain('No se pudieron cargar los descuentos.');
    p.fixture.componentInstance.reload(); p.source.requests[1].reply([]); await p.settle();
    expect(p.element.textContent).toContain('Aún no hay descuentos configurados.');
    TestBed.resetTestingModule(); const denied = await openDiscounts('OPERATIONAL_COLLABORATOR');
    expect(denied.element.textContent).toContain('No tienes acceso a los descuentos.');
  });
  it('unsubscribes the previous request and ignores its slower response', async () => {
    const p = await openDiscounts(); p.fixture.componentInstance.reload();
    p.source.requests[1].reply([discountNamed('New')]); p.source.requests[0].reply([discountNamed('Old')]); await p.settle();
    expect(p.element.textContent).toContain('New'); expect(p.element.textContent).not.toContain('Old');
    expect(p.source.requests[0].isOpen()).toBe(false);
  });
  it('ends the outstanding request with the component lifetime', async () => {
    const p = await openDiscounts(); TestBed.resetTestingModule(); expect(p.source.requests[0].isOpen()).toBe(false);
  });
});
describe('discount route fails closed', () => {
  for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY'] as const) {
    it(`denies ${role} by the address and exposes no entry`, async () => {
      const source = new ControllableDiscountRulesSource();
      TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES), { provide: ActorContext, useValue: actorAs(role) },
        { provide: DiscountRulesSource, useValue: source }] });
      const h = await RouterTestingHarness.create();
      await expect(h.navigateByUrl('/discounts')).rejects.toThrow('Cannot match any routes');
      expect(h.routeNativeElement).toBeNull(); expect(source.requests).toHaveLength(0);
      TestBed.resetTestingModule(); const p = await openDiscounts(role);
      expect(p.element.querySelector('a, button, form, ul')).toBeNull(); expect(p.source.requests).toHaveLength(0);
    });
    it(`canActivate independently refuses ${role}`, () => {
      TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role) }] });
      const guard = DISCOUNT_ROUTES[0].canActivate![0] as () => boolean;
      expect(TestBed.runInInjectionContext(() => guard())).toBe(false);
    });
  }
  it('admits the administrator and keeps federation catalog routes separate', async () => {
    const source = new ControllableDiscountRulesSource();
    TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES), { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      { provide: DiscountRulesSource, useValue: source }] });
    const h = await RouterTestingHarness.create(); await h.navigateByUrl('/discounts', DiscountsPageComponent);
    expect(h.routeNativeElement?.textContent).toContain('Descuentos'); expect(source.requests).toHaveLength(1);
    expect(CATALOG_ROUTES.some(r => r.path === 'discounts')).toBe(false);
  });
  it('an absent container actor also denies the address', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES)] });
    const h = await RouterTestingHarness.create(); await expect(h.navigateByUrl('/discounts')).rejects.toThrow('Cannot match any routes');
  });
});

@Component({ selector: 'app-stub-panel', template: '<section data-stub-panel>Decisiones excepcionales</section>' })
class StubPanelComponent {}
describe('theDiscountsPageDrawsTheContributedPanels', () => {
  it('draws what another story contributes after the list, and nothing when nobody does', async () => {
    const bare = await openDiscounts(); bare.source.requests[0].reply([discountNamed()]); await bare.settle();
    expect(bare.element.querySelector('[data-stub-panel]')).toBeNull();
    TestBed.resetTestingModule();
    const p = await openDiscounts('TENANT_ADMINISTRATOR', [contribute(DISCOUNTS_PAGE_PANELS, { component: StubPanelComponent, order: 1 })]);
    p.source.requests[0].reply([discountNamed()]); await p.settle();
    const panel = p.element.querySelector('[data-stub-panel]')!, list = p.element.querySelector('.crp-discount-list')!;
    expect(panel.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

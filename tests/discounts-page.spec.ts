import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { ActorContext } from '../src/app/catalog/data/catalog-api.service';
import { PORTAL_ROUTES, CATALOG_ROUTES } from '../src/app/catalog/catalog.routes';
import { ActorRole } from '../src/app/catalog/model/catalog-item';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DISCOUNT_ROUTES } from '../src/app/discounts/discounts.routes';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { actorAs } from './actor-context.double';
import { ControllableDiscountRulesSource, discountNamed } from './discount-rules-source.double';

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
    Array.from(p.element.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Retry')!.click(); await p.settle();
    expect(p.state()).toBe('loading'); p.source.requests[1].reply([]); await p.settle(); expect(p.state()).toBe('empty');
    p.fixture.componentInstance.reload(); p.source.requests[2].reply([discountNamed('Second', 2), { ...discountNamed('First'), status: 'INACTIVE' }]);
    await p.settle(); expect(p.state()).toBe('data');
    const rows = Array.from(p.element.querySelectorAll('li'), r => r.textContent);
    expect(rows[0]).toContain('First'); expect(rows[1]).toContain('Second');
    for (const text of ['2026-01-01', '2026-12-31', '12.50', 'INACTIVE']) expect(rows[0]).toContain(text);
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
    expect(h.routeNativeElement?.textContent).toContain('Discount rules'); expect(source.requests).toHaveLength(1);
    expect(CATALOG_ROUTES.some(r => r.path === 'discounts')).toBe(false);
  });
  it('an absent container actor also denies the address', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES)] });
    const h = await RouterTestingHarness.create(); await expect(h.navigateByUrl('/discounts')).rejects.toThrow('Cannot match any routes');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ActorContext, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { ControllableDiscountRulesSource, discountNamed } from './discount-rules-source.double';
import { ControllableDiscountRulesWriter } from './discount-rules-writer.double';
async function open() {
  const source = new ControllableDiscountRulesSource(), writer = new ControllableDiscountRulesWriter(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    { provide: DiscountRulesSource, useValue: source }, { provide: DiscountRulesWriter, useValue: writer }, { provide: IdempotencyKeys, useValue: keys }] });
  const fixture = TestBed.createComponent(DiscountsPageComponent), element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const click = async (text: string) => { Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === text)!.click(); await settle(); };
  await settle(); source.requests[0].reply([discountNamed()]); await settle();
  return { fixture, element, source, writer, keys, settle, click };
}
describe('discount management intentions', () => {
  it('asks confirmation, preserves reservations, cancels without writing, and retries inactivation with the same key', async () => {
    const p = await open(); await p.click('Inactivate');
    expect(p.element.querySelector('[role="dialog"]')?.textContent).toContain('Existing reservations keep their discount');
    expect(p.writer.calls).toHaveLength(0); await p.click('Cancel'); expect(p.element.querySelector('[role="dialog"]')).toBeNull();
    await p.click('Inactivate'); await p.click('Confirm inactivation'); await p.click('Confirm inactivation');
    expect(p.writer.calls).toHaveLength(1); expect(p.writer.calls[0]).toMatchObject({ kind: 'inactivate', id: 'Promotion' });
    expect(p.element.querySelector<HTMLButtonElement>('[role="dialog"] button')!.disabled).toBe(true);
    p.writer.calls[0].fail(apiError()); await p.settle(); expect(p.element.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
    await p.click('Confirm inactivation'); expect(p.writer.calls[1].key).toBe(p.writer.calls[0].key);
    p.writer.calls[1].reply({ ...discountNamed(), status: 'INACTIVE' }); await p.settle();
    expect(p.element.querySelector('li')?.textContent).toContain('INACTIVE');
    expect(p.element.querySelector('[role="dialog"]')).toBeNull();
    expect(Array.from(p.element.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Inactivate')).toBe(false);
  });
  it('opens create and edit forms, cancels them and renews the intention on reopening', async () => {
    const p = await open(); await p.click('New discount rule');
    const first = p.keys.generated.at(-1); expect(p.element.querySelector('form')).not.toBeNull();
    await p.click('Cancel'); await p.click('New discount rule'); expect(p.keys.generated.at(-1)).not.toBe(first);
    await p.click('Cancel'); await p.click('Edit'); expect(p.element.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe('Promotion');
  });
  it('inserts a created rule into the list and replaces an edited rule without duplicates', async () => {
    const p = await open(); await p.click('Edit');
    const name = p.element.querySelector<HTMLInputElement>('[name="name"]')!; name.value = 'Updated'; name.dispatchEvent(new Event('input'));
    p.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await p.settle();
    p.writer.calls[0].reply({ ...discountNamed(), name: 'Updated' }); await p.settle();
    expect(p.element.querySelectorAll('li')).toHaveLength(1); expect(p.element.querySelector('li')?.textContent).toContain('Updated');
    await p.click('New discount rule');
    for (const [field, value] of Object.entries({ name: 'Created', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: '2', value: '0.07' })) {
      const input = p.element.querySelector<HTMLInputElement>(`[name="${field}"]`)!; input.value = value; input.dispatchEvent(new Event('input'));
    }
    p.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await p.settle();
    p.writer.calls[1].reply(discountNamed('Created', 2)); await p.settle(); expect(p.element.querySelectorAll('li')).toHaveLength(2);
  });
});

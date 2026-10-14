import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { FORM_TOURS } from './discount-form.helpers';
import { describe, expect, it } from 'vitest';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { ControllableDiscountRulesSource, discountNamed } from './discount-rules-source.double';
import { ControllableDiscountRulesWriter } from './discount-rules-writer.double';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
async function open() {
  const source = new ControllableDiscountRulesSource(), writer = new ControllableDiscountRulesWriter(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    { provide: DiscountRulesSource, useValue: source }, { provide: DiscountRulesWriter, useValue: writer }, { provide: IdempotencyKeys, useValue: keys }, { provide: CatalogItemsSource, useValue: { list: () => of(FORM_TOURS) } }] });
  const fixture = TestBed.createComponent(DiscountsPageComponent), element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const click = async (text: string) => { Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === text)!.click(); await settle(); };
  await settle(); source.requests[0].reply([discountNamed()]); await settle();
  return { fixture, element, source, writer, keys, settle, click };
}
describe('discount management intentions', () => {
  it('asks confirmation, preserves reservations, cancels without writing, and retries inactivation with the same key', async () => {
    const p = await open(); await p.click('Inactivar');
    expect(p.element.querySelector('[role="dialog"]')?.textContent).toContain('Las reservas existentes conservan el descuento que ya tienen');
    expect(p.writer.calls).toHaveLength(0); await p.click('Cancelar'); expect(p.element.querySelector('[role="dialog"]')).toBeNull();
    await p.click('Inactivar'); await p.click('Confirmar inactivación'); await p.click('Confirmar inactivación');
    expect(p.writer.calls).toHaveLength(1); expect(p.writer.calls[0]).toMatchObject({ kind: 'inactivate', id: 'Promotion' });
    expect(p.element.querySelector<HTMLButtonElement>('[role="dialog"] button')!.disabled).toBe(true);
    p.writer.calls[0].fail(apiError()); await p.settle(); expect(p.element.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
    await p.click('Confirmar inactivación'); expect(p.writer.calls[1].key).toBe(p.writer.calls[0].key);
    p.writer.calls[1].reply({ ...discountNamed(), status: 'INACTIVE' }); await p.settle();
    expect(p.element.querySelector('li')?.textContent).toContain('Inactivo');
    expect(p.element.querySelector('[role="dialog"]')).toBeNull();
    expect(Array.from(p.element.querySelectorAll('button')).some(b => b.textContent?.trim() === 'Inactivar')).toBe(false);
  });
  it('opens create and edit forms, cancels them and renews the intention on reopening', async () => {
    const p = await open(); await p.click('Crear descuento');
    const first = p.keys.generated.at(-1); expect(p.element.querySelector('form')).not.toBeNull();
    await p.click('Cancelar'); await p.click('Crear descuento'); expect(p.keys.generated.at(-1)).not.toBe(first);
    expect(p.element.querySelector('h1')?.textContent).toBe('Nuevo descuento'); expect(p.element.querySelector('ul')).toBeNull();
    await p.click('Volver a descuentos'); expect(p.element.querySelector('form')).toBeNull(); expect(p.element.querySelector('h1')?.textContent).toBe('Descuentos');
    await p.click('Editar parámetros'); expect(p.element.querySelector<HTMLInputElement>('[name="tourId"]')?.value).toBe('tour-Promotion');
    expect(p.element.querySelector('h1')?.textContent).toBe('Editar descuento');
    expect(p.element.querySelector('form [type="submit"]')?.textContent?.trim()).toBe('Guardar cambios');
  });
  it('inserts a created rule into the list and replaces an edited rule without duplicates', async () => {
    const p = await open(); await p.click('Editar parámetros');
    const name = p.element.querySelector<HTMLInputElement>('[name="priority"]')!; name.value = '3'; name.dispatchEvent(new Event('input'));
    p.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await p.settle();
    p.writer.calls[0].reply({ ...discountNamed(), tourName: 'Updated' }); await p.settle();
    expect(p.element.querySelectorAll('li')).toHaveLength(1); expect(p.element.querySelector('li')?.textContent).toContain('Updated');
    await p.click('Crear descuento');
    for (const [field, value] of Object.entries({ tourId: 'tour-2', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: '2', percentage: '12.5' })) {
      const input = p.element.querySelector<HTMLInputElement>(`[name="${field}"]`)!; input.value = value; input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    }
    p.element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await p.settle();
    p.writer.calls[1].reply(discountNamed('Created', 2)); await p.settle(); expect(p.element.querySelectorAll('li')).toHaveLength(2);
  });
});

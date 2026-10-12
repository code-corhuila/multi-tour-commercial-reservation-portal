import { TestBed } from '@angular/core/testing';
import { ActorContext, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { DiscountRuleFormComponent } from '../src/app/discounts/components/discount-rule-form.component';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountRule } from '../src/app/discounts/model/discount-rule';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { ControllableDiscountRulesWriter } from './discount-rules-writer.double';
export async function openDiscountForm(rule?: DiscountRule) {
  const writer = new ControllableDiscountRulesWriter(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    { provide: DiscountRulesWriter, useValue: writer }, { provide: IdempotencyKeys, useValue: keys }] });
  const fixture = TestBed.createComponent(DiscountRuleFormComponent);
  if (rule) fixture.componentRef.setInput('rule', rule);
  const element: HTMLElement = fixture.nativeElement;
  const saved: DiscountRule[] = []; fixture.componentInstance.saved.subscribe(r => saved.push(r));
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const field = (name: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const text = async (name: string, value: string) => { field(name).value = value;
    field(name).dispatchEvent(new Event(field(name).tagName === 'SELECT' ? 'change' : 'input')); await settle(); };
  const blur = async (name: string) => { field(name).dispatchEvent(new Event('blur')); await settle(); };
  const submit = async () => { element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  const fill = async () => { for (const [name, value] of Object.entries({ name: 'Promotion', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: '1', value: '12.5' })) await text(name, value); };
  const errorFor = (name: string) => element.querySelector(`[id="${field(name).getAttribute('aria-describedby')}"]`)?.textContent;
  return { fixture, element, writer, keys, saved, settle, field, text, blur, submit, fill, errorFor };
}

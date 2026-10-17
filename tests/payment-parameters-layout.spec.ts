import { readFileSync } from 'node:fs';
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { DemoPaymentParametersStore } from '../src/app/demo/payment-parameters-demo';
import { PaymentParametersSource, PaymentParametersWriter } from '../src/app/payment-parameters/data/payment-parameters-ports';
import { PaymentParametersPageComponent } from '../src/app/payment-parameters/pages/payment-parameters-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-009 amendment v1.9, A.3: the card "Por servicio y tipo de pago" of admin-parametros-pago.html is as wide as the content, as the audit card,
// and its table shows the six parameters. The operator shell lays every form out in two columns; this one overrides it, as the reservation form does.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};

describe('theParametersCardIsAsWideAsTheContent', () => {
  it('overrides the two-column grid of the operator forms with one full-width column and no outer margin', () => {
    const rule = ruleOf('.crp-root .crp-operator-shell .crp-payment-parameters-form');
    expect(rule).toMatch(/display:\s*grid;/);
    expect(rule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(rule).toMatch(/margin:\s*0;/);
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|\bvh\b|fixed|sticky|z-index/i);
  });

  it('puts the card and its table inside that form, with the six parameters and the service as columns', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
      { provide: PaymentParametersSource, useValue: new DemoPaymentParametersStore() }, { provide: PaymentParametersWriter, useValue: {} },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }] as Provider[] });
    const fixture = TestBed.createComponent(PaymentParametersPageComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const form = (fixture.nativeElement as HTMLElement).querySelector('form')!;
    expect(form.classList).toContain('crp-payment-parameters-form');
    const card = form.querySelector('section.crp-operator-panel')!;
    expect(card.parentElement).toBe(form);
    const heads = Array.from(card.querySelectorAll('.crp-table-wrap thead th'), (h) => h.textContent!.trim());
    expect(heads).toEqual(['Servicio', 'Inicial pago total (h)', 'Inicial abono (h)', 'Abono mínimo (%)', 'Ampliación (h)', 'Saldo (h antes)', 'Penalidad (%)']);
    expect(card.querySelectorAll('tbody tr')[0].querySelectorAll('input').length).toBe(6);
  });

  it('keeps the horizontal scroll in the table wrapper, not in the card', () => {
    expect(ruleOf('.crp-root .crp-table-wrap')).toMatch(/overflow-x:\s*auto;/);
  });
});

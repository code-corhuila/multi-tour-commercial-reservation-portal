import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFailure } from '../src/app/shared/read-failure';
import { apiError } from './catalog-items-writer.double';
import { TestBed } from '@angular/core/testing';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { actorAs } from './actor-context.double';
import { ControllableDiscountRulesSource } from './discount-rules-source.double';
import { listSourceFiles, withoutComments } from './source-files';

async function openDiscounts() {
  const source = new ControllableDiscountRulesSource();
  TestBed.configureTestingModule({ providers: [{ provide: DiscountRulesSource, useValue: source }, { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }] });
  const fixture = TestBed.createComponent(DiscountsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  return { source, settle, element: fixture.nativeElement as HTMLElement };
}

// Pillar 8 (errors): a failed read says what the service said (userMessage) and its trace, like a failed write does.
describe('readFailureKeepsTheUniqueMessageOfThePortal', () => {
  it('carries the userMessage and the traceId of an API error, and nothing for any other failure', () => {
    expect(readFailure(apiError({ userMessage: 'Servicio no disponible por mantenimiento.', traceId: 'trace-77' })))
      .toEqual({ userMessage: 'Servicio no disponible por mantenimiento.', traceId: 'trace-77' });
    expect(readFailure(new Error('boom'))).toEqual({});
    expect(readFailure(undefined)).toEqual({});
  });
});

describe('theErrorStateOfAReadShowsTheMessageAndTheTrace', () => {
  it('shows the message of the service and its trace in the discounts list, and the page copy when the failure has none', async () => {
    const p = await openDiscounts();
    p.source.requests[0].fail(apiError({ userMessage: 'Servicio no disponible por mantenimiento.', traceId: 'trace-77' })); await p.settle();
    const alert = p.element.querySelector('[data-state="error"]')!;
    expect(alert.textContent).toContain('Servicio no disponible por mantenimiento.');
    expect(alert.textContent).toContain('trace-77');
    expect(alert.querySelector('button')).not.toBeNull();
  });

  it('keeps the copy of the page when the failure carries no message', async () => {
    const p = await openDiscounts();
    p.source.requests[0].fail(); await p.settle();
    const alert = p.element.querySelector('[data-state="error"]')!;
    expect(alert.textContent).not.toContain('trace');
    expect(alert.textContent?.trim().length).toBeGreaterThan('Reintentar'.length);
  });
});

describe('everyReadThatFailsHandsTheFailureToItsErrorState', () => {
  it('has no catchError that builds an error state without readFailure', () => {
    const breaches = listSourceFiles().filter((file) => file.endsWith('.ts') && !file.startsWith('src/app/demo/')).flatMap((file) =>
      withoutComments(readFileSync(file, 'utf8')).split('\n')
        .filter((line) => /catchError\(\(.*\) => of</.test(line) && /kind: 'error'/.test(line) && !/readFailure\(/.test(line)).map(() => file));
    expect(breaches).toEqual([]);
  });
});

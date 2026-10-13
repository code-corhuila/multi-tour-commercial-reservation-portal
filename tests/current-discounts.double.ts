import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { ActorContext, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { AdditionalDiscountWriter } from '../src/app/current-discounts/data/additional-discount-writer';
import { CurrentDiscountsSource } from '../src/app/current-discounts/data/current-discounts-source';
import { AdditionalDiscount, AdditionalDiscountCommand, ApplicableRule, PricedService } from '../src/app/current-discounts/model/current-discounts';
import { CurrentDiscountsPageComponent } from '../src/app/current-discounts/pages/current-discounts-page.component';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { ActorRole } from '../src/app/shared/portal-capabilities';

/** A rule shaped as HU-COM-003's DiscountRule; in force all 2026 unless a test says otherwise. */
export function ruleNamed(name: string, priority: number, overrides: Partial<ApplicableRule> = {}): ApplicableRule {
  return { name, priority, startsOn: '2026-01-01', endsOn: '2026-12-31', calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE',
    type: 'PERCENTAGE', percentageBasisPoints: 1000, ...overrides } as ApplicableRule;
}

export function serviceNamed(serviceName: string, rules: readonly ApplicableRule[] = [ruleNamed('Season', 1)]): PricedService {
  return { serviceId: `svc-${serviceName}`, serviceName, baseCents: 10_000_000, rules };
}

export class ControllableCurrentDiscountsSource extends CurrentDiscountsSource {
  readonly requests: { date: string; reply: (items: readonly PricedService[]) => void; fail: () => void }[] = [];
  override list(date: string): Observable<readonly PricedService[]> {
    return new Observable((subscriber) => {
      this.requests.push({ date, reply: (items) => { subscriber.next(items); subscriber.complete(); },
        fail: () => subscriber.error(new Error('unavailable')) });
    });
  }
}

export class ControllableAdditionalDiscountWriter extends AdditionalDiscountWriter {
  readonly calls: { command: AdditionalDiscountCommand; key: string; reply: (stored: AdditionalDiscount) => void; fail: (error: unknown) => void }[] = [];
  override register(command: AdditionalDiscountCommand, key: string): Observable<AdditionalDiscount> {
    const answers = new Subject<AdditionalDiscount>();
    this.calls.push({ command, key, reply: (stored) => { answers.next(stored); answers.complete(); }, fail: (error) => answers.error(error) });
    return answers;
  }
}

export async function openCurrentDiscounts(role: ActorRole = 'TENANT_ADMINISTRATOR') {
  const source = new ControllableCurrentDiscountsSource(), writer = new ControllableAdditionalDiscountWriter(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: CurrentDiscountsSource, useValue: source },
    { provide: AdditionalDiscountWriter, useValue: writer }, { provide: IdempotencyKeys, useValue: keys },
    { provide: ActorContext, useValue: actorAs(role) }] });
  const fixture = TestBed.createComponent(CurrentDiscountsPageComponent);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const field = (name: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`form [name="${name}"]`)!;
  const type = async (name: string, value: string) => {
    field(name).value = value; field(name).dispatchEvent(new Event(field(name).tagName === 'SELECT' ? 'change' : 'input')); await settle();
  };
  const submitButton = () => element.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const errorFor = (name: string) => element.querySelector(`[id="${field(name).getAttribute('aria-describedby')}"]`)?.textContent;
  const lines = () => Array.from(element.querySelectorAll('[data-line]'), (line) => line.textContent ?? '');
  return { fixture, element, source, writer, keys, settle, state, field, type, submitButton, errorFor, lines };
}

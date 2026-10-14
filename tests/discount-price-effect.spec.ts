import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { DemoDiscountRulesStore } from '../src/app/demo/discounts-demo';
import { DemoReservationDiscounts } from '../src/app/demo/reservations-demo';
import { applyDiscounts } from '../src/app/demo/discount-calculation';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../src/app/discounts/model/discount-rule';
import { ReservationQuoteSource } from '../src/app/reservations/data/reservation-quote-source';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ReservationsWriter } from '../src/app/reservations/data/reservations-writer';
import { SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { sourceProviders } from '../src/app/sources.demo';
import { ruleNamed } from './current-discounts.double';

// HU-COM-003 amendment v1.9, T-V19-2: AC-PD.13, AC-PD.14, AC-PD.15. Money in cents, percentages in basis points.
const AT = '2026-10-14';
const HUNDRED = 10_000_000;
const rule = (priority: number, over: Partial<DiscountRule> = {}): DiscountRule => ({ id: `r${priority}`, tourId: 'demo-svc-2', tourName: 'Ruta del café en Pitalito',
  percentageBasisPoints: 1000, stackable: true, startsOn: '2026-01-01', endsOn: '2026-12-31', priority, calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE', ...over });
const discountsOver = (...rules: DiscountRule[]) => { const store = new DemoDiscountRulesStore(); store.rules = rules; return new DemoReservationDiscounts(() => store.rules); };

describe('rulesApplyByPriorityBaseCapAndAccumulation', () => {
  it('applies by priority, each on its base: 10 % of the original, then 50 % of what is left', () => {
    const result = applyDiscounts(HUNDRED, [ruleNamed('B', 2, { calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 5000 }), ruleNamed('A', 1)], AT);
    expect(result.lines.map((l) => [l.name, l.baseCents, l.amountCents])).toEqual([['A', HUNDRED, 1_000_000], ['B', 9_000_000, 4_500_000]]);
    expect(result.finalCents).toBe(4_500_000);
  });
  it('caps the amount one rule takes off', () => {
    const result = applyDiscounts(HUNDRED, [ruleNamed('Capped', 1, { percentageBasisPoints: 5000, capCents: 800_000 })], AT);
    expect(result.lines[0].amountCents).toBe(800_000); expect(result.finalCents).toBe(9_200_000);
  });
  it('stops the chain after a rule that is not stackable, and lets the next one apply after one that is', () => {
    const rules = [ruleNamed('First', 1, { stackable: false }), ruleNamed('Second', 2)];
    expect(applyDiscounts(HUNDRED, rules, AT).lines.map((l) => l.name)).toEqual(['First']);
    expect(applyDiscounts(HUNDRED, [ruleNamed('First', 1, { stackable: true }), ruleNamed('Second', 2)], AT).lines.map((l) => l.name)).toEqual(['First', 'Second']);
  });
  it('the reservation port gives the lines of the rules of the tour in force, in cents, and none for another tour, date or state', () => {
    const port = discountsOver(rule(2, { percentageBasisPoints: 500, calculationBase: 'PREVIOUS_SUBTOTAL' }), rule(1, { capCents: 500_000 }),
      rule(3, { tourId: 'demo-svc-1' }), rule(4, { endsOn: '2026-10-01' }), rule(5, { status: 'INACTIVE' }));
    expect(port.apply(HUNDRED, { tourId: 'demo-svc-2', at: AT })).toEqual([
      { name: '10% de descuento', base: 'ORIGINAL_VALUE', amountCents: 500_000 }, { name: '5% de descuento', base: 'PREVIOUS_SUBTOTAL', amountCents: 475_000 }]);
    expect(port.apply(HUNDRED, { tourId: 'none', at: AT })).toEqual([]);
    expect(port.apply(HUNDRED)).toEqual([]);
  });
});

describe('aRuleInForceReachesTheQuoteOfTheThreeScreens', () => {
  const command: DiscountRuleCommand = { tourId: 'demo-svc-2', startsOn: '2000-01-01', endsOn: '2999-12-31', priority: 9, calculationBase: 'ORIGINAL_VALUE',
    percentageBasisPoints: 1234, stackable: true };
  const request = { departureId: 'demo-dep-2', serviceIds: ['demo-svc-2'], people: 1 };
  beforeEach(() => TestBed.configureTestingModule({ providers: sourceProviders(undefined as never) }));
  const names = (q: { discounts: readonly { name: string }[] }) => q.discounts.map((d) => d.name);

  it('shows the new discount line in 10B (quote), 21 (selection quote) and 10A (the reservation created)', async () => {
    const quotes = TestBed.inject(ReservationQuoteSource), selection = TestBed.inject(SelectionQuoteSource);
    expect(names(await firstValueFrom(quotes.quote(request)))).not.toContain('12,34% de descuento');
    await firstValueFrom(TestBed.inject(DiscountRulesWriter).create(command, 'k-effect'));
    const quote = await firstValueFrom(quotes.quote(request));
    const line = quote.discounts.find((d) => d.name === '12,34% de descuento')!;
    expect(line).toBeDefined(); expect(line.base).toBe('ORIGINAL_VALUE'); expect(Number.isInteger(line.amountCents)).toBe(true);
    expect(quote.finalCents).toBe(quote.projectedCents - quote.discountCents);
    const onScreen21 = await firstValueFrom(selection.quote(request));
    expect(onScreen21.discountCents).toBe(quote.discountCents); expect(onScreen21.finalValueCents).toBe(quote.finalCents);
    const created = await firstValueFrom(TestBed.inject(ReservationsWriter).create({ leadCustomerId: 'demo-cus-1', ...request }, 'k-res'));
    expect(created.quote).toEqual(quote);
  });
  it('quotes a tour with no rule without any discount line', async () => {
    const quote = await firstValueFrom(TestBed.inject(ReservationQuoteSource).quote({ departureId: 'demo-dep-1', serviceIds: ['demo-svc-4'], people: 1 }));
    expect(quote.discounts.map((d) => d.name)).not.toContain('12,34% de descuento');
  });

  it('aRulePublishedLaterDoesNotChangeAnExistingReservation', async () => {
    const created = await firstValueFrom(TestBed.inject(ReservationsWriter).create({ leadCustomerId: 'demo-cus-1', ...request }, 'k-before'));
    const before = structuredClone(created.quote);
    await firstValueFrom(TestBed.inject(DiscountRulesWriter).create({ ...command, priority: 10, percentageBasisPoints: 4321 }, 'k-later'));
    const stored = (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === created.id)!;
    expect(stored.quote).toEqual(before); expect(stored.balanceCents).toBe(before.finalCents);
    expect(names(await firstValueFrom(TestBed.inject(ReservationQuoteSource).quote(request)))).toContain('43,21% de descuento');
  });
});

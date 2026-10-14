import { describe, expect, it } from 'vitest';
import { applyDiscounts } from '../src/app/demo/discount-calculation';
import { DiscountRule } from '../src/app/discounts/model/discount-rule';
import { ruleNamed } from './current-discounts.double';

// HU-COM-004 spec section 3, AC-CD.1 to AC-CD.4 (tasks T-02). Money in cents, percentages in basis points.
const DATE = '2026-06-15';
const ONE_HUNDRED_THOUSAND = 10_000_000;

describe('aRuleInForceReducesTheValueAndKeepsTheBaseVisible', () => {
  it('reflects a 12.5 % rule in the final value and keeps the base value', () => {
    const result = applyDiscounts(ONE_HUNDRED_THOUSAND, [ruleNamed('Season', 1, { percentageBasisPoints: 1250 })], DATE);
    expect(result.baseCents).toBe(ONE_HUNDRED_THOUSAND);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ order: 1, name: 'Season', baseCents: ONE_HUNDRED_THOUSAND, amountCents: 1_250_000, subtotalCents: 8_750_000 });
    expect(result.finalCents).toBe(8_750_000);
  });

  it('reads the DiscountRule of HU-COM-003 as a percentage of its tour', () => {
    const rule: DiscountRule = { id: 'r-1', tourId: 't-1', tourName: 'Model', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: 1,
      calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE', percentageBasisPoints: 500, stackable: false };
    const applicable = { ...rule, name: rule.tourName, type: 'PERCENTAGE' as const };
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, [applicable], DATE).finalCents).toBe(9_500_000);
  });
});

describe('expiredUpcomingAndInactiveRulesLeaveOnlyTheBaseValue', () => {
  it('leaves out expired, upcoming and inactive rules', () => {
    const rules = [
      ruleNamed('Expired', 1, { endsOn: '2026-06-14' }),
      ruleNamed('Upcoming', 2, { startsOn: '2026-06-16' }),
      ruleNamed('Inactive', 3, { status: 'INACTIVE' }),
    ];
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE)).toEqual({ baseCents: ONE_HUNDRED_THOUSAND, lines: [], finalCents: ONE_HUNDRED_THOUSAND });
  });

  it('gives only the base value when there is no rule at all', () => {
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, [], DATE)).toEqual({ baseCents: ONE_HUNDRED_THOUSAND, lines: [], finalCents: ONE_HUNDRED_THOUSAND });
  });

  it('counts the first and the last day of the validity as in force', () => {
    const rules = [ruleNamed('Starts today', 1, { startsOn: DATE }), ruleNamed('Ends today', 2, { endsOn: DATE })];
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE).lines.map((line) => line.name)).toEqual(['Starts today', 'Ends today']);
  });
});

describe('rulesApplyByPriorityEachOnItsDeclaredBase', () => {
  it('applies in priority order, each on the original value or on the previous subtotal', () => {
    const rules = [
      ruleNamed('On original', 3, { calculationBase: 'ORIGINAL_VALUE', percentageBasisPoints: 1000 }),
      ruleNamed('On subtotal', 2, { calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 1000 }),
      ruleNamed('Fixed first', 1, { type: 'FIXED_AMOUNT', amountCents: 2_000_000, percentageBasisPoints: undefined }),
    ];
    const result = applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE);
    expect(result.lines).toEqual([
      { order: 1, name: 'Fixed first', base: 'ORIGINAL_VALUE', baseCents: 10_000_000, amountCents: 2_000_000, subtotalCents: 8_000_000 },
      { order: 2, name: 'On subtotal', base: 'PREVIOUS_SUBTOTAL', baseCents: 8_000_000, amountCents: 800_000, subtotalCents: 7_200_000 },
      { order: 3, name: 'On original', base: 'ORIGINAL_VALUE', baseCents: 10_000_000, amountCents: 1_000_000, subtotalCents: 6_200_000 },
    ]);
    expect(result.finalCents).toBe(6_200_000);
  });

  it('breaks a priority tie by creation order, oldest first (DP-CD5), so the breakdown is deterministic', () => {
    const rules = [ruleNamed('Older', 1), ruleNamed('Newer', 1)];
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE).lines.map((line) => line.name)).toEqual(['Older', 'Newer']);
    expect(applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE)).toEqual(applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE));
  });
});

describe('aPercentageAndAFixedAmountGiveExactCentsAndNeverBelowZero', () => {
  it('calculates a percentage in whole cents, rounding half up per line (DP-CD2)', () => {
    expect(applyDiscounts(100, [ruleNamed('Seven', 1, { percentageBasisPoints: 700 })], DATE).lines[0].amountCents).toBe(7);
    expect(applyDiscounts(333, [ruleNamed('Half up', 1, { percentageBasisPoints: 1250 })], DATE).lines[0].amountCents).toBe(42);
    expect(applyDiscounts(332, [ruleNamed('Down', 1, { percentageBasisPoints: 1250 })], DATE).lines[0].amountCents).toBe(42);
    expect(applyDiscounts(331, [ruleNamed('Down', 1, { percentageBasisPoints: 1250 })], DATE).lines[0].amountCents).toBe(41);
  });

  it('never lets a fixed amount take the value below zero', () => {
    const rules = [ruleNamed('Big', 1, { type: 'FIXED_AMOUNT', amountCents: 9_000_000, percentageBasisPoints: undefined }),
      ruleNamed('Bigger', 2, { type: 'FIXED_AMOUNT', amountCents: 5_000_000, percentageBasisPoints: undefined })];
    const result = applyDiscounts(ONE_HUNDRED_THOUSAND, rules, DATE);
    expect(result.lines[1]).toMatchObject({ amountCents: 1_000_000, subtotalCents: 0 });
    expect(result.finalCents).toBe(0);
    for (const line of result.lines) expect(Number.isSafeInteger(line.amountCents) && line.subtotalCents >= 0).toBe(true);
  });
});

import { DiscountBreakdowns } from '../current-discounts/data/discount-breakdowns';
import { AdditionalDiscount, ApplicableRule, Breakdown, DiscountLine } from '../current-discounts/model/current-discounts';
import { CURRENT_DISCOUNTS_TEXT } from '../current-discounts/current-discounts-copy';
import { DiscountValue } from '../discounts/data/discount-rules-source';

/** D-04 (DP-CD2 open): integer half-up per line, never more than the subtotal it is applied to; a cap limits what one rule takes off. */
function amountOf(value: DiscountValue, baseCents: number, subtotalCents: number, capCents?: number): number {
  const amount = value.type === 'PERCENTAGE' ? Math.floor((baseCents * value.percentageBasisPoints + 5_000) / 10_000) : value.amountCents;
  return Math.min(amount, subtotalCents, capCents ?? Infinity);
}

/**
 * D-03: the rules in force on `date` by priority (a tie keeps creation order, DP-CD5), each on its declared base, with its cap,
 * and the additional discount last on the subtotal they left (RN-RES-002). DP-003-V19-2 (PROPUESTO, open): a rule that is not
 * stackable stops the chain, so no rule of lower priority applies after it; a rule without the flag stacks.
 */
export function applyDiscounts(baseCents: number, rules: readonly ApplicableRule[], date: string, additional?: AdditionalDiscount): Breakdown {
  const lines: DiscountLine[] = [];
  let subtotal = baseCents;
  const apply = (name: string, value: DiscountValue, base: DiscountLine['base'], extra: Partial<DiscountLine> = {}, capCents?: number) => {
    const lineBase = base === 'ORIGINAL_VALUE' ? baseCents : subtotal, amountCents = amountOf(value, lineBase, subtotal, capCents);
    subtotal -= amountCents;
    lines.push({ order: lines.length + 1, name, base, baseCents: lineBase, amountCents, subtotalCents: subtotal, ...extra });
  };
  for (const rule of rules.filter((r) => r.status === 'ACTIVE' && r.startsOn <= date && date <= r.endsOn).sort((a, b) => a.priority - b.priority)) {
    apply(rule.name, rule, rule.calculationBase, {}, rule.capCents);
    if (rule.stackable === false) break;
  }
  if (additional) {
    apply(CURRENT_DISCOUNTS_TEXT.additional, additional, 'PREVIOUS_SUBTOTAL', { reason: additional.reason, authorizedBy: additional.authorizedBy });
  }
  return { baseCents, lines, finalCents: subtotal };
}

/** DEMO build only: the port of the breakdown over the calculation above. */
export class DemoDiscountBreakdowns extends DiscountBreakdowns {
  override of(baseCents: number, rules: readonly ApplicableRule[], date: string, additional?: AdditionalDiscount): Breakdown {
    return applyDiscounts(baseCents, rules, date, additional);
  }
}

import { parseMoney } from '../../catalog/model/money';
import { DiscountRule, DiscountValue } from '../../discounts/model/discount-rule';
import { parsePercentage } from '../../discounts/model/percentage';

/** Only the fields of HU-COM-003's DiscountRule the calculation reads (tasks T-02); no second rule model. */
export type ApplicableRule = DiscountValue & Pick<DiscountRule, 'name' | 'startsOn' | 'endsOn' | 'priority' | 'calculationBase' | 'status'>;
/** PROPUESTO (G-API): the base value of a service and its rules on the date consulted. */
export type PricedService = { readonly serviceId: string; readonly serviceName: string; readonly baseCents: number; readonly rules: readonly ApplicableRule[] };
/** The authorizer is not typed by the person: the service answers it from the session (plan D-06). */
export type AdditionalDiscountCommand = DiscountValue & { readonly serviceId: string; readonly reason: string };
export type AdditionalDiscount = AdditionalDiscountCommand & { readonly authorizedBy: string };
export type DiscountLine = {
  readonly order: number; readonly name: string; readonly base: DiscountRule['calculationBase']; readonly baseCents: number;
  readonly amountCents: number; readonly subtotalCents: number; readonly reason?: string; readonly authorizedBy?: string;
};
export type Breakdown = { readonly baseCents: number; readonly lines: readonly DiscountLine[]; readonly finalCents: number };

export const CURRENT_DISCOUNTS_TEXT = {
  title: 'Current discounts', entry: 'Current discounts', date: 'Date consulted', loading: 'Loading', empty: 'No services to price',
  failed: 'The request failed.', retry: 'Retry', base: 'Base value', final: 'Final value', subtotal: 'Subtotal', additional: 'Additional discount',
  reason: 'Reason', authorizedBy: 'Authorized by', apply: 'Apply additional discount',
  bases: { ORIGINAL_VALUE: 'on the original value', PREVIOUS_SUBTOTAL: 'on the previous subtotal' },
};

/** RBAC matrix, "Authorize an additional discount": only the Tenant Administrator. */
export function canAuthorizeAdditionalDiscount(actor: { role: string }): boolean { return actor.role === 'TENANT_ADMINISTRATOR'; }

/** D-04 (DP-CD2 open): integer half-up per line, never more than the subtotal it is applied to. */
function amountOf(value: DiscountValue, baseCents: number, subtotalCents: number): number {
  const amount = value.type === 'PERCENTAGE' ? Math.floor((baseCents * value.percentageBasisPoints + 5_000) / 10_000) : value.amountCents;
  return Math.min(amount, subtotalCents);
}

/**
 * D-03: the rules in force on `date` by priority (a tie keeps creation order, DP-CD5), each on its
 * declared base, and the additional discount last on the subtotal they left (RN-RES-002).
 */
export function applyDiscounts(baseCents: number, rules: readonly ApplicableRule[], date: string, additional?: AdditionalDiscount): Breakdown {
  const lines: DiscountLine[] = [];
  let subtotal = baseCents;
  const apply = (name: string, value: DiscountValue, base: DiscountLine['base'], extra: Partial<DiscountLine> = {}) => {
    const lineBase = base === 'ORIGINAL_VALUE' ? baseCents : subtotal, amountCents = amountOf(value, lineBase, subtotal);
    subtotal -= amountCents;
    lines.push({ order: lines.length + 1, name, base, baseCents: lineBase, amountCents, subtotalCents: subtotal, ...extra });
  };
  rules.filter((rule) => rule.status === 'ACTIVE' && rule.startsOn <= date && date <= rule.endsOn)
    .sort((a, b) => a.priority - b.priority).forEach((rule) => apply(rule.name, rule, rule.calculationBase));
  if (additional) {
    apply(CURRENT_DISCOUNTS_TEXT.additional, additional, 'PREVIOUS_SUBTOTAL', { reason: additional.reason, authorizedBy: additional.authorizedBy });
  }
  return { baseCents, lines, finalCents: subtotal };
}

export type AdditionalDraft = { value: string; reason: string; type: DiscountValue['type'] };
export type AdditionalMessages = Partial<Record<keyof AdditionalDraft, string>>;
export const EMPTY_ADDITIONAL: AdditionalDraft = { value: '', reason: '', type: 'PERCENTAGE' };

/** DP-CD3 and DP-CD4 open: free-text reason; a percentage or an amount, like a rule. */
export function validateAdditional(draft: AdditionalDraft): AdditionalMessages {
  const errors: AdditionalMessages = {};
  const value = draft.type === 'PERCENTAGE' ? parsePercentage(draft.value) : parseMoney(draft.value);
  if (value.kind === 'invalid' || value.minorUnits < 1) errors.value = 'A positive value with at most two decimals is required; percentages cannot exceed 100.';
  if (!draft.reason.trim()) errors.reason = 'Reason required.';
  return errors;
}

export function additionalCommand(serviceId: string, draft: AdditionalDraft): AdditionalDiscountCommand {
  const value = draft.type === 'PERCENTAGE' ? parsePercentage(draft.value) : parseMoney(draft.value);
  if (value.kind !== 'valid' || Object.keys(validateAdditional(draft)).length) throw new RangeError('Invalid additional discount');
  const reason = draft.reason.trim();
  return draft.type === 'PERCENTAGE' ? { serviceId, type: 'PERCENTAGE', percentageBasisPoints: value.minorUnits, reason }
    : { serviceId, type: 'FIXED_AMOUNT', amountCents: value.minorUnits, reason };
}

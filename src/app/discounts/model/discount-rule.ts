import { formatMoney, parseMoney } from '../../catalog/model/money';
import { parsePercentage } from './percentage';
/** PROPUESTO (DP-03): field names await the published API contract. */
export type DiscountValue = { type: 'PERCENTAGE'; percentageBasisPoints: number; amountCents?: never }
  | { type: 'FIXED_AMOUNT'; amountCents: number; percentageBasisPoints?: never };
export type DiscountRule = DiscountValue & {
  readonly id: string; readonly name: string; readonly startsOn: string; readonly endsOn: string;
  readonly priority: number; readonly calculationBase: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly status: 'ACTIVE' | 'INACTIVE';
};
export type DiscountRuleCommand = Omit<DiscountRule, 'id' | 'status' | keyof DiscountValue> & DiscountValue;
export const DISCOUNT_TEXT = {
  title: 'Discount rules', loading: 'Loading', empty: 'No results', failed: 'The request failed.', retry: 'Retry',
  denied: 'You do not have access to discount rules.', entry: 'Discount rules', create: 'New discount rule', edit: 'Edit',
  inactivate: 'Inactivate', confirm: 'Confirm inactivation', cancel: 'Cancel', save: 'Save',
  confirmation: 'Existing reservations keep their discount. Inactivate this rule?',
};
export function canManageDiscounts(actor: { role: string }): boolean { return actor.role === 'TENANT_ADMINISTRATOR'; }
export function discountValueText(rule: DiscountValue): string {
  return rule.type === 'PERCENTAGE' ? `${formatMoney(rule.percentageBasisPoints)} %` : formatMoney(rule.amountCents);
}
/** DP-PD2 remains open: textual states only, without inventing design tokens. */
export function discountValidity(rule: DiscountRule, today: string): string {
  return rule.status === 'INACTIVE' ? 'INACTIVE' : today < rule.startsOn ? 'UPCOMING' : today > rule.endsOn ? 'EXPIRED' : 'IN_FORCE';
}
export const DISCOUNT_FIELDS = [
  { name: 'name', label: 'Name', kind: 'text' }, { name: 'startsOn', label: 'Starts on', kind: 'date' },
  { name: 'endsOn', label: 'Ends on', kind: 'date' }, { name: 'priority', label: 'Priority', kind: 'text' },
  { name: 'value', label: 'Value', kind: 'text' },
] as const;
export const DISCOUNT_SELECTS = [
  { name: 'calculationBase', label: 'Calculation base', options: [
    { value: 'ORIGINAL_VALUE', label: 'Original value', explanation: 'Calculated on the original reservation value.' },
    { value: 'PREVIOUS_SUBTOTAL', label: 'Subtotal after the previous discount', explanation: 'Calculated on the subtotal left by the preceding discount.' },
  ] },
  { name: 'type', label: 'Value type', options: [
    { value: 'PERCENTAGE', label: 'Percentage', explanation: '' }, { value: 'FIXED_AMOUNT', label: 'Fixed amount', explanation: '' },
  ] },
] as const;
export type DiscountDraft = Record<(typeof DISCOUNT_FIELDS)[number]['name'] | (typeof DISCOUNT_SELECTS)[number]['name'], string>;
export type DiscountField = keyof DiscountDraft;
export type DiscountMessages = Partial<Record<DiscountField, string>>;
export function discountDraft(rule: DiscountRule | null): DiscountDraft {
  return { name: rule?.name ?? '', startsOn: rule?.startsOn ?? '', endsOn: rule?.endsOn ?? '', priority: rule ? String(rule.priority) : '',
    value: rule ? formatMoney(rule.type === 'PERCENTAGE' ? rule.percentageBasisPoints : rule.amountCents) : '',
    calculationBase: rule?.calculationBase ?? 'ORIGINAL_VALUE', type: rule?.type ?? 'PERCENTAGE' };
}
export function validateDiscount(d: DiscountDraft): DiscountMessages {
  const errors: DiscountMessages = {};
  if (!d.name.trim()) errors.name = 'Name required.';
  for (const field of ['startsOn', 'endsOn'] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d[field]) || !Number.isFinite(Date.parse(d[field]))
      || new Date(d[field]).toISOString().slice(0, 10) !== d[field]) errors[field] = 'A complete date is required.';
  }
  if (!errors.startsOn && !errors.endsOn && d.startsOn > d.endsOn) errors.startsOn = errors.endsOn = 'Validity start must not follow its end.';
  if (!/^\d+$/.test(d.priority) || !Number.isSafeInteger(Number(d.priority)) || Number(d.priority) < 1) errors.priority = 'Positive integer priority required.';
  if (!DISCOUNT_SELECTS[0].options.some(o => o.value === d.calculationBase)) errors.calculationBase = 'Calculation base required.';
  if (!DISCOUNT_SELECTS[1].options.some(o => o.value === d.type)) errors.type = 'Value type required.';
  const value = d.type === 'PERCENTAGE' ? parsePercentage(d.value) : parseMoney(d.value);
  if (value.kind === 'invalid' || value.minorUnits < 1) errors.value = 'A positive value with at most two decimals is required; percentages cannot exceed 100.';
  return errors;
}
export function discountCommand(d: DiscountDraft): DiscountRuleCommand {
  const value = (d.type === 'PERCENTAGE' ? parsePercentage(d.value) : parseMoney(d.value));
  if (value.kind !== 'valid' || Object.keys(validateDiscount(d)).length) throw new RangeError('Invalid discount rule');
  return { name: d.name.trim(), startsOn: d.startsOn, endsOn: d.endsOn, priority: Number(d.priority),
    calculationBase: d.calculationBase as DiscountRule['calculationBase'], ...(d.type === 'PERCENTAGE'
      ? { type: 'PERCENTAGE', percentageBasisPoints: value.minorUnits } : { type: 'FIXED_AMOUNT', amountCents: value.minorUnits }) };
}

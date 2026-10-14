import { DiscountRule, DiscountValue } from '../../discounts/data/discount-rules-source';
import { parsePercentage } from '../../shared/percentage';
import { CURRENT_DISCOUNTS_MESSAGES } from '../current-discounts-copy';

/** Only the fields of HU-COM-003's DiscountRule the calculation reads (tasks T-02); no second rule model. */
export type ApplicableRule = DiscountValue & { readonly name: string } & Pick<DiscountRule, 'startsOn' | 'endsOn' | 'priority' | 'calculationBase' | 'status'>
  & Partial<Pick<DiscountRule, 'capCents' | 'stackable'>>;
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

export type AdditionalDraft = { value: string; reason: string };
export type AdditionalMessages = Partial<Record<keyof AdditionalDraft, string>>;
export const EMPTY_ADDITIONAL: AdditionalDraft = { value: '', reason: '' };

/** DP-CD3 open: free-text reason. DP-CD4 closed by the mockup: a percentage from 1 to 100, no fixed amount. */
export function validateAdditional(draft: AdditionalDraft): AdditionalMessages {
  const errors: AdditionalMessages = {};
  const value = parsePercentage(draft.value);
  if (value.kind === 'invalid' || value.minorUnits < 100) errors.value = CURRENT_DISCOUNTS_MESSAGES.value;
  if (!draft.reason.trim()) errors.reason = CURRENT_DISCOUNTS_MESSAGES.reason;
  return errors;
}

export function additionalCommand(serviceId: string, draft: AdditionalDraft): AdditionalDiscountCommand {
  const value = parsePercentage(draft.value);
  if (value.kind !== 'valid' || Object.keys(validateAdditional(draft)).length) throw new RangeError('Invalid additional discount');
  const reason = draft.reason.trim();
  return { serviceId, type: 'PERCENTAGE', percentageBasisPoints: value.minorUnits, reason };
}

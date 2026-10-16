import { DiscountRule, DiscountValue } from '../../discounts/data/discount-rules-source';
import { parsePercentage } from '../../shared/percentage';
import { pesosText } from '../../shared/money';
import { ADDITIONAL_DISCOUNT_COPY } from '../current-discounts-copy';
import { AdditionalDiscountCommand } from '../data/additional-discount-writer';

/** Only the fields of HU-COM-003's DiscountRule the calculation reads (tasks T-02); no second rule model. */
export type ApplicableRule = DiscountValue & { readonly name: string } & Pick<DiscountRule, 'startsOn' | 'endsOn' | 'priority' | 'calculationBase' | 'status'>
  & Partial<Pick<DiscountRule, 'capCents' | 'stackable'>>;
/** PROPUESTO (G-API): the base value of a service and its rules on the date consulted. */
export type PricedService = { readonly serviceId: string; readonly serviceName: string; readonly baseCents: number; readonly rules: readonly ApplicableRule[] };
/** The authorizer is not typed by the person: the service answers it from the session (plan D-06). */
export type AdditionalDiscount = DiscountValue & { readonly serviceId: string; readonly reason: string; readonly authorizedBy: string };
export type DiscountLine = {
  readonly order: number; readonly name: string; readonly base: DiscountRule['calculationBase']; readonly baseCents: number;
  readonly amountCents: number; readonly subtotalCents: number; readonly reason?: string; readonly authorizedBy?: string;
};
export type Breakdown = { readonly baseCents: number; readonly lines: readonly DiscountLine[]; readonly finalCents: number };

/** Texts of the values block of admin-crear-reserva.html (12-ux-ui/authorized-screens.md). */
export const CURRENT_DISCOUNTS_TEXT = {
  base: 'Valor proyectado', discounts: 'Descuentos aplicables', final: 'Valor final', subtotal: 'Subtotal', additional: 'Descuento adicional',
  reason: 'Motivo', authorizedBy: 'Autorizado por',
  bases: { ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior' },
} as const;

export type AdditionalDraft = { value: string; reason: string };
export type AdditionalMessages = Partial<Record<keyof AdditionalDraft, string>>;
export const EMPTY_ADDITIONAL: AdditionalDraft = { value: '', reason: '' };
const MINIMUM_BASIS_POINTS = 100; // 1 %, the smallest percentage of the mockup

/** DP-CD3 open: free-text reason. DP-CD4 closed by the mockup: a percentage from 1 % up to the cap of the tenant, no fixed amount. */
export function validateAdditional(draft: AdditionalDraft, capBasisPoints: number): AdditionalMessages {
  const errors: AdditionalMessages = {};
  const value = parsePercentage(draft.value);
  if (value.kind === 'invalid' || value.minorUnits < MINIMUM_BASIS_POINTS) errors.value = ADDITIONAL_DISCOUNT_COPY.invalidValue;
  else if (value.minorUnits > capBasisPoints) errors.value = ADDITIONAL_DISCOUNT_COPY.aboveCap(pesosText(capBasisPoints));
  if (!draft.reason.trim()) errors.reason = ADDITIONAL_DISCOUNT_COPY.reasonRequired;
  return errors;
}

/** The basis points to preview: those of a valid percentage within the cap, otherwise 0 (nothing to ask the port). */
export function previewBasisPoints(draft: AdditionalDraft, capBasisPoints: number): number {
  const value = parsePercentage(draft.value);
  return value.kind === 'valid' && !validateAdditional({ ...draft, reason: 'x' }, capBasisPoints).value ? value.minorUnits : 0;
}

export function additionalCommand(reservationId: string, draft: AdditionalDraft, capBasisPoints: number): AdditionalDiscountCommand {
  const value = parsePercentage(draft.value);
  if (value.kind !== 'valid' || Object.keys(validateAdditional(draft, capBasisPoints)).length) throw new RangeError('Invalid additional discount');
  return { reservationId, percentageBasisPoints: value.minorUnits, reason: draft.reason.trim() };
}

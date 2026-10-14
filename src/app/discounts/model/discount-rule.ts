import { formatMoney, parseMoney } from '../../catalog/model/money';
import { formatCop } from '../../shared/format';
import { parsePercentage } from './percentage';
/** PROPUESTO (DP-03): field names await the published API contract. */
export type DiscountValue = { type: 'PERCENTAGE'; percentageBasisPoints: number; amountCents?: never }
  | { type: 'FIXED_AMOUNT'; amountCents: number; percentageBasisPoints?: never };
/** PROPUESTO (G-B): `tourId`, `tourName`, `capCents` and `stackable` await the published API contract (amendment A.5, pillar 11). */
/** DP-PD2 (PROPUESTO): the badge pill of screen 11 ("Vigente", "Próximo", "Vencido", "Inactivo"), resolved by the source, never by the screen. */
export type DiscountValidity = { readonly label: string; readonly tone: string; readonly inForce: boolean };
export type DiscountRule = {
  readonly id: string; readonly tourId: string; readonly tourName: string; readonly percentageBasisPoints: number; readonly capCents?: number;
  readonly stackable: boolean; readonly startsOn: string; readonly endsOn: string; readonly priority: number;
  readonly calculationBase: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly status: 'ACTIVE' | 'INACTIVE'; readonly validity: DiscountValidity;
};
export type DiscountRuleCommand = Omit<DiscountRule, 'id' | 'status' | 'tourName' | 'validity'>;
/** `20% de descuento`, `12,5% de descuento`. */
export function discountValueText(rule: Pick<DiscountRule, 'percentageBasisPoints'>): string {
  const points = rule.percentageBasisPoints, decimals = String(points % 100).padStart(2, '0').replace(/0$/, '');
  return `${Math.trunc(points / 100)}${points % 100 ? ',' + decimals : ''}% de descuento`;
}
/** `Vigente hasta el 30 sep 2026. Base de cálculo: valor original. Prioridad 1, no acumulable. Tope: $80.000.` */
export function discountDetail(rule: DiscountRule): string {
  const t = DISCOUNT_TEXT;
  return `${t.until} ${formatDate(rule.endsOn)}. ${t.base} ${t.baseInline[rule.calculationBase]}. ${t.priority} ${rule.priority}, ${rule.stackable ? t.stackable : t.notStackable}.`
    + (rule.capCents ? ` ${t.cap} ${formatCop(rule.capCents)}.` : '');
}
export type DiscountField = 'tourId' | 'percentage' | 'calculationBase' | 'cap' | 'startsOn' | 'endsOn' | 'priority' | 'stackable';
export type DiscountDraft = Record<DiscountField, string>;
export type DiscountMessages = Partial<Record<DiscountField, string>>;
export function discountDraft(rule: DiscountRule | null): DiscountDraft {
  return { tourId: rule?.tourId ?? '', percentage: rule ? formatMoney(rule.percentageBasisPoints) : '', calculationBase: rule?.calculationBase ?? 'ORIGINAL_VALUE',
    cap: rule?.capCents ? formatCop(rule.capCents) : '', startsOn: rule?.startsOn ?? '', endsOn: rule?.endsOn ?? '',
    priority: rule ? String(rule.priority) : '', stackable: rule?.stackable ? 'si' : 'no' };
}
const isOption = (field: DiscountField, value: string) => DISCOUNT_CONTROLS.find(c => c.name === field)!.options!.some(o => o.value === value);
function percentageOf(text: string): number | null { const v = parsePercentage(text); return v.kind === 'valid' && v.minorUnits >= 100 ? v.minorUnits : null; }
function capOf(text: string): number | null { const v = parseCop(text); return v.kind === 'valid' && v.minorUnits > 0 ? v.minorUnits : null; }
export function validateDiscount(d: DiscountDraft): DiscountMessages {
  const errors: DiscountMessages = {};
  if (!d.name.trim()) errors.name = 'El nombre es obligatorio.';
  for (const field of ['startsOn', 'endsOn'] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d[field]) || !Number.isFinite(Date.parse(d[field]))
      || new Date(d[field]).toISOString().slice(0, 10) !== d[field]) errors[field] = 'Ingresa una fecha completa.';
  }
  if (!errors.startsOn && !errors.endsOn && d.startsOn > d.endsOn) errors.startsOn = errors.endsOn = 'El inicio de la vigencia no puede ser posterior a su fin.';
  if (!/^\d+$/.test(d.priority) || !Number.isSafeInteger(Number(d.priority)) || Number(d.priority) < 1) errors.priority = 'La prioridad debe ser un entero positivo.';
  if (!DISCOUNT_SELECTS[0].options.some(o => o.value === d.calculationBase)) errors.calculationBase = 'Elige la base de cálculo.';
  if (!DISCOUNT_SELECTS[1].options.some(o => o.value === d.type)) errors.type = 'Elige el tipo de valor.';
  const value = d.type === 'PERCENTAGE' ? parsePercentage(d.value) : parseMoney(d.value);
  if (value.kind === 'invalid' || value.minorUnits < 1) errors.value = 'Ingresa un valor positivo con máximo dos decimales; un porcentaje no supera 100.';
  return errors;
}
export function discountCommand(d: DiscountDraft): DiscountRuleCommand {
  const basisPoints = percentageOf(d.percentage);
  if (basisPoints === null || Object.keys(validateDiscount(d)).length) throw new RangeError('Invalid discount rule');
  return { tourId: d.tourId, percentageBasisPoints: basisPoints, calculationBase: d.calculationBase as DiscountRule['calculationBase'],
    ...(d.cap.trim() ? { capCents: capOf(d.cap)! } : {}), startsOn: d.startsOn, endsOn: d.endsOn, priority: Number(d.priority), stackable: d.stackable === 'si' };
}

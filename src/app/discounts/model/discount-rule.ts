import { formatCop } from '../../shared/format';
import { formatMoney, parseMoney } from '../../shared/money';
import { parsePercentage } from '../../shared/percentage';
/** PROPUESTO (DP-03): field names await the published API contract. */
export type DiscountValue = { type: 'PERCENTAGE'; percentageBasisPoints: number; amountCents?: never }
  | { type: 'FIXED_AMOUNT'; amountCents: number; percentageBasisPoints?: never };
export type DiscountRule = DiscountValue & {
  readonly id: string; readonly name: string; readonly startsOn: string; readonly endsOn: string;
  readonly priority: number; readonly calculationBase: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly status: 'ACTIVE' | 'INACTIVE';
};
export type DiscountRuleCommand = Omit<DiscountRule, 'id' | 'status' | keyof DiscountValue> & DiscountValue;
/** Texts of the authorized screen 12 (admin-descuentos, admin-nuevo-descuento, admin-editar-descuento). */
export const DISCOUNT_TEXT = {
  eyebrow: 'Reglas comerciales', title: 'Descuentos', newTitle: 'Nuevo descuento', editTitle: 'Editar descuento', back: 'Volver a descuentos',
  heroEyebrow: 'Configuración', heroTitle: 'Descuentos visibles y trazables.',
  heroCopy: 'Define vigencia, prioridad, base de cálculo y valor antes de habilitarlos.',
  panelEyebrow: 'Por prioridad', panelTitle: 'Promociones configuradas',
  loading: 'Cargando descuentos…', saving: 'Guardando…', empty: 'Aún no hay descuentos configurados.',
  failed: 'No se pudieron cargar los descuentos.', retry: 'Reintentar', denied: 'No tienes acceso a los descuentos.',
  create: 'Crear descuento', edit: 'Editar parámetros', inactivate: 'Inactivar', confirm: 'Confirmar inactivación', cancel: 'Cancelar',
  save: 'Guardar cambios', newLead: 'Configura la promoción', editLead: 'Actualiza la promoción', orderLead: 'Vigencia y orden',
  newFeedback: 'Completa los parámetros para publicar el descuento.',
  editFeedback: 'Actualiza los parámetros y guarda para aplicar los cambios a este mismo descuento.',
  confirmation: 'Las reservas existentes conservan el descuento que ya tienen. ¿Inactivar este descuento?',
};
/** `20% de descuento`, `12,5% de descuento`, `$50.000 de descuento`. */
export function discountValueText(rule: DiscountValue): string {
  if (rule.type !== 'PERCENTAGE') return `${formatCop(rule.amountCents)} de descuento`;
  const points = rule.percentageBasisPoints, decimals = String(points % 100).padStart(2, '0').replace(/0$/, '');
  return `${Math.trunc(points / 100)}${points % 100 ? ',' + decimals : ''}% de descuento`;
}
/** DP-PD2 (PROPUESTO): the badge pills of screen 11, in Spanish. */
export function discountValidity(rule: DiscountRule, today: string): { label: string; tone: string } {
  return rule.status === 'INACTIVE' ? { label: 'Inactivo', tone: 'pending' } : today < rule.startsOn ? { label: 'Próximo', tone: 'execution' }
    : today > rule.endsOn ? { label: 'Vencido', tone: 'finalized' } : { label: 'Vigente', tone: 'confirmed' };
}
export const DISCOUNT_FIELDS = [
  { name: 'name', label: 'Nombre del descuento', kind: 'text' }, { name: 'startsOn', label: 'Vigencia desde', kind: 'date' },
  { name: 'endsOn', label: 'Vigencia hasta', kind: 'date' }, { name: 'priority', label: 'Prioridad', kind: 'text' },
  { name: 'value', label: 'Porcentaje de descuento', kind: 'text' },
] as const;
export const DISCOUNT_SELECTS = [
  { name: 'calculationBase', label: 'Base de cálculo', options: [
    { value: 'ORIGINAL_VALUE', label: 'Valor original', explanation: 'se calcula sobre el valor original de la reserva.' },
    { value: 'PREVIOUS_SUBTOTAL', label: 'Subtotal resultante del descuento anterior', explanation: 'se calcula sobre el subtotal que deja el descuento previo.' },
  ] },
  { name: 'type', label: 'Tipo de valor', options: [
    { value: 'PERCENTAGE', label: 'Porcentaje', explanation: '' }, { value: 'FIXED_AMOUNT', label: 'Monto fijo', explanation: '' },
  ] },
] as const;
/** The two numbered panels of the form, in the order of the screen. */
export const DISCOUNT_SECTIONS = [
  { eyebrow: '01. Descuento', fields: ['name', 'type', 'value', 'calculationBase'] },
  { eyebrow: '02. Vigencia y prioridad', fields: ['startsOn', 'endsOn', 'priority'] },
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
  const value = (d.type === 'PERCENTAGE' ? parsePercentage(d.value) : parseMoney(d.value));
  if (value.kind !== 'valid' || Object.keys(validateDiscount(d)).length) throw new RangeError('Invalid discount rule');
  return { name: d.name.trim(), startsOn: d.startsOn, endsOn: d.endsOn, priority: Number(d.priority),
    calculationBase: d.calculationBase as DiscountRule['calculationBase'], ...(d.type === 'PERCENTAGE'
      ? { type: 'PERCENTAGE', percentageBasisPoints: value.minorUnits } : { type: 'FIXED_AMOUNT', amountCents: value.minorUnits }) };
}

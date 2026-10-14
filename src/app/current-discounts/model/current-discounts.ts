import { parseMoney } from '../../catalog/model/money';
import { DiscountRule, DiscountValue } from '../../discounts/model/discount-rule';
import { parsePercentage } from '../../discounts/model/percentage';

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

/** Texts of admin-aplicar-descuento.html and of the values block of admin-crear-reserva.html (12-ux-ui/authorized-screens.md). */
export const CURRENT_DISCOUNTS_TEXT = {
  eyebrow: 'Descuento adicional', title: 'Aplicar descuento', valuesStep: '01. Descuentos vigentes', valuesTitle: 'Valores por servicio',
  authorizationStep: '02. Descuento adicional', authorizationTitle: 'Autorización', date: 'Fecha de consulta', validOn: 'Vigentes al',
  loading: 'Cargando descuentos vigentes…', empty: 'No hay servicios para calcular en esta fecha.', failed: 'No fue posible cargar los valores.',
  applyFailed: 'No fue posible aplicar el descuento.', retry: 'Reintentar', base: 'Valor proyectado', discounts: 'Descuentos aplicables',
  final: 'Valor final', subtotal: 'Subtotal', additional: 'Descuento adicional', reason: 'Motivo', authorizedBy: 'Autorizado por',
  apply: 'Aplicar descuento', service: 'Servicio', value: 'Valor del descuento', type: 'Tipo de valor', reasonField: 'Motivo (obligatorio)',
  reasonHint: 'Describe el motivo del descuento adicional',
  note: 'Solo el Administrador puede autorizar descuentos adicionales; el motivo y quien autoriza quedan registrados.',
  types: [{ value: 'PERCENTAGE', label: 'Porcentaje' }, { value: 'FIXED_AMOUNT', label: 'Valor fijo' }],
  bases: { ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior' },
} as const;

export type AdditionalDraft = { value: string; reason: string };
export type AdditionalMessages = Partial<Record<keyof AdditionalDraft, string>>;
export const EMPTY_ADDITIONAL: AdditionalDraft = { value: '', reason: '', type: 'PERCENTAGE' };

/** DP-CD3 and DP-CD4 open: free-text reason; a percentage or an amount, like a rule. */
export function validateAdditional(draft: AdditionalDraft): AdditionalMessages {
  const errors: AdditionalMessages = {};
  const value = draft.type === 'PERCENTAGE' ? parsePercentage(draft.value) : parseMoney(draft.value);
  if (value.kind === 'invalid' || value.minorUnits < 1) errors.value = 'Ingresa un valor positivo con máximo dos decimales; el porcentaje no puede superar 100.';
  if (!draft.reason.trim()) errors.reason = 'El motivo es obligatorio.';
  return errors;
}

export function additionalCommand(serviceId: string, draft: AdditionalDraft): AdditionalDiscountCommand {
  const value = draft.type === 'PERCENTAGE' ? parsePercentage(draft.value) : parseMoney(draft.value);
  if (value.kind !== 'valid' || Object.keys(validateAdditional(draft)).length) throw new RangeError('Invalid additional discount');
  const reason = draft.reason.trim();
  return draft.type === 'PERCENTAGE' ? { serviceId, type: 'PERCENTAGE', percentageBasisPoints: value.minorUnits, reason }
    : { serviceId, type: 'FIXED_AMOUNT', amountCents: value.minorUnits, reason };
}

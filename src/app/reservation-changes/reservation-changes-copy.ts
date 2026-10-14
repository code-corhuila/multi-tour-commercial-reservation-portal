import type { CancellationOrigin, Eligibility, RefundableAmount } from './data/cancellation-ports';
import { formatCop } from '../shared/format';

/** Spanish copy of admin-cancelar-modificar-reserva.html and of the 10A blocks (mockup and app.js), HU-COM-013. */
export const RESERVATION_CHANGES_COPY = {
  eyebrow: 'RF-003A · RF-021 · Gestión de reserva', title: 'Cancelar o modificar reserva', back: 'Volver a la reserva', open: 'Cancelar o modificar reserva',
  accessNote: 'Cada reserva contiene un único tour asociado a una única salida. El cliente no cancela ni modifica por autogestión: la novedad la registra el Colaborador operativo o el Administrador del tenant, con causal y trazabilidad. Cancelada es un estado terminal.',
  contextEyebrow: '01. Reserva', contextTitle: 'Contexto', reservation: 'Reserva', customer: 'Cliente', status: 'Estado', paid: 'Valores pagados y validados', departure: 'Salida actual',
  noveltyEyebrow: '02. Novedad', noveltyTitle: 'Tipo, origen y causal', type: 'Tipo de novedad', origin: 'Origen de la cancelación',
  causeShort: 'Causal', cause: 'Causal (obligatoria)', causeHint: 'Describe la causal de la cancelación o modificación', treatment: 'Tratamiento económico', cancellationType: 'Cancelación',
  potential: 'Valor potencial a devolver', pendingPolicy: 'Pendiente de parametrización comercial',
  noPayments: 'No aplica: no hay valores pagados y validados en esta reserva; la cancelación es definitiva y no deja valores por tratar.',
  cancel: 'Volver', submit: 'Registrar novedad', causeRequired: 'Completa el tipo y la causal de la cancelación o modificación.',
  invitation: 'Completa el tipo y la causal para registrar la novedad.',
  registeredPendingRefund: 'Cancelación registrada. El valor a devolver queda pendiente de cálculo según la condición comercial parametrizada; podrás gestionarlo desde el detalle de la reserva.',
  registeredNoPayments: 'Cancelación registrada: no hay valores pagados y validados que devolver, por lo que no se genera solicitud de devolución y la cancelación queda como cierre definitivo. El cupo se liberó.',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la reserva seleccionada.',
  historyEyebrow: 'Historial', historyTitle: 'Cancelación registrada', registeredAt: 'Fecha de registro',
  decisionEyebrow: 'Cancelación o modificación registrada', decisionTitle: 'Devolución pendiente de gestionar',
} as const;

/** The origins of the mockup select (data-cancel-modify-origin); the customer first. */
export const CANCELLATION_ORIGINS: readonly { readonly key: CancellationOrigin; readonly option: string; readonly label: string }[] = [
  { key: 'customer', option: 'Solicitada por el cliente (aplica la penalidad vigente)', label: 'Cancelación solicitada por el cliente' },
  { key: 'not-attributable', option: 'Causa no atribuible al cliente (devolución del 100 %)', label: 'Causa no atribuible al cliente' },
  { key: 'non-payment', option: 'Incumplimiento del pago (valores abonados en tratamiento pendiente)', label: 'Cancelación por incumplimiento del pago' },
];

/** RN-RES-008, RN-EJE-002: 100 % of the validated values unless the customer asks (penalty of the port, DP-CN1); null when nothing was validated. */
export function determinedValue(origin: CancellationOrigin, validatedCents: number, refundable: RefundableAmount): number | 'pending' | null {
  if (validatedCents <= 0 || refundable.kind === 'no-payments') return null;
  if (origin !== 'customer') return validatedCents;
  return refundable.kind === 'amount' ? refundable.cents : 'pending';
}

/** app.js ruleLabel (data-cancel-modify-potential): the rule applied to the origin and the validated values. */
export function treatmentOf(origin: CancellationOrigin, validatedCents: number, refundable: RefundableAmount): string {
  const value = determinedValue(origin, validatedCents, refundable), label = CANCELLATION_ORIGINS.find((o) => o.key === origin)!.label;
  if (value === null) return RESERVATION_CHANGES_COPY.noPayments;
  if (value === 'pending') return `${label}: ${RESERVATION_CHANGES_COPY.pendingPolicy}.`;
  if (origin === 'customer' && refundable.kind === 'amount' && refundable.penaltyCents > 0) {
    return `${label}: ${formatCop(validatedCents)} pagados y validados menos penalidad de ${formatCop(refundable.penaltyCents)} = ${formatCop(value)} reembolsables.`;
  }
  return `${label}: devolución del 100 % de ${formatCop(validatedCents)} pagados y validados.`;
}

/** app.js: the text the screen keeps under the actions after "Registrar novedad". */
export function registeredMessage(origin: CancellationOrigin, validatedCents: number, refundable: RefundableAmount): string {
  const value = determinedValue(origin, validatedCents, refundable), t = RESERVATION_CHANGES_COPY;
  if (value === null) return t.registeredNoPayments;
  if (value === 'pending') return t.registeredPendingRefund;
  if (origin === 'not-attributable') {
    return `Cancelación registrada. Valor a devolver: ${formatCop(value)} (100 %, causa no atribuible al cliente), determinado y autorizado automáticamente; se ejecuta en máximo 5 días hábiles desde Solicitudes de devolución.`;
  }
  return `Cancelación registrada. Valor a devolver determinado: ${formatCop(value)}. El Administrador del tenant decide en 24 horas corridas (devolución del 100 % por defecto o saldo a favor); la devolución se ejecuta en máximo 5 días hábiles. Continúa desde el detalle de la reserva con Gestionar devolución.`;
}

/** Why the form is closed; null when it is open. The rescheduling text is PROPUESTO (spec section 5, AC5). */
export function refusalOf(eligibility: Eligibility, statusLabel: string): string | null {
  switch (eligibility) {
    case 'allowed': return null;
    case 'rescheduling-pending': return 'Esta reserva tiene una propuesta de reprogramación pendiente de respuesta: el cliente debe rechazarla.';
    default: return `Esta reserva está en estado "${statusLabel}" y ya no admite cancelación o modificación.`;
  }
}

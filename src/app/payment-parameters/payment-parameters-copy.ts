import { ParameterKey } from './model/payment-parameters';

/** Texts of the payment parameters; the wording is that of `admin-parametros-pago.html` and of its `saveOperatorPaymentParams` (mockup PDR v1.9, app.js). */
export const PAYMENT_PARAMETERS_COPY = {
  fields: {
    initialHoursTotal: { short: 'Inicial pago total (h)', label: 'Plazo inicial · pago total (h)' },
    initialHoursDeposit: { short: 'Inicial abono (h)', label: 'Plazo inicial · abono (h)' },
    minDepositPercent: { short: 'Abono mínimo (%)', label: 'Abono mínimo (% del valor final)' },
    extensionHours: { short: 'Ampliación (h)', label: 'Ampliación única (h)' },
    balanceHoursBefore: { short: 'Saldo (h antes)', label: 'Plazo del saldo (h antes del inicio)' },
    cancellationPenaltyPercent: { short: 'Penalidad (%)', label: 'Penalidad por cancelación del cliente (%)' },
  } satisfies Record<ParameterKey, { readonly short: string; readonly label: string }>,
  tenantRecord: 'Predeterminado del tenant',
  inherits: 'hereda el predeterminado',
  forbidden: 'Solo el Administrador del tenant define los parámetros de pago.',
  reasonRequired: 'Registra el motivo del cambio de parámetros.',
  noChanges: 'No hay cambios que guardar.',
  outOfBounds: (record: string, label: string, min: number, max: number) => `${record}: ${label} debe ser un entero entre ${min} y ${max}.`,
} as const;

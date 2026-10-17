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
  title: 'Parámetros de pago del tenant', back: 'Volver a Catálogos', link: 'Parámetros de pago',
  note: 'Solo el Administrador del tenant define plazos y condiciones de pago. Cada servicio hereda el predeterminado del tenant mientras su celda esté vacía; el valor gris es el que se aplica. Los cambios aplican a reservas nuevas (las existentes conservan los parámetros con que se crearon), exigen motivo y quedan auditados.',
  panelEyebrow: 'Plazos, abono y penalidad', panelTitle: 'Por servicio y tipo de pago', serviceColumn: 'Servicio',
  explanation: 'Plazo inicial: horas corridas desde la creación (nunca supera la hora de inicio de la salida). Plazo del saldo: horas antes del inicio de la salida. Abono mínimo: sobre el valor final después de descuentos. Penalidad: porcentaje retenido en la cancelación solicitada por el cliente (0 % = devolución del 100 % de lo pagado y validado).',
  reasonLabel: 'Motivo del cambio (obligatorio)', reasonPlaceholder: 'Ej.: política comercial de temporada',
  metaNone: 'Sin cambios guardados: se usan los valores predeterminados.', metaLast: (at: string, by: string) => `Última modificación: ${at} por ${by}.`,
  reset: 'Cargar predeterminados', save: 'Guardar parámetros', resetDone: 'Valores predeterminados cargados: guarda con un motivo para aplicarlos.',
  saved: 'Parámetros guardados y auditados. Aplican a las reservas nuevas; las existentes conservan los suyos.', failed: 'No se pudo guardar los parámetros. Reintenta.',
  loading: 'Cargando', readFailed: 'La solicitud falló.', retry: 'Reintentar',
  auditEyebrow: 'Auditoría', auditTitle: 'Últimos cambios', auditColumns: ['Fecha', 'Responsable', 'Registro', 'Motivo'] as readonly string[], auditEmpty: 'Sin cambios auditados.',
  /** The value of a cell for the person: a whole number as it is, the third of the seed with two decimals and a comma, and a dash while the policy is NO DEFINIDO. */
  value: (n: number | null | undefined) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')),
  cellLabel: (field: string, record: string) => `${field} · ${record}`,
  tenantRecord: 'Predeterminado del tenant',
  inherits: 'hereda el predeterminado',
  forbidden: 'Solo el Administrador del tenant define los parámetros de pago.',
  reasonRequired: 'Registra el motivo del cambio de parámetros.',
  noChanges: 'No hay cambios que guardar.',
  outOfBounds: (record: string, label: string, min: number, max: number) => `${record}: ${label} debe ser un entero entre ${min} y ${max}.`,
} as const;

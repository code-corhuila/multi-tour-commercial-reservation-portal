import { formatDate } from '../shared/format';
import type { Refund, RefundMethod, RefundState } from './data/refunds-ports';

/** Spanish copy of admin-pagos.html (panel), admin-solicitudes-devolucion.html and admin-detalle-devolucion.html (mockup and app.js), HU-COM-016. */
/** "Quedan 18 h 42 min" (the minutes are padded as the mockup does). */
const left = (minutes: number) => `Quedan ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
export const REFUNDS_COPY = {
  panelEyebrow: 'Devoluciones monetarias', consult: 'Consultar solicitudes', panelTitle: 'Autorización requerida', panelCopy: 'El Administrador autoriza o registra la devolución, con monto, motivo, reserva y movimiento de caja asociados.',
  panelTitleExecutor: 'Devoluciones autorizadas', panelCopyExecutor: 'Consulta las devoluciones autorizadas por el Administrador y registra la salida de dinero cuando corresponda.',
  eyebrow: 'Control de cobro', requestsTitle: 'Solicitudes de devolución', backToPayments: 'Volver a pagos',
  heroEyebrow: 'Devoluciones monetarias', heroTitle: 'Determinación, autorización y ejecución trazables.',
  heroCopy: 'Toda devolución registra causal, monto, responsable, fecha y su relación con la reserva y con el movimiento de caja correspondiente. El Administrador del tenant decide en 24 horas corridas; sin decisión se determina la devolución del 100 %, que debe ejecutarse en máximo 5 días hábiles.',
  alertsEyebrow: 'Alertas del panel', alertsHeading: 'Devoluciones que requieren atención', decideTreatment: 'Decidir tratamiento de valores abonados', treatmentAction: 'Decidir tratamiento',
  markOverdue: 'Ejecución vencida (5 días hábiles)', markAuto: 'Determinada por Multitour',
  lineOverdue: (r: Refund, money: string) => `#${r.id}: la ejecución de la devolución (${money}) superó los 5 días hábiles y está vencida; sigue siendo una obligación pendiente.`,
  lineDue: (r: Refund) => `#${r.id}: decisión del Administrador del tenant pendiente hasta el ${formatDateTime(r.decisionDueAt ?? '')}; sin decisión se determina la devolución del 100 %.`,
  lineAuto: (r: Refund, money: string) => `#${r.id}: devolución determinada automáticamente (${money}), pendiente de ejecución; no implica que el dinero haya sido devuelto.`,
  listEyebrow: 'Solicitudes', listTitle: 'Solicitudes registradas', columns: ['Reserva', 'Cliente', 'Motivo', 'Monto', 'Estado', 'Fecha', 'Acción'],
  count: (n: number) => `${n} solicitud${n === 1 ? '' : 'es'}`, empty: 'No hay solicitudes de devolución registradas.',
  authorizeAction: 'Autorizar devolución', executeAction: 'Registrar ejecución', consultAction: 'Consultar detalle', detailTitle: 'Detalle de devolución', backToRequests: 'Volver a solicitudes',
  accessNote: 'Solo el Administrador del tenant puede autorizar o rechazar una devolución o decidir el tratamiento de valores abonados. El Colaborador operativo solo puede registrar la ejecución cuando exista autorización previa y trazable (o una determinación automática, que cuenta como autorización).',
  overdueNote: 'La ejecución superó el plazo máximo de 5 días hábiles: la devolución está vencida y sigue siendo una obligación pendiente hasta que se ejecute.',
  ruleDefault: 'Devolución del 100 % por defecto.', noNote: 'Sin observaciones registradas.',
  ruleDue: (r: Refund) => `Decisión del Administrador del tenant antes del ${formatDateTime(r.decisionDueAt ?? '')}; si no decide, Multitour determina la devolución del 100 %.`,
  ruleExecution: (r: Refund) => `Ejecución máxima: ${formatDateTime(r.executionDueAt ?? '')} (5 días hábiles).`,
  infoEyebrow: 'Solicitud', infoTitle: 'Información de la devolución',
  fields: { reservation: 'Reserva relacionada', customer: 'Cliente', reason: 'Motivo / causal', note: 'Observación administrativa', amount: 'Monto', decisionReason: 'Motivo de la decisión',
    owner: 'Responsable', date: 'Fecha', method: 'Método de devolución', movement: 'Movimiento de caja asociado', state: 'Estado actual' },
  notApplicable: 'No aplica', noOwner: 'Sin responsable asignado', inExecution: 'En ejecución',
  decisionEyebrow: 'Decisión', authorize: 'Autorizar devolución', reason: 'Motivo (obligatorio)',
  reasonRequired: 'Registra el motivo para autorizar la devolución.', authorized: 'Devolución autorizada correctamente. Debe ejecutarse en un máximo de 5 días hábiles.',
  reject: 'Rechazar devolución', rejectRequired: 'Registra el motivo del rechazo.', rejected: 'Devolución rechazada correctamente.', decideRequired: 'Registra el motivo de la decisión.',
  decisionHint: 'Registra el motivo y toma la decisión.', creditAction: 'Registrar saldo a favor del 100 %', returnAction: 'Devolver el 100 %',
  creditDone: 'El 100 % quedó registrado como saldo a favor del cliente dentro del tenant.', returnDone: 'Devolución del 100 % registrada. Debe autorizarse y ejecutarse en un máximo de 5 días hábiles.',
  executeEyebrow: 'Ejecución', executeTitle: 'Registrar ejecución', outflow: '¿Hubo salida efectiva de dinero?', choose: 'Selecciona una opción',
  outflowYes: 'Sí, se realizó la salida de dinero', outflowNo: 'No, se registra como saldo a favor', method: 'Método de devolución', execute: 'Registrar ejecución de devolución',
  executeHint: 'Registra la ejecución de la devolución autorizada. Una devolución en efectivo exige la caja abierta; por transferencia después del cierre se registra sin reabrir la caja.',
  outflowRequired: 'Indica si hubo salida efectiva de dinero.', executed: 'Ejecución registrada correctamente. La salida de dinero quedó asociada a un movimiento de caja.',
  creditExecuted: 'Registrado como saldo a favor del cliente dentro del tenant: no hubo salida efectiva de dinero.',
  /** PROPUESTO (spec section 5): the mockup has no text for the failed cash step (AC-RF.4). */
  cashFailed: 'La salida de dinero no quedó registrada en caja: la devolución sigue autorizada.',
  trace: 'RF-015B · D1 · E16', manageTitle: 'Gestionar devolución', treatmentTitle: 'Tratamiento pendiente de devolución', backToRefunds: 'Volver a devoluciones',
  origin: (r: Refund) => `Reserva ${r.id} ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`, pendingTitle: 'Tratamiento pendiente', paid: 'Valores abonados:',
  choice: 'El Administrador del tenant decide dentro de 24 horas corridas entre devolver el 100 % o registrar el 100 % como saldo a favor.',
  left,
  defaultCopy: 'Sin decisión se aplica la devolución del 100 %. La ejecución debe completarse en máximo 5 días hábiles.',
  requestTitle: 'Solicitud de tratamiento', openDecision: 'Abrir decisión', viewDetail: 'Ver detalle y ejecución',
  decisionTitle: 'Decisión del Administrador del tenant', fullRefund: 'Registrar devolución del 100 %',
  cardRule: 'Dentro de 24 horas corridas desde el reconocimiento del dinero, decide entre devolver el 100 % o registrar el 100 % como saldo a favor. Sin decisión se aplica la devolución del 100 % (pendiente de ejecución en máximo 5 días hábiles).',
  notificationsTrace: 'RF-019', notificationsTitle: 'Centro de notificaciones', alertsTitle: 'Alertas del tenant', alertIcon: 'DV', alertTitle: (r: Refund) => `Devolución pendiente de decisión · ${r.id}`,
  alertDue: (minutes: number) => `Decisión del Administrador del tenant: ${left(minutes).toLowerCase()}. Si no decide en 24 horas, Multitour determina la devolución del 100 %.`,
  alertOverdueTitle: (r: Refund) => `Devolución vencida · ${r.id}`, alertOverdue: 'Superó los 5 días hábiles para ejecutarse. Sigue siendo una obligación pendiente.',
  alertAutoTitle: (r: Refund) => `Devolución determinada automáticamente · ${r.id}`, alertAuto: (r: Refund, money: string) => `${r.customer} · ${money} · pendiente de ejecución; no implica que el dinero haya sido devuelto.`,
  open: 'Abrir', proofIcon: 'CP', proofTitle: (n: number) => `Alerta prioritaria · Comprobantes con revisión vencida (${n})`,
  proofBody: (codes: readonly string[]) => `Reservas ${codes.join(', ')}: llevan más de 24 horas corridas En validación. Siguen pendientes: no cancelan la reserva ni liberan cupos.`, treatmentEmpty: 'No hay valores abonados pendientes de tratamiento.', treatmentRule: 'Tratamiento pendiente.', motive: 'Motivo de la decisión (obligatorio)', motivePlaceholder: 'Registra el motivo de la decisión',
  cardOwner: (r: Refund) => `Reserva #${r.id} · ${r.customer}`, viewDetailShort: 'Ver detalle',
  /** PROPUESTO (spec section 5): the mockup draws no empty state for the alerts. */
  noAlerts: 'No hay alertas pendientes.',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la solicitud seleccionada.',
} as const;

export const REFUND_STATE_LABEL: Readonly<Record<RefundState, string>> = { PENDIENTE_DE_DECISION: 'Pendiente de decisión', PENDIENTE_DE_AUTORIZACION: 'Pendiente de autorización', AUTORIZADA: 'Autorizada', EJECUTADA: 'Ejecutada',
  RECHAZADA: 'Rechazada', SALDO_A_FAVOR: 'Saldo a favor' };
/** AC-RF.7: the overdue execution is a mark beside the state, not a state. */
export const refundStateText = (r: Refund) => `${REFUND_STATE_LABEL[r.state]}${r.overdue ? ' · Ejecución vencida' : ''}`;
export const REFUND_METHOD_LABEL: Readonly<Record<RefundMethod, string>> = { BANK_TRANSFER: 'Transferencia', CASH: 'Efectivo' };

/** `2026-10-13T09:30:00-05:00` to `13 oct 2026 · 09:30`, the hour as written. */
export const formatDateTime = (iso: string) => `${formatDate(iso)} · ${iso.slice(11, 16)}`;

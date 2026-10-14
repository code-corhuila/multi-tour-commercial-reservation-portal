import { formatDate } from '../shared/format';
import type { Refund, RefundMethod, RefundState } from './data/refunds-ports';

/** Spanish copy of admin-pagos.html (panel), admin-solicitudes-devolucion.html and admin-detalle-devolucion.html (mockup and app.js), HU-COM-016. */
export const REFUNDS_COPY = {
  panelEyebrow: 'Devoluciones monetarias', consult: 'Consultar solicitudes', panelTitle: 'Autorización requerida', panelCopy: 'El Administrador autoriza o registra la devolución, con monto, motivo, reserva y movimiento de caja asociados.',
  panelTitleExecutor: 'Devoluciones autorizadas', panelCopyExecutor: 'Consulta las devoluciones autorizadas por el Administrador y registra la salida de dinero cuando corresponda.',
  eyebrow: 'Control de cobro', requestsTitle: 'Solicitudes de devolución', backToPayments: 'Volver a pagos',
  heroEyebrow: 'Devoluciones monetarias', heroTitle: 'Autorización y ejecución trazables.',
  heroCopy: 'Toda devolución registra causal, monto, responsable, fecha y su relación con la reserva y con el movimiento de caja correspondiente.',
  listEyebrow: 'Solicitudes', listTitle: 'Solicitudes registradas', columns: ['Reserva', 'Cliente', 'Motivo', 'Monto', 'Estado', 'Fecha', 'Acción'],
  count: (n: number) => `${n} solicitud${n === 1 ? '' : 'es'}`, empty: 'No hay solicitudes de devolución registradas.',
  authorizeAction: 'Autorizar devolución', executeAction: 'Registrar ejecución', consultAction: 'Consultar detalle', detailTitle: 'Detalle de devolución', backToRequests: 'Volver a solicitudes',
  accessNote: 'Solo el Administrador del tenant (Tenant Admin) puede autorizar o rechazar una devolución. El Colaborador operativo solo puede registrar la ejecución cuando exista autorización previa y trazable del Administrador.',
  infoEyebrow: 'Solicitud', infoTitle: 'Información de la devolución',
  fields: { reservation: 'Reserva relacionada', customer: 'Cliente', reason: 'Motivo / causal', amount: 'Monto', decisionReason: 'Motivo de la decisión',
    owner: 'Responsable', date: 'Fecha', method: 'Método de devolución/salida', movement: 'Movimiento de caja asociado', state: 'Estado actual' },
  notApplicable: 'No aplica', noOwner: 'Sin responsable asignado', inExecution: 'En ejecución',
  decisionEyebrow: 'Decisión', authorize: 'Autorizar devolución', reason: 'Motivo (obligatorio)',
  reasonRequired: 'Registra el motivo para autorizar la devolución.', authorized: 'Devolución autorizada correctamente.',
  executeEyebrow: 'Ejecución', executeTitle: 'Registrar ejecución', outflow: '¿Hubo salida efectiva de dinero?', choose: 'Selecciona una opción',
  outflowYes: 'Sí, se realizó la salida de dinero', method: 'Método de devolución/salida', execute: 'Registrar ejecución de devolución',
  executeHint: 'Registra la ejecución de la devolución autorizada.', outflowRequired: 'Indica si hubo salida efectiva de dinero.', executed: 'Ejecución registrada correctamente.',
  /** PROPUESTO (spec section 5): the mockup has no text for the failed cash step (AC-RF.4). */
  cashFailed: 'La salida de dinero no quedó registrada en caja: la devolución sigue autorizada.',
  trace: 'RF-015B · D1 · E16', manageTitle: 'Gestionar devolución', treatmentTitle: 'Tratamiento pendiente de devolución', backToRefunds: 'Volver a devoluciones',
  origin: (r: Refund) => `Reserva ${r.id} ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`, pendingTitle: 'Tratamiento pendiente', paid: 'Valores abonados:',
  choice: 'El Administrador del tenant decide dentro de 24 horas corridas entre devolver el 100 % o registrar el 100 % como saldo a favor.',
  left: (minutes: number) => `Quedan ${Math.floor(minutes / 60)} h ${minutes % 60} min`,
  defaultCopy: 'Sin decisión se aplica la devolución del 100 %. La ejecución debe completarse en máximo 5 días hábiles.',
  requestTitle: 'Solicitud de tratamiento', openDecision: 'Abrir decisión', viewDetail: 'Ver detalle y ejecución',
  decisionTitle: 'Decisión del Administrador del tenant', fullRefund: 'Registrar devolución del 100 %',
  decisionCopy: 'Dentro de 24 horas corridas desde el reconocimiento del dinero, decide entre devolver el 100 % o registrar el 100 % como saldo a favor. Si no hay decisión al vencer el contador, se aplica la devolución del 100 %.',
  executionTitle: 'Ejecución', executionCopy: 'La devolución debe ejecutarse en máximo 5 días hábiles y quedar registrada como movimiento individual de caja.',
  notificationsTrace: 'RF-019', notificationsTitle: 'Centro de notificaciones', alertsTitle: 'Alertas del tenant', alertIcon: 'DV', alertTitle: 'Devolución pendiente de decisión',
  /** PROPUESTO (spec section 5): the mockup draws no empty state for the alerts. */
  noAlerts: 'No hay alertas pendientes.',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la solicitud seleccionada.',
} as const;

export const REFUND_STATE_LABEL: Readonly<Record<RefundState, string>> = { PENDIENTE_DE_DECISION: 'Pendiente de decisión', PENDIENTE_DE_AUTORIZACION: 'Pendiente de autorización', AUTORIZADA: 'Autorizada', EJECUTADA: 'Ejecutada' };
/** AC-RF.7: Vencida is a mark beside the state, not a state. */
export const refundStateText = (r: Refund) => `${REFUND_STATE_LABEL[r.state]}${r.overdue ? ' · Vencida' : ''}`;
export const REFUND_METHOD_LABEL: Readonly<Record<RefundMethod, string>> = { BANK_TRANSFER: 'Transferencia', CASH: 'Efectivo' };

/** `2026-10-13T09:30:00-05:00` to `13 oct 2026 · 09:30`, the hour as written. */
export const formatDateTime = (iso: string) => `${formatDate(iso)} · ${iso.slice(11, 16)}`;

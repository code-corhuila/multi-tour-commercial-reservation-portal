import { formatDate } from '../shared/format';

/** Texts of admin-registrar-seguimiento.html, of the "Saldo pendiente" rows of admin-pagos.html (13) and of 24, as the mockup writes them. */
export const PAYMENT_FOLLOWUP_TEXT = {
  eyebrow: 'Control de cobro', title: 'Registrar seguimiento', back: 'Volver a pagos', pendingBalance: 'Saldo pendiente',
  contextEyebrow: '01. Contexto del pago', contextTitle: 'Estado actual de la reserva',
  fields: ['Reserva', 'Cliente', 'Modalidad de pago', 'Valor recibido', 'Saldo pendiente', 'Estado actual'], deadline: 'Plazo/límite vigente',
  followupEyebrow: '02. Seguimiento', followupTitle: 'Registrar contacto', note: 'Nota de seguimiento (obligatoria)',
  notePlaceholder: 'Describe el contacto realizado con el cliente y el resultado',
  hint: 'Registra la nota de seguimiento para dejar constancia del contacto con el cliente.',
  noteRequired: 'Registra una nota de seguimiento antes de guardar.', saved: 'Seguimiento registrado correctamente.',
  settled: 'Esta reserva ya está pagada: solo puedes consultar el historial de seguimientos existente.',
  notFound: 'No se encontró el pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Registrar seguimiento.',
  historyEyebrow: 'Trazabilidad', historyTitle: 'Historial de seguimientos', historyColumns: ['Fecha', 'Hora', 'Actor', 'Nota'],
  noHistory: 'Aún no se han registrado seguimientos para esta reserva.',
  /** 24 (and 21, PROPUESTO): the mockup's sentence names the departure start (spec 011- section 5). */
  departureLimit: (start: string) => `Ningún plazo de pago supera el inicio de la salida, ${start}.`,
};

/** "16 oct 2026 · 09:00" from an ISO date-time read as written (its own offset). */
export const dateTime = (iso: string) => `${formatDate(iso)} · ${iso.slice(11, 16)}`;

import { tenantWallTime } from '../shared/clock';
import { formatDate } from '../shared/format';
import type { PaymentDeadline } from './data/payment-followup-ports';

/** Texts of admin-registrar-seguimiento.html, of the "Saldo pendiente" rows of admin-pagos.html (13) and of 24, as the mockup writes them. */
export const PAYMENT_FOLLOWUP_TEXT = {
  eyebrow: 'Control de cobro', title: 'Registrar seguimiento', back: 'Volver a pagos', pendingBalance: 'Saldo pendiente',
  contextEyebrow: '01. Contexto del pago', contextTitle: 'Estado actual de la reserva',
  fields: ['Reserva', 'Cliente', 'Tipo y medio de pago', 'Valores validados', 'Saldo pendiente', 'Situación financiera'], departure: 'Salida', deadline: 'Plazo de pago vigente',
  /** Improvement of the owner (2026-10-21), spec 011- amendment: the phone of the customer as a link that calls, so the Colaborador does not look for it. */
  phone: 'Teléfono del cliente',
  followupEyebrow: '02. Seguimiento', followupTitle: 'Registrar contacto',
  rule: 'Durante el plazo, el Colaborador operativo puede contactar al cliente. Una respuesta del cliente sin pago no suspende ni cumple el plazo.', note: 'Nota de seguimiento (obligatoria)',
  notePlaceholder: 'Describe el contacto realizado con el cliente y el resultado',
  hint: 'Registra la nota de seguimiento para dejar constancia del contacto con el cliente.',
  noteRequired: 'Registra una nota de seguimiento antes de guardar.', saved: 'Seguimiento registrado correctamente.',
  settled: 'Esta reserva no tiene saldo pendiente o está cancelada: solo puedes consultar el historial de seguimientos existente.',
  extension: { eyebrow: 'Ampliación del plazo', title: 'Única ampliación registrada', hours: 'Duración de la ampliación (horas)', grant: 'Conceder ampliación', done: 'Ampliación registrada con su duración, fecha, hora y responsable.',
    offer: (hours: number) => `Se puede conceder una única ampliación antes del vencimiento (duración sugerida: ${hours} h). El plazo total nunca supera la hora programada de inicio de la salida.`,
    granted: (hours: number, actor: string, at: string) => `Ampliación concedida: ${hours} h por ${actor} el ${at}. El plazo total nunca supera la hora programada de inicio de la salida. No se admite otra ampliación.`,
    grantedUntil: (until: string) => `Ampliación concedida hasta el ${until}. El plazo total nunca supera la hora programada de inicio de la salida. No se admite otra ampliación.`, suggested: 24 },
  notFound: 'No se encontró el pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Registrar seguimiento.',
  historyEyebrow: 'Trazabilidad', historyTitle: 'Historial de seguimientos', historyColumns: ['Fecha', 'Hora', 'Actor', 'Nota'],
  noHistory: 'Aún no se han registrado seguimientos para esta reserva.',
  /** 24 (and 21, PROPUESTO): the mockup's sentence names the departure start (spec 011- section 5). */
  departureLimit: (start: string) => `Ningún plazo de pago supera el inicio de la salida, ${start}.`,
};

/** "16 oct 2026 · 09:00" from an ISO date-time read as written (its own offset). */
export const dateTime = (iso: string) => `${formatDate(iso)} · ${iso.slice(11, 16)}`;

/** The same, for an instant with any offset, read in the tenant's time (America/Bogota, no daylight saving): "10 oct 2026 · 10:00". */
export const tenantDateTime = (iso: string) => dateTime(tenantWallTime(iso));


/** "Plazo de pago" (app.js 10711): the effective deadline already resolved by the service; it never exceeds the departure start (RN-RES-006). */
export const deadlineText = (d: PaymentDeadline) =>
  `Vence el ${dateTime(d.dueAt)}${Date.parse(d.dueAt) >= Date.parse(d.departureStartsAt) ? ' · el vencimiento efectivo no supera la hora programada de inicio de la salida' : ''}.`;

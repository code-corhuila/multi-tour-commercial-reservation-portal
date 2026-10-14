import { departureLine } from '../shared/format';
import type { Departure, Reservation, ReservationPayment } from './model/reservation';

export const RESERVATION_TEXT = {
  eyebrow: 'Gestión comercial', title: 'Reservas', create: 'Crear reserva', save: 'Registrar reserva', cancel: 'Cancelar', back: 'Volver a reservas', view: 'Ver detalle',
  listEyebrow: 'Reservas activas', listTitle: 'Seguimiento de reservas', columns: ['Reserva', 'Cliente', 'Servicio y salida', 'Estado', 'Saldo', 'Acción'],
  loading: 'Cargando…', empty: 'Aún no hay reservas registradas.', noDepartures: 'No hay salidas abiertas para reservas.', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  offerEyebrow: '02. Servicios y viajeros', offerTitle: 'Oferta seleccionada', customer: 'Cliente titular', departure: 'Salida concreta', services: 'Servicios',
  people: 'Cantidad total de viajeros', choose: 'Selecciona una opción', perPerson: 'por persona',
  conditionsEyebrow: '04. Condiciones', conditionsTitle: 'Reglas aplicables', conditions: 'Condiciones de reserva', chooseDeparture: 'Selecciona una salida para consultar sus condiciones.',
  valuesEyebrow: 'Valores calculados', valuesTitle: 'Resumen de la reserva', valuesNote: 'Se recalcula con la salida, los servicios, las personas y los descuentos vigentes.',
  feedback: 'Completa los campos obligatorios para registrar la reserva.',
  transport: 'Transporte por persona', projected: 'Valor proyectado', applicable: 'Descuentos aplicables', applied: 'Descuentos aplicados', final: 'Valor final', balance: 'Saldo pendiente',
  ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior',
  noSeat: 'Aún no se aparta cupo: el cupo se aparta con el primer pago.',
  offerEyebrow02: '02. Tour, salida y viajeros', tour: 'Tour', scheduled: 'Salida programada', vehicles: 'Vehículo(s) de la salida', vehiclesValue: 'Se define con la salida',
  payEyebrow: '04. Condiciones y pago', payType: 'Tipo de pago esperado', payMethod: 'Medio de pago esperado', chooseType: 'Selecciona el tipo de pago', chooseMethod: 'Selecciona el medio de pago',
  accept: 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.',
  payNote: 'El tipo de pago (Pago total o Abono) y el medio (Transferencia o Efectivo) se eligen por separado.',
  heroEyebrow: 'Nueva reserva', heroTitle: 'Elige el tour y su salida, registra a las personas y los valores antes de continuar al pago.',
  heroNote: 'La reserva aplica únicamente condiciones, disponibilidad y descuentos vigentes del operador activo. Pertenece a una única salida y no aparta cupo hasta su primer pago.',
  followEyebrow: 'Seguimiento', followTitle: 'Reserva, salida, cupo y valores siempre conectados.',
  followNote: 'Cada reserva pertenece a una única salida. Las modificaciones permitidas antes de la ejecución recalculan disponibilidad, descuentos y saldo; el cambio exclusivo de fecha se registra sobre la misma reserva.',
  all: 'Ver todas las reservas', active: 'Ver reservas activas', pay: 'Gestionar pago', seePay: 'Ver pago', reschedule: 'Reprogramar',
};
/** Spanish badges of the screens; a code is never shown. */
export const STATUS_LABEL: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'Pendiente de pago', CONFIRMADA: 'Confirmada',
  EN_EJECUCION: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
export const FINANCIAL_LABEL: Record<Reservation['financialStatus'], string> = { SIN_PAGO: 'Sin pago', PARCIAL: 'Parcial',
  ABONO_RECIBIDO: 'Abono recibido', PAGO_COMPLETO: 'Pago completo' };
export const PAYMENT_TYPE_LABEL: Readonly<Record<string, string>> = { TOTAL: 'Pago total', PARTIAL: 'Abono' };
export const PAYMENT_METHOD_LABEL: Readonly<Record<string, string>> = { BANK_TRANSFER: 'Transferencia', CASH_AT_OFFICE: 'Efectivo' };
export const PROOF_LABEL: Record<ReservationPayment['proofStatus'], string> = { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado' };
export const DEPARTURE_STATE_LABEL: Record<Departure['state'], string> = { PROGRAMADA: 'Programada', EN_CURSO: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
/** Mockup 10, 10A, 10C: the latest proof beside the financial situation ("Sin comprobante · Sin pago"). */
export const paymentState = (r: Reservation) => `${PROOF_LABEL[r.payments?.at(-1)?.proofStatus ?? 'SIN_COMPROBANTE']} · ${FINANCIAL_LABEL[r.financialStatus]}`;
/** "Pago total · Transferencia", or "Sin definir" while the reservation carries neither. */
export const paymentLine = (r: Reservation) => [r.paymentType, r.paymentMethod].some(Boolean)
  ? [PAYMENT_TYPE_LABEL[r.paymentType ?? ''], PAYMENT_METHOD_LABEL[r.paymentMethod ?? '']].filter(Boolean).join(' · ') : 'Sin definir';
export const executionOf = (r: Reservation) => r.status === 'CANCELADA' ? 'No ejecutada' : r.status === 'EN_EJECUCION' || r.status === 'FINALIZADA' ? STATUS_LABEL[r.status] : 'Pendiente de ejecución';
export const seats = (n: number) => `${n} ${n === 1 ? 'cupo disponible' : 'cupos disponibles'}`;
/** "1 viajero" or "N viajeros"; "1 persona" or "N personas". */
export const travelers = (n: number) => `${n} ${n === 1 ? 'viajero' : 'viajeros'}`;
export const persons = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;
export const capacityMessage = (d: Departure) => `No hay cupo suficiente en esta salida: quedan ${d.effectiveCapacity} cupos. No se registró la reserva.`;

/** The validation messages of the reservation form, by field. */
export const RESERVATION_MESSAGES = {
  leadCustomerId: 'El cliente titular es obligatorio.', departureId: 'La salida es obligatoria.', serviceId: 'El tour es obligatorio.',
  paymentType: 'El tipo de pago esperado es obligatorio.', paymentMethod: 'El medio de pago esperado es obligatorio.',
  accepted: 'Confirma que el cliente acepta las condiciones.', people: 'La cantidad de viajeros es obligatoria: un número entero de al menos uno.',
};

/** Screens 10A and 10C (reservation view), in one place. */
export const RESERVATION_VIEW_TEXT = {
  heroNote: 'La reserva quedó registrada como proyección comercial dentro del operador activo, asociada a una única salida y sin cupo apartado hasta su primer pago.',
  summary: 'Resumen', departure: 'Salida', travelers: 'Viajeros', holder: 'Titular', deadline: 'Plazo de pago', deadlineOnCreate: 'Se define con la creación de la reserva',
  economic: 'Estado económico', paymentState: 'Estado de pago', typeAndMethod: 'Tipo y medio de pago',
  nextStep: 'Siguiente paso', nextTitle: 'Gestiona el pago según el tipo y el medio elegidos.',
  nextCopy: 'La reserva se confirmará solo cuando se valide el 100 % del valor final (pago total) o el abono mínimo (abono). La promesa de pago en efectivo no confirma la reserva. El cupo se aparta con el primer pago, previa verificación de disponibilidad en la salida.',
  departureOf: 'Salida:', consultNote: 'Consulta disponible únicamente dentro del operador activo.',
  holderAndTravelers: 'Titular y viajeros', registeredTravelers: 'Viajeros registrados', registeredCompanions: 'Acompañantes registrados',
  noBalance: 'sin saldo pendiente', pendingBalance: 'pendientes', validated: 'Valores validados', returned: 'Valores devueltos', minimumDeposit: 'Abono mínimo', notApplicable: 'No aplica',
  departureAndDeadlines: 'Salida y plazos', associatedDeparture: 'Salida asociada', manageRescheduling: 'Gestionar la reprogramación',
  departureState: 'Estado de la salida', extension: 'Ampliación del plazo', cancellationCause: 'Causa de cancelación', notRecorded: 'No registrada',
  servicesEyebrow: 'Servicios reservados', commercialProjection: 'Proyección comercial', service: 'Servicio', quantity: 'Cantidad', executionState: 'Estado de ejecución',
  frozen: 'Plazo congelado: la salida fue cancelada o interrumpida por una causa no atribuible al cliente (la reserva se gestiona con la reprogramación).',
  cancelledNoDeadline: 'La reserva no tiene un plazo de pago vigente.', noDeadlineInfo: 'Sin información de plazo.',
  dueOn: (date: string) => `Vence el ${departureLine(date)}.`,
  grantedUntil: (date: string) => `Concedida hasta ${departureLine(date)}`, availableOnce: 'Disponible (una única ampliación)',
  companions: (people: number) => `${people > 1 ? people - 1 : 0} ${people === 2 ? 'acompañante' : 'acompañantes'}`,
} as const;

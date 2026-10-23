import type { Departure, Reservation, ReservationDraft, ReservationPayment } from './model/reservation';

/** Texts of screens 10, 10B, 10C and 10A (`admin-reservas.html`, `admin-crear-reserva.html`). */
export const RESERVATION_TEXT = {
  eyebrow: 'Gestión comercial', title: 'Reservas', create: 'Crear reserva', save: 'Registrar reserva', cancel: 'Cancelar', back: 'Volver a reservas', view: 'Ver detalle',
  listEyebrow: 'Reservas activas', listTitle: 'Seguimiento de reservas', columns: ['Reserva', 'Cliente', 'Servicio y salida', 'Estado', 'Saldo', 'Acción'],
  loading: 'Cargando…', empty: 'Aún no hay reservas registradas.', noDepartures: 'No hay salidas abiertas para reservas.', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  offerEyebrow: '02. Servicios y viajeros', offerTitle: 'Oferta seleccionada', departure: 'Salida concreta', services: 'Servicios',
  people: 'Cantidad total de viajeros',
  conditionsEyebrow: '04. Condiciones', conditionsTitle: 'Reglas aplicables', conditions: 'Condiciones de reserva', chooseDeparture: 'Selecciona una salida para consultar sus condiciones.',
  chooseTourConditions: 'Selecciona un tour para consultar las condiciones parametrizadas.',
  valuesEyebrow: 'Valores calculados', valuesTitle: 'Resumen de la reserva', valuesNote: 'Se recalcula con el tour, las personas, el transporte del tour y los descuentos vigentes del operador activo, que quedan fijados en la reserva al crearla.',
  feedback: 'Completa los campos obligatorios para registrar la reserva.',
  feedbackNoTour: 'Selecciona un tour para consultar sus requisitos y valores.', feedbackNoDeparture: 'Selecciona la salida programada: la reserva pertenece a una única salida.',
  feedbackReady: 'La reserva cumple las validaciones y está lista para registrarse. Quedará Pendiente de pago hasta cumplir la condición de confirmación.',
  transport: 'Transporte por persona', projected: 'Valor proyectado', applicable: 'Descuentos aplicables', applied: 'Descuentos aplicados', final: 'Valor final', balance: 'Saldo pendiente',
  ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior',
  noSeat: 'Aún no se aparta cupo: el cupo se aparta con el primer pago.',
  offerEyebrow02: '02. Tour, salida y viajeros', tour: 'Tour', scheduled: 'Salida programada', vehicles: 'Vehículo(s) de la salida', vehiclesValue: 'Se define con la salida',
  chooseTour: 'Selecciona un tour', chooseTourFirst: 'Selecciona primero un tour', chooseScheduled: 'Selecciona una salida programada',
  departureHint: 'La reserva pertenece a una única salida. Una salida llena no admite nuevas reservas y la creación no aparta cupo: el cupo se aparta con el primer pago.',
  tenantLabel: 'Operador activo', tenantNote: 'Todos los catálogos, condiciones, cupos y valores se consultan en este contexto.',
  payEyebrow: '04. Condiciones y pago', payType: 'Tipo de pago esperado', payMethod: 'Medio de pago esperado', chooseType: 'Selecciona el tipo de pago', chooseMethod: 'Selecciona el medio de pago',
  accept: 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.',
  payIntro: 'La comida se muestra únicamente como incluida en el paquete del tour. El tipo de pago (Pago total o Abono) y el medio de pago (Transferencia o Efectivo) se eligen por separado.',
  payNote: 'El tipo de pago (Pago total o Abono) y el medio (Transferencia o Efectivo) se eligen por separado.',
  heroEyebrow: 'Nueva reserva', heroTitle: 'Elige el tour y su salida, registra a las personas y los valores antes de continuar al pago.',
  heroNote: 'La reserva aplica únicamente condiciones, disponibilidad y descuentos vigentes del operador activo. Pertenece a una única salida y no aparta cupo hasta su primer pago.',
  followEyebrow: 'Seguimiento', followTitle: 'Reserva, salida, cupo y valores siempre conectados.',
  followNote: 'Cada reserva pertenece a una única salida. Las modificaciones permitidas antes de la ejecución recalculan disponibilidad, descuentos y saldo; el cambio exclusivo de fecha se registra sobre la misma reserva.',
  all: 'Ver todas las reservas', active: 'Ver reservas activas', pay: 'Gestionar pago', seePay: 'Ver pago', reschedule: 'Reprogramar',
  modeBanner: 'Selecciona la reserva a la que deseas aplicar un descuento adicional.',
} as const;
/** Texts of the result (10C) and the detail (10A) of a reservation. */
export const RESERVATION_VIEW_TEXT = {
  heroNote: 'La reserva quedó registrada como proyección comercial dentro del operador activo, asociada a una única salida y sin cupo apartado hasta su primer pago.',
  summary: 'Resumen', departure: 'Salida', travelers: 'Viajeros', lead: 'Titular', deadline: 'Plazo de pago',
  deadlineUndefined: 'Se define con la creación de la reserva',
  economic: 'Estado económico', payState: 'Estado de pago', payLine: 'Tipo y medio de pago',
  nextEyebrow: 'Siguiente paso', nextTitle: 'Gestiona el pago según el tipo y el medio elegidos.',
  nextCopy: 'La reserva se confirmará solo cuando se valide el 100 % del valor final (pago total) o el abono mínimo (abono). La promesa de pago en efectivo no confirma la reserva. El cupo se aparta con el primer pago, previa verificación de disponibilidad en la salida.',
  departureNote: 'Salida:', departureWithCode: (code: string) => `Salida ${code}:`, email: 'Correo', detailNote: 'Consulta disponible únicamente dentro del operador activo.',
  leadAndTravelers: 'Titular y viajeros', registeredTravelers: 'Viajeros registrados', registeredCompanions: 'Acompañantes registrados',
  noBalance: 'sin saldo pendiente', pending: 'pendientes', validated: 'Valores validados', refunded: 'Valores devueltos',
  minimumDeposit: 'Abono mínimo', notApplicable: 'No aplica',
  departureAndTerms: 'Salida y plazos', associatedDeparture: 'Salida asociada', manageRescheduling: 'Gestionar la reprogramación',
  departureState: 'Estado de la salida', extension: 'Ampliación del plazo', cancellationCause: 'Causa de cancelación', notRegistered: 'No registrada',
  servicesEyebrow: 'Servicios reservados', servicesTitle: 'Proyección comercial',
  columnService: 'Servicio', columnDeparture: 'Salida', columnQuantity: 'Cantidad', columnExecution: 'Estado de ejecución',
  frozen: 'Plazo congelado: la salida fue cancelada o interrumpida por una causa no atribuible al cliente (la reserva se gestiona con la reprogramación).',
  noDeadline: 'La reserva no tiene un plazo de pago vigente.', noDeadlineInfo: 'Sin información de plazo.',
  due: (when: string): string => `Vence el ${when}.`,
  granted: (when: string): string => `Concedida hasta ${when}`,
  extensionAvailable: 'Disponible (una única ampliación)',
  companions: (people: number): string => `${people > 1 ? people - 1 : 0} ${people === 2 ? 'acompañante' : 'acompañantes'}`,
} as const;

/** Texts of the form of 10B that depend on what was chosen. */
export const RESERVATION_FORM_TEXT = {
  seatsNote: (seatsText: string): string => `Hay ${seatsText} en la salida seleccionada. El cupo no se garantiza hasta el primer pago.`,
  paymentNote: (typeLabel: string, partial: boolean): string => `Plazo inicial de pago (${typeLabel}): horas corridas desde la creación de la reserva, con una única ampliación registrada; nunca supera la hora programada de inicio de la salida. La promesa de pago en efectivo no confirma la reserva: se confirma al validar ${partial ? 'el abono mínimo' : 'el 100 % del valor final'}.`,
} as const;

/** Eyebrow and title of screens 10, 10B, 10C and 10A, by view. */
export const RESERVATION_HEADERS = {
  list: ['Gestión comercial', 'Reservas'], create: ['Gestión comercial', 'Crear reserva'],
  created: ['Registro completado', 'Reserva registrada'], detail: ['Consulta de reserva', 'Detalle de reserva'],
} as const;

/** What the form refuses, by field. */
export const RESERVATION_VALIDATION_TEXT: Readonly<Record<keyof ReservationDraft, string>> = {
  departureId: 'La salida es obligatoria.',
  serviceId: 'El tour es obligatorio.',
  paymentType: 'El tipo de pago esperado es obligatorio.',
  paymentMethod: 'El medio de pago esperado es obligatorio.',
  accepted: 'Confirma que el cliente acepta las condiciones.',
  people: 'La cantidad de viajeros es obligatoria: un número entero de al menos uno.',
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

/** Words of the lines that join the labels of a reservation. */
export const RESERVATION_LINE_TEXT = {
  undefinedPayment: 'Sin definir', notExecuted: 'No ejecutada', pendingExecution: 'Pendiente de ejecución',
} as const;
export const seats = (n: number) => `${n} ${n === 1 ? 'cupo disponible' : 'cupos disponibles'}`;
/** "1 viajero" or "N viajeros"; "1 persona" or "N personas". */
export const travelers = (n: number) => `${n} ${n === 1 ? 'viajero' : 'viajeros'}`;
export const persons = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

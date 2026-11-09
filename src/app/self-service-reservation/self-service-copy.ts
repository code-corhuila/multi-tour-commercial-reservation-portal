import { SIGN_IN_AS_CUSTOMER_NOTICE } from './data/customer-context';

/** Spanish badge of a reservation state; an unknown code is never shown (authorized screens P4). */
export const RESERVATION_STATE_LABEL: Readonly<Record<string, string>> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  CONFIRMED: 'Confirmada',
  IN_EXECUTION: 'En ejecución',
  FINALIZED: 'Finalizada',
  CANCELLED: 'Cancelada',
};
export const RESERVATION_STATE_UNKNOWN = 'Por definir';

/** The companions the holder brings: `No requiere acompañantes`, `1 acompañante requerido`. */
export function companions(people: number): string {
  const n = people - 1;
  return n < 1 ? 'No requiere acompañantes' : `${n} ${n === 1 ? 'acompañante requerido' : 'acompañantes requeridos'}`;
}

export function travelers(people: number): string {
  return `${people} ${people === 1 ? 'viajero' : 'viajeros'}`;
}

/** The texts of finalizar-reserva.html and mis-reservas.html (authorized screens 20, 21 and mis-reservas). */
export const SELF_SERVICE_TEXT = {
  nav: 'Mis reservas',
  confirmTitle: 'Finalizar reserva de tour',
  backToReserve: 'Volver a salida y viajeros',
  pill: 'Tu reserva se crea Pendiente de pago. Elige por separado el tipo de pago y el medio de pago habilitados.',
  holderTitle: 'Cliente titular',
  holderPending: 'Pendiente de definición: estos datos aún no se registran.',
  travelersTitle: 'Viajeros',
  travelersCopy: 'La cantidad total de viajeros determina los acompañantes que deben registrarse. Los documentos no pueden repetirse dentro de la misma reserva.',
  conditionLines: ['La modificación o cancelación depende de las condiciones vigentes del tour.', 'La disponibilidad y los valores se validan antes de registrar la reserva.'],
  helpTitle: '¿Necesitas ayuda?',
  helpLead: 'Asistencia comercial',
  helpCopy: 'El equipo del operador puede ayudarte a continuar el proceso de reserva y pago; no es un medio de pago.',
  barReservation: 'Reserva',
  draft: 'Borrador',
  barTotal: 'Total',
  barSelected: 'Seleccionado',
  summaryTitle: 'Resumen de reserva',
  basePrice: 'Precio base',
  discounts: 'Descuentos aplicables',
  subtotal: 'Subtotal',
  bases: { ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior' } as const,
  final: 'Valor final',
  conditionsTitle: 'Condiciones de reserva',
  conditionsCopy: 'Reservas únicamente el tour y la salida seleccionada. La alimentación indicada forma parte del paquete cuando corresponda; el hospedaje y los restaurantes asociados no se reservan en Multitour.',
  acceptConditions: 'Confirmo que acepto las condiciones aplicables a esta reserva.',
  acceptTerms: 'Acepto los términos y condiciones.',
  mustAccept: 'Acepta las condiciones y los términos para confirmar.',
  method: 'Medio de pago',
  methodHint: { BANK_TRANSFER: 'Subes el comprobante; queda En validación hasta que un usuario autorizado lo revise (hasta 24 horas).', CASH_AT_OFFICE: 'Se registra cuando el equipo del operador recibe el dinero. La promesa de pago no confirma la reserva.' } as Readonly<Record<string, string>>,
  chooseMethod: 'Selecciona uno',
  methodMissing: 'Selecciona un medio de pago.',
  confirm: 'Confirmar reserva',
  confirmCash: 'Crear reserva Pendiente de pago',
  loading: 'Cargando…',
  failed: 'No pudimos cargar esta información.',
  retry: 'Reintentar',
  noSelection: 'No hay una reserva en curso. Vuelve a Explorar para seleccionar un tour.',
  noMethods: 'El operador todavía no tiene medios de pago habilitados.',
  signIn: 'Inicia sesión o regístrate para confirmar. Tu selección se conserva.',
  noCapacity: 'No hay cupos suficientes en esta salida. No se creó ninguna reserva.',
  refused: 'No se creó la reserva. Inténtalo de nuevo.',
  created: 'Reserva creada',
  seeMine: 'Ver mis reservas',
  notCustomer: 'Solo un cliente con sesión iniciada puede confirmar una reserva aquí.',
  panelEyebrow: 'Portal cliente',
  panelTitle: 'Mis reservas',
  panelDesc: 'Consulta el estado de tus reservas propias, activas y pasadas, dentro del operador actual: salida, saldo, plazos y comprobantes.',
  readOnly: 'Desde este portal no puedes modificar ni cancelar reservas: para cambios o cancelaciones, comunícate con el operador.',
  historyTitle: 'Historial de reservas',
  departure: 'Salida',
  value: 'Valor',
  empty: 'Todavía no tienes reservas registradas. Explora el catálogo para crear la primera.',
  panelNotCustomer: SIGN_IN_AS_CUSTOMER_NOTICE,
} as const;

const seatsText = (n: number) => `${n} ${n === 1 ? 'cupo disponible' : 'cupos disponibles'}`;

/** The texts of reservar-tour.html (authorized screen 20). */
export const RESERVE_TEXT = {
  back: 'Volver al tour',
  title: 'Seleccionar salida y viajeros',
  from: 'Desde',
  category: 'Elige una de las salidas programadas.',
  listTitle: 'Salidas programadas',
  listCopy: 'Cada salida tiene fecha, hora de inicio, hora de finalización estimada y cupos propios. Cada reserva corresponde a una única salida; si quieres viajar en otra salida, crea otra reserva.',
  full: 'Salida llena',
  seats: seatsText,
  conditionsTitle: 'Condiciones de reserva',
  conditionsCopy: 'Consulta las condiciones aplicables a este tour antes de continuar.',
  seeConditions: 'Ver condiciones',
  noConditions: 'No hay condiciones adicionales configuradas para este tour.',
  travelersTitle: 'Cantidad de viajeros',
  travelers: 'Viajeros',
  travelersCopy: 'Incluye al titular y sus acompañantes.',
  fewer: 'Quitar un viajero',
  more: 'Agregar un viajero',
  capacityOk: (seats: number) => `Hay ${seatsText(seats)} en la salida seleccionada. El cupo no se garantiza hasta tu primer pago (comprobante presentado o efectivo registrado).`,
  capacityShort: (seats: number, people: number) => `Cupo no disponible: esta salida solo tiene ${seatsText(seats)} y seleccionaste ${people} viajeros.`,
  capacityFull: 'Esta salida está llena: no hay cupos disponibles y no se crea la reserva. Elige otra salida.',
  package: 'la alimentación indicada en el tour forma parte del paquete. Multitour no reserva habitaciones ni mesas: hoteles y restaurantes asociados se consultan solo como información de contacto.',
  packageLead: 'Incluido en el paquete:',
  projected: 'Valor proyectado',
  discount: 'Descuento vigente',
  final: 'Valor final',
  selection: 'Seleccionado',
  noDate: 'Sin salida seleccionada',
  continue: 'Continuar reserva',
  noTour: 'Tour no disponible',
  noTourCopy: 'Este tour ya no está activo o no existe. Vuelve a Explorar para elegir otro.',
  noDepartures: 'Este tour no tiene salidas abiertas para reservas en este momento.',
} as const;

/** The texts of panel-cliente.html (authorized screen 17), without the parts of other stories (payments, notifications). */
export const PANEL_TEXT = {
  eyebrow: 'Portal cliente',
  intro: 'Consulta la oferta disponible, revisa tus reservas y continúa la gestión de tus próximos viajes desde un solo lugar.',
  searchLabel: 'Buscar tours o establecimientos asociados',
  searchPlaceholder: 'Buscar tours o experiencias...',
  search: 'Buscar',
  reservations: 'Mis reservas',
  noActive: 'No tienes reservas activas',
  noActiveCopy: 'Explora el catálogo y selecciona los servicios para comenzar una nueva reserva.',
  seeReservations: 'Ver mis reservas',
  consult: 'Consulta en Mis reservas',
  own: 'Reservas propias',
  quick: 'Acciones rápidas',
  discounts: 'Descuentos vigentes',
  noDiscounts: 'No hay descuentos vigentes en este momento.',
  validUntil: 'Válido hasta',
  featured: 'Experiencias destacadas',
  noFeatured: 'No hay opciones disponibles en este momento.',
  from: 'Desde',
  detail: 'Ver detalle',
  filters: 'Filtros rápidos',
} as const;

/** The quick filters and quick actions of the panel (authorized screen 17). */
export const PANEL_CHIP_TEXT = { gastronomy: 'Restaurantes asociados', tours: 'Tours', lodging: 'Alojamiento asociado' } as const;
export const PANEL_QUICK_TEXT = {
  newReservation: { title: 'Nueva reserva', copy: 'Inicia una nueva reserva' },
  gastronomy: { title: 'Restaurantes asociados', copy: 'Consulta los datos de contacto de restaurantes asociados.' },
} as const;
/** `1 reserva activa`, `3 reservas activas`. */
export const activeReservations = (count: number): string => `${count} ${count === 1 ? 'reserva activa' : 'reservas activas'}`;

/** The holder fields of Finalizar reserva (finalizar-reserva.html): label and placeholder. */
export const HOLDER_TEXT = {
  name: { label: 'Nombre completo', placeholder: 'Nombre completo' },
  document: { label: 'Documento de identidad', placeholder: 'Documento' },
  phone: { label: 'Teléfono', placeholder: 'Teléfono' },
  email: { label: 'Correo electrónico', placeholder: 'correo@ejemplo.com' },
  birthdate: { label: 'Fecha de nacimiento', placeholder: '' },
} as const;

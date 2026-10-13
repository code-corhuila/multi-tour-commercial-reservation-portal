import { formatDate } from '../../shared/format';

/** What the customer chose in the public offer (HU-COM-006). DP-RS1: it travels in the URL, never in storage. */
export interface ReservationSelection {
  readonly departureId: string;
  readonly serviceIds: readonly string[];
  readonly people: number;
}

/** A method the tenant enabled. Choosing one registers no payment (AC-RS.4; payments are HU-COM-009). */
export interface PaymentMethod {
  readonly code: string;
  readonly label: string;
}

/** A reservation as the customer reads it. The values are the service's, in cents; the portal computes none. */
export interface CustomerReservation {
  /** The code the customer reads, e.g. RES-1843. */
  readonly reservationId: string;
  readonly tourName: string;
  /** ISO date-time of the departure. */
  readonly departureAt: string;
  readonly departureId: string;
  readonly serviceIds: readonly string[];
  readonly people: number;
  readonly projectedValueCents: number;
  readonly finalValueCents: number;
  readonly reservationStatus: string;
  readonly paymentStatus: string;
}

/** The summary of a selection before it is confirmed, in cents, from the calculation of HU-COM-007 (RN-RS4). */
export interface SelectionQuote {
  readonly tourName: string;
  readonly departureAt: string;
  readonly baseValueCents: number;
  readonly discountCents: number;
  readonly finalValueCents: number;
}

/** Spanish badge and its class for a reservation state; an unknown code is never shown (authorized screens P4). */
const RESERVATION_STATES: Readonly<Record<string, readonly [string, string]>> = {
  PENDING_PAYMENT: ['Pendiente de pago', 'crp-is-pending'],
  CONFIRMED: ['Confirmada', 'crp-is-confirmed'],
  IN_EXECUTION: ['En ejecución', 'crp-is-execution'],
  FINALIZED: ['Finalizada', 'crp-is-finalized'],
  CANCELLED: ['Cancelada', 'crp-is-cancelled'],
};

export function reservationState(code: string): readonly [label: string, cssClass: string] {
  return RESERVATION_STATES[code] ?? ['Por definir', ''];
}

/** `2026-09-18T06:30:00` to `18 sep 2026 · 06:30`. */
export function departureLine(isoDateTime: string): string {
  const time = /T(\d{2}:\d{2})/.exec(isoDateTime)?.[1];
  return time ? `${formatDate(isoDateTime)} · ${time}` : formatDate(isoDateTime);
}

/** The companions the holder brings: `No requiere acompañantes`, `1 acompañante requerido`. */
export function companions(people: number): string {
  const n = people - 1;
  return n < 1 ? 'No requiere acompañantes' : `${n} ${n === 1 ? 'acompañante requerido' : 'acompañantes requeridos'}`;
}

export function travelers(people: number): string {
  return `${people} ${people === 1 ? 'viajero' : 'viajeros'}`;
}

/** Reads `?departure=..&services=a,b&people=n`; an incomplete or malformed selection is null, never guessed. */
export function selectionFromQuery(query: string): ReservationSelection | null {
  const params = new URLSearchParams(query);
  const departureId = params.get('departure')?.trim() ?? '';
  const serviceIds = (params.get('services') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const peopleText = params.get('people') ?? '';
  const people = /^\d+$/.test(peopleText) ? Number(peopleText) : 0;
  if (!departureId || serviceIds.length === 0 || !Number.isSafeInteger(people) || people < 1) return null;
  return { departureId, serviceIds, people };
}

/** The texts of finalizar-reserva.html and mis-reservas.html (authorized screens 20, 21 and mis-reservas). */
export const SELF_SERVICE_TEXT = {
  nav: 'Mis reservas',
  confirmTitle: 'Finalizar reserva de tour',
  backToReserve: 'Volver a fecha y viajeros',
  pill: 'Selecciona el medio de pago habilitado para esta reserva.',
  holderTitle: 'Cliente titular',
  holderPending: 'Pendiente de definición: estos datos aún no se registran (DP-RS5).',
  travelersTitle: 'Viajeros',
  travelersCopy: 'La cantidad total de viajeros determina los acompañantes que deben registrarse. Los documentos no pueden repetirse dentro de la misma reserva.',
  conditionLines: ['La modificación o cancelación depende de las condiciones vigentes del tour.', 'La disponibilidad y los valores se validan antes de registrar la reserva.'],
  helpTitle: '¿Necesitas ayuda?',
  helpLead: 'Asistencia comercial',
  helpCopy: 'El equipo del operador puede ayudarte a continuar el proceso.',
  barReservation: 'Reserva',
  draft: 'Borrador',
  barTotal: 'Total',
  barSelected: 'Seleccionado',
  summaryTitle: 'Resumen de reserva',
  basePrice: 'Precio base',
  discounts: 'Descuentos aplicables',
  final: 'Valor final',
  conditionsTitle: 'Condiciones de reserva',
  conditionsCopy: 'Reserva únicamente el tour y la salida seleccionada. La alimentación indicada forma parte del paquete cuando corresponda; hospedaje y alimentación no son servicios reservables.',
  acceptConditions: 'Confirmo que acepto las condiciones aplicables a esta reserva.',
  acceptTerms: 'Acepto los términos y condiciones.',
  mustAccept: 'Acepta las condiciones y los términos para confirmar.',
  method: 'Medio de pago',
  chooseMethod: 'Selecciona uno',
  methodMissing: 'Selecciona un medio de pago.',
  confirm: 'Confirmar reserva',
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
  panelDesc: 'Consulta el estado de tus reservas propias, activas y pasadas, dentro del operador actual.',
  readOnly: 'Para cambios o cancelaciones, comunícate con el operador.',
  historyTitle: 'Historial de reservas',
  departure: 'Salida',
  value: 'Valor',
  empty: 'Todavía no tienes reservas registradas. Explora el catálogo para crear la primera.',
  panelNotCustomer: 'Inicia sesión como cliente para ver tus reservas.',
} as const;

/** The keys of the client areas of this story that a page opens with parameters (PortalNavigation.open). */
export const RESERVATION_FLOW = Object.freeze({ reserve: 'reserve', finish: 'finish' } as const);

/** DP-RS1 inside the shell: the parameters of the last opening, read as the URL query is. */
export function selectionFromParams(params: Readonly<Record<string, string>>): ReservationSelection | null {
  return selectionFromQuery(new URLSearchParams({ ...params }).toString());
}

/** Accent- and case-blind comparison of a departure's tour name with a catalog name (no tour id on a departure yet, G-OPS). */
export function sameTour(a: string, b: string): boolean {
  const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  return plain(a) === plain(b);
}

/** `2026-11` to `Noviembre de 2026`. */
export function monthLabel(yearMonth: string): string {
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [year, month] = yearMonth.split('-').map(Number);
  const name = names[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

/** The texts of reservar-tour.html (authorized screen 20). */
export const RESERVE_TEXT = {
  back: 'Volver al tour',
  title: 'Seleccionar salida y viajeros',
  from: 'Desde',
  departures: 'Salidas disponibles',
  previous: 'Mes anterior',
  next: 'Mes siguiente',
  weekdays: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  conditionsTitle: 'Condiciones de reserva',
  conditionsCopy: 'Consulta las condiciones aplicables a este tour antes de continuar.',
  seeConditions: 'Ver condiciones',
  noConditions: 'No hay condiciones adicionales configuradas para este tour.',
  travelersTitle: 'Cantidad de viajeros',
  travelers: 'Viajeros',
  travelersCopy: 'Incluye al titular y sus acompañantes.',
  fewer: 'Quitar un viajero',
  more: 'Agregar un viajero',
  capacityOk: 'Disponibilidad validada para la cantidad de viajeros seleccionada.',
  chooseDeparture: 'Selecciona una salida disponible.',
  selected: 'Salida seleccionada:',
  singleDeparture: 'Cada reserva corresponde a una única salida.',
  projected: 'Valor proyectado',
  discount: 'Descuento vigente',
  final: 'Valor final',
  selection: 'Seleccionado',
  noDate: 'Sin fecha seleccionada',
  continue: 'Continuar reserva',
  noTour: 'Tour no disponible',
  noTourCopy: 'Este tour ya no está activo o no existe. Vuelve a Explorar para elegir otro.',
  noDepartures: 'Este tour no tiene salidas abiertas para reservas en este momento.',
} as const;

export function overCapacity(seats: number): string {
  return `La cantidad seleccionada supera la capacidad disponible (${seats} ${seats === 1 ? 'viajero' : 'viajeros'}).`;
}

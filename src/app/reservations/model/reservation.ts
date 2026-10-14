import { formatCop } from '../../shared/format';

/** PROPUESTO: field names await the reservation contract (gap G-B). A departure stands in for HU-OPS-001 (gap G-OPS). */
export type Departure = {
  readonly id: string; readonly tourName: string; readonly date: string;
  readonly state: 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA'; readonly openForReservations: boolean;
  readonly effectiveCapacity: number; readonly transportPerPersonCents: number; readonly conditions: string;
};
/** Pending HU-COM-005: the lead customer is chosen here, registered there. */
export type LeadCustomer = { readonly id: string; readonly fullName: string };
export type ServiceOption = { readonly id: string; readonly name: string; readonly rateCents: number };
/** Pending HU-COM-004: its calculation returns these lines, in the order applied. */
export type AppliedDiscount = { readonly name: string; readonly base: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly amountCents: number };
export type Quote = {
  readonly services: readonly { readonly name: string; readonly cents: number }[]; readonly transportCents: number;
  readonly projectedCents: number; readonly discounts: readonly AppliedDiscount[]; readonly discountCents: number; readonly finalCents: number;
};
export type CreateReservationCommand = {
  readonly leadCustomerId: string; readonly departureId: string; readonly serviceIds: readonly string[]; readonly people: number;
};
/** The snapshot fixed at creation and the balance the service keeps; the screens never recalculate them (RN-RES-003, 007- H-D8). */
export type Reservation = {
  readonly id: string; readonly leadCustomerName: string; readonly tourName: string; readonly departureDate: string; readonly conditions: string;
  readonly people: number; readonly quote: Quote; readonly balanceCents: number; readonly status: ReservationStatus; readonly financialStatus: 'SIN_PAGO' | 'PARCIAL' | 'ABONO_RECIBIDO' | 'PAGO_COMPLETO';
  /** HU-COM-009 RN-PY5: held with the first payment. */
  readonly seatHeld: boolean; readonly departureId?: string;
  /** HU-COM-009 DP-PY3: type and method codes of PaymentMethodsSource; absent while none was set. */
  readonly paymentType?: string; readonly paymentMethod?: string;
  /** HU-COM-009: resolved by the service; registering moves neither (RN-PY1). */
  readonly validatedCents?: number; readonly payments?: readonly ReservationPayment[];
  /** HU-COM-013 D-02 (PROPUESTO): resolved by the service; the cancellation, the decision it opened and the HU-COM-018 mark (DD-4). */
  readonly cancellation?: { readonly cause: string; readonly by: string; readonly at: string }; readonly reschedulingPending?: boolean;
  readonly financialDecision?: { readonly kind: 'CUSTOMER_CANCELLATION' | 'RESCHEDULING_NOT_ACCEPTED'; readonly baseAmountCents: number; readonly penaltyAmountCents: number | null;
    readonly refundableCents: number | null; readonly recognizedAt: string; readonly outcome: null; readonly origin?: 'HU-COM-018' };
  /** HU-COM-011 D-02 (PROPUESTO): payment_deadlines and payment_followups (ERD-01), kept by the service; ISO with offset. */
  readonly deadline?: { readonly dueAt: string; readonly extendedUntil?: string };
  readonly followups?: readonly { readonly note: string; readonly actorLabel: string; readonly contactedAt: string }[];
  /** HU-COM-016 D-02 (PROPUESTO): the refund of this reservation's money as facts; RefundsSource resolves its amount and state (DD-1). */
  readonly refund?: { readonly origin: 'NON_PAYMENT' | 'LOWER_VALUE' | 'CUSTOMER_CANCELLATION' | 'NOT_ATTRIBUTABLE' | 'RESCHEDULING'; readonly reason: string;
    readonly amountCents: number; readonly recognizedAt: string; readonly decision?: RefundAct; readonly authorization?: RefundAct & { readonly reason: string };
    readonly execution?: RefundAct & { readonly method: string; readonly cashMovement: string };
    /** v1.9 (PROPUESTO): the administrative note, the justified rejection, and the 100 % kept as a credit balance (decision or execution without outflow). */
    readonly note?: string; readonly rejection?: RefundAct & { readonly reason: string }; readonly creditBalance?: RefundAct & { readonly reason?: string } };
  /** HU-COM-018 D-02 (PROPUESTO): the rescheduling episode, on the same reservation; fields follow rescheduling_records (G-B). */
  readonly reschedulingEpisode?: ReschedulingEpisode;
};
export type ReschedulingEpisode = {
  readonly originDepartureId: string; readonly originAt: string;
  readonly proposal?: { readonly departureId: string; readonly sentAt: string; readonly heldSeats: number };
  readonly answer?: { readonly decision: 'ACCEPTED' | 'REJECTED' | 'NO_ALTERNATIVE'; readonly at: string; readonly by: string };
};
/** HU-COM-016: who acted and when (G-USR: a label until the session carries the user). */
export type RefundAct = { readonly by: string; readonly at: string };
/** HU-COM-009: a payment pending validation (RN-PY1); HU-COM-010 (D-02): when it was presented and the decision on its proof.
 * Field names await payment_attempts (G-B). */
export type ReservationPayment = {
  readonly id: string; readonly method: string; readonly amountCents: number; readonly proofName: string | null;
  readonly proofStatus: 'EN_VALIDACION' | 'SIN_COMPROBANTE' | 'APROBADO' | 'RECHAZADO'; readonly registeredBy: string;
  readonly presentedAt?: string; readonly review?: { readonly decision: 'APROBADO' | 'RECHAZADO'; readonly verifiedAmountCents: number | null; readonly reason: string;
    readonly actorLabel: string; readonly decidedAt: string };
};
export type ReservationStatus = 'PENDIENTE_DE_PAGO' | 'CONFIRMADA' | 'EN_EJECUCION' | 'FINALIZADA' | 'CANCELADA';
export type ReservationDraft = { leadCustomerId: string; departureId: string; serviceIds: readonly string[]; people: string };
export type ReservationMessages = Partial<Record<keyof ReservationDraft, string>>;

export const RESERVATION_TEXT = {
  eyebrow: 'Gestión comercial', title: 'Reservas', create: 'Crear reserva', save: 'Registrar reserva', cancel: 'Cancelar', back: 'Volver a reservas', view: 'Ver detalle',
  listEyebrow: 'Reservas activas', listTitle: 'Seguimiento de reservas', columns: ['Reserva', 'Cliente', 'Servicio', 'Estado', 'Saldo', 'Acción'],
  loading: 'Cargando…', empty: 'Aún no hay reservas registradas.', noDepartures: 'No hay salidas abiertas para reservas.', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  offerEyebrow: '02. Servicios y viajeros', offerTitle: 'Oferta seleccionada', customer: 'Cliente titular', departure: 'Salida concreta', services: 'Servicios',
  people: 'Cantidad total de viajeros', choose: 'Selecciona una opción', perPerson: 'por persona',
  conditionsEyebrow: '04. Condiciones', conditionsTitle: 'Reglas aplicables', conditions: 'Condiciones de reserva', chooseDeparture: 'Selecciona una salida para consultar sus condiciones.',
  valuesEyebrow: 'Valores calculados', valuesTitle: 'Resumen de la reserva', valuesNote: 'Se recalcula con la salida, los servicios, las personas y los descuentos vigentes.',
  feedback: 'Completa los campos obligatorios para registrar la reserva.',
  transport: 'Transporte por persona', projected: 'Valor proyectado', applicable: 'Descuentos aplicables', applied: 'Descuentos aplicados', final: 'Valor final', balance: 'Saldo pendiente',
  ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior',
  noSeat: 'Aún no se aparta cupo: el cupo se aparta con el primer pago.',
};
/** Spanish badges of the screens; a code is never shown. */
export const STATUS_LABEL: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'Pendiente de pago', CONFIRMADA: 'Confirmada',
  EN_EJECUCION: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
/** The badge class of each state the service returns. */
export const STATUS_CLASS: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'crp-is-pending', CONFIRMADA: 'crp-is-confirmed',
  EN_EJECUCION: 'crp-is-execution', FINALIZADA: 'crp-is-finalized', CANCELADA: 'crp-is-cancelled' };
/** The reservation_status codes the customer area reads (PROPUESTO until the contract, G-B). */
export const STATUS_CODE: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'PENDING_PAYMENT', CONFIRMADA: 'CONFIRMED',
  EN_EJECUCION: 'IN_EXECUTION', FINALIZADA: 'FINALIZED', CANCELADA: 'CANCELLED' };
export const FINANCIAL_LABEL: Record<Reservation['financialStatus'], string> = { SIN_PAGO: 'Sin pago', PARCIAL: 'Parcial',
  ABONO_RECIBIDO: 'Abono recibido', PAGO_COMPLETO: 'Pago completo' };
export const money = formatCop;
/** "1 viajero" or "N viajeros"; "1 persona" or "N personas". */
export const travelers = (n: number) => `${n} ${n === 1 ? 'viajero' : 'viajeros'}`;
export const persons = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

/** RN-RES-010, RN-SAL-001: only a Programada departure that is open for reservations is offered. */
export const openDepartures = (all: readonly Departure[]) => all.filter((d) => d.state === 'PROGRAMADA' && d.openForReservations);
/** RN-RES-007: a read-only comparison; it holds no seat. */
export const hasCapacity = (departure: Departure, people: number) => people <= departure.effectiveCapacity;
export const capacityMessage = (d: Departure) => `No hay cupo suficiente en esta salida: quedan ${d.effectiveCapacity} cupos. No se registró la reserva.`;

/** A whole number of people of at least one, or null. */
export function peopleOf(text: string): number | null {
  const typed = text.trim(), people = Number(typed);
  return /^\d+$/.test(typed) && Number.isSafeInteger(people) && people >= 1 ? people : null;
}

export function validateReservation(draft: ReservationDraft, departure: Departure | undefined): ReservationMessages {
  const errors: ReservationMessages = {}, people = peopleOf(draft.people);
  if (!draft.leadCustomerId) errors.leadCustomerId = 'El cliente titular es obligatorio.';
  if (!departure) errors.departureId = 'La salida es obligatoria.';
  if (!draft.serviceIds.length) errors.serviceIds = 'Selecciona al menos un servicio.';
  if (people === null) errors.people = 'La cantidad de viajeros es obligatoria: un número entero de al menos uno.';
  else if (departure && !hasCapacity(departure, people)) errors.people = capacityMessage(departure);
  return errors;
}

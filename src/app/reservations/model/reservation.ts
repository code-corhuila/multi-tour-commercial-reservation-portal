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
  /** v1.9 (mockup 04, PROPUESTO until the contract, G-B): the expected type and method, chosen apart; codes of PaymentMethodsSource. */
  readonly paymentType?: string; readonly paymentMethod?: string;
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
    readonly actorLabel: string; readonly decidedAt: string;
    /** RN-RES-006A: what the approval did with the verified amount (applied, excess as credit, value of a cancelled reservation left untreated). */
    readonly appliedCents?: number; readonly surplusCents?: number; readonly pendingTreatmentCents?: number };
};
export type ReservationStatus = 'PENDIENTE_DE_PAGO' | 'CONFIRMADA' | 'EN_EJECUCION' | 'FINALIZADA' | 'CANCELADA';
/** RN-RES-010: one tour (a catalog service) per reservation. */
export type ReservationDraft = { leadCustomerId: string; departureId: string; serviceId: string; people: string; paymentType: string; paymentMethod: string; accepted: boolean };
export type ReservationMessages = Partial<Record<keyof ReservationDraft, string>>;

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
/** The badge class of each state the service returns. */
export const STATUS_CLASS: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'crp-is-pending', CONFIRMADA: 'crp-is-confirmed',
  EN_EJECUCION: 'crp-is-execution', FINALIZADA: 'crp-is-finalized', CANCELADA: 'crp-is-cancelled' };
/** The reservation_status codes the customer area reads (PROPUESTO until the contract, G-B). */
export const STATUS_CODE: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'PENDING_PAYMENT', CONFIRMADA: 'CONFIRMED',
  EN_EJECUCION: 'IN_EXECUTION', FINALIZADA: 'FINALIZED', CANCELADA: 'CANCELLED' };
export const FINANCIAL_LABEL: Record<Reservation['financialStatus'], string> = { SIN_PAGO: 'Sin pago', PARCIAL: 'Parcial',
  ABONO_RECIBIDO: 'Abono recibido', PAGO_COMPLETO: 'Pago completo' };
export const PAYMENT_TYPE_LABEL: Readonly<Record<string, string>> = { TOTAL: 'Pago total', PARTIAL: 'Abono' };
export const PAYMENT_METHOD_LABEL: Readonly<Record<string, string>> = { BANK_TRANSFER: 'Transferencia', CASH_AT_OFFICE: 'Efectivo' };
const PROOF_LABEL: Record<ReservationPayment['proofStatus'], string> = { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado' };
export const DEPARTURE_STATE_LABEL: Record<Departure['state'], string> = { PROGRAMADA: 'Programada', EN_CURSO: 'En ejecución', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
/** Mockup 10, 10A, 10C: the latest proof beside the financial situation ("Sin comprobante · Sin pago"). */
export const paymentState = (r: Reservation) => `${PROOF_LABEL[r.payments?.at(-1)?.proofStatus ?? 'SIN_COMPROBANTE']} · ${FINANCIAL_LABEL[r.financialStatus]}`;
/** "Pago total · Transferencia", or "Sin definir" while the reservation carries neither. */
export const paymentLine = (r: Reservation) => [r.paymentType, r.paymentMethod].some(Boolean)
  ? [PAYMENT_TYPE_LABEL[r.paymentType ?? ''], PAYMENT_METHOD_LABEL[r.paymentMethod ?? '']].filter(Boolean).join(' · ') : 'Sin definir';
export const executionOf = (r: Reservation) => r.status === 'CANCELADA' ? 'No ejecutada' : r.status === 'EN_EJECUCION' || r.status === 'FINALIZADA' ? STATUS_LABEL[r.status] : 'Pendiente de ejecución';
export const seats = (n: number) => `${n} ${n === 1 ? 'cupo disponible' : 'cupos disponibles'}`;
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
  if (!draft.serviceId) errors.serviceId = 'El tour es obligatorio.';
  if (!draft.paymentType) errors.paymentType = 'El tipo de pago esperado es obligatorio.';
  if (!draft.paymentMethod) errors.paymentMethod = 'El medio de pago esperado es obligatorio.';
  if (!draft.accepted) errors.accepted = 'Confirma que el cliente acepta las condiciones.';
  if (people === null) errors.people = 'La cantidad de viajeros es obligatoria: un número entero de al menos uno.';
  else if (departure && !hasCapacity(departure, people)) errors.people = capacityMessage(departure);
  return errors;
}

import { formatCop } from '../../shared/format';
import type { DepartureCapacity } from '../data/departure-capacity';
import {
  FINANCIAL_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, PROOF_LABEL, RESERVATION_LINE_TEXT, RESERVATION_VALIDATION_TEXT as INVALID, STATUS_LABEL,
} from '../reservations-copy';

/** PROPUESTO: field names await the reservation contract (gap G-B). A departure stands in for HU-OPS-001 (gap G-OPS). */
export type Departure = {
  readonly id: string; readonly tourName: string; readonly date: string;
  readonly state: 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'CANCELADA'; readonly openForReservations: boolean;
  readonly effectiveCapacity: number; readonly transportPerPersonCents: number; readonly conditions: string;
};
/** Pending HU-COM-005: the lead customer is chosen here, registered there. */
export type LeadCustomer = { readonly id: string; readonly fullName: string };
export type ServiceOption = { readonly id: string; readonly name: string; readonly rateCents: number; readonly highRisk?: boolean };
/** Pending HU-COM-004: its calculation returns these lines, in the order applied. */
export type AppliedDiscount = { readonly name: string; readonly base: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly amountCents: number };
export type Quote = {
  readonly services: readonly { readonly name: string; readonly cents: number }[]; readonly transportCents: number;
  readonly projectedCents: number; readonly discounts: readonly AppliedDiscount[]; readonly discountCents: number; readonly finalCents: number;
};
/** The titular typed in section 01 of 10B and each companion of section 03; the shape HU-COM-005 hands to the form (structural, no import of its model). */
export type ReservationLead = { readonly fullName: string; readonly document: string; readonly email: string; readonly phone: string; readonly birthDate: string };
export type ReservationCompanion = { readonly fullName: string; readonly document: string; readonly birthDate: string };
export type CreateReservationCommand = {
  readonly leadCustomerId?: string; readonly lead?: ReservationLead; readonly companions?: readonly ReservationCompanion[];
  /** The confirmation of the conditions given in 10B, sent as the terms of a typed titular (RN-CLI-001); absent when a customer was chosen. */
  readonly acceptedTerms?: boolean;
  readonly departureId: string; readonly serviceIds: readonly string[]; readonly people: number;
  /** v1.9 (mockup 04, PROPUESTO until the contract, G-B): the expected type and method, chosen apart; codes of PaymentMethodsSource. */
  readonly paymentType?: string; readonly paymentMethod?: string;
};
/** The snapshot fixed at creation and the balance the service keeps; the screens never recalculate them (RN-RES-003, 007- H-D8). */
export type Reservation = {
  readonly id: string; readonly leadCustomerName: string; readonly tourName: string; readonly departureDate: string; readonly conditions: string;
  readonly people: number; readonly quote: Quote; readonly balanceCents: number; readonly status: ReservationStatus; readonly financialStatus: 'SIN_PAGO' | 'PARCIAL' | 'ABONO_RECIBIDO' | 'PAGO_COMPLETO';
  /** HU-COM-009 RN-PY5: held with the first payment. */
  readonly seatHeld: boolean; readonly departureId?: string;
  /** "Registrar seguimiento" (spec 011- amendment, G-B PROPUESTO): the phone typed for the lead customer, so the Colaborador can call; absent when none was typed. */
  readonly leadPhone?: string;
  /** 10A (spec 007-, G-B PROPUESTO): the e-mail of the lead customer and the code of the departure, when the service returns them. */
  readonly leadEmail?: string; readonly departureCode?: string;
  /** HU-COM-009 DP-PY3: type and method codes of PaymentMethodsSource; absent while none was set. */
  readonly paymentType?: string; readonly paymentMethod?: string;
  /** HU-COM-009: resolved by the service; registering moves neither (RN-PY1). */
  readonly validatedCents?: number; readonly payments?: readonly ReservationPayment[];
  /** HU-COM-013 D-02 (PROPUESTO): resolved by the service; the cancellation, the decision it opened and the HU-COM-018 mark (DD-4). */
  readonly cancellation?: { readonly cause: string; readonly by: string; readonly at: string; readonly origin?: 'customer' | 'not-attributable' | 'non-payment' }; readonly reschedulingPending?: boolean;
  readonly financialDecision?: { readonly kind: 'CUSTOMER_CANCELLATION' | 'RESCHEDULING_NOT_ACCEPTED'; readonly baseAmountCents: number; readonly penaltyAmountCents: number | null;
    readonly refundableCents: number | null; readonly recognizedAt: string; readonly outcome: null; readonly origin?: 'HU-COM-018' };
  /** HU-COM-011 D-02 (PROPUESTO): payment_deadlines and payment_followups (ERD-01), kept by the service; ISO with offset. */
  readonly deadline?: { readonly dueAt: string; readonly extendedUntil?: string;
    /** RN-RES-006: the single extension, with who granted it and when (PROPUESTO). */ readonly extension?: { readonly hours: number; readonly actorLabel: string; readonly grantedAt: string } };
  readonly followups?: readonly { readonly note: string; readonly actorLabel: string; readonly contactedAt: string }[];
  /** HU-COM-016 D-02 (PROPUESTO): the refund of this reservation's money as facts; RefundsSource resolves its amount and state (DD-1). */
  readonly refund?: { readonly origin: 'NON_PAYMENT' | 'LOWER_VALUE' | 'CUSTOMER_CANCELLATION' | 'NOT_ATTRIBUTABLE' | 'RESCHEDULING'; readonly reason: string;
    readonly amountCents: number; readonly recognizedAt: string; readonly decision?: RefundAct; readonly authorization?: RefundAct & { readonly reason: string };
    readonly execution?: RefundAct & { readonly method: string; readonly cashMovement: string };
    /** v1.9 (PROPUESTO): the administrative note, the justified rejection, and the 100 % kept as a credit balance (decision or execution without outflow). */
    readonly note?: string; readonly rejection?: RefundAct & { readonly reason: string }; readonly creditBalance?: RefundAct & { readonly reason?: string } };
  /** HU-COM-004 amendment 2026-10-14 (PROPUESTO, G-B): the one additional discount, with the value before it and the amount taken off; resolved by the service. */
  readonly additionalDiscount?: { readonly basisPoints: number; readonly reason: string; readonly appliedBy: string; readonly appliedAt: string;
    readonly previousValueCents: number; readonly amountCents: number };
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
  /** What the payment applied to the balance (cash is validated when registered); the excess over the balance is not applied. */ readonly appliedCents?: number;
  readonly presentedAt?: string; readonly review?: { readonly decision: 'APROBADO' | 'RECHAZADO'; readonly verifiedAmountCents: number | null; readonly reason: string;
    readonly actorLabel: string; readonly decidedAt: string;
    /** RN-RES-006A: what the approval did with the verified amount (applied, excess as credit, value of a cancelled reservation left untreated). */
    readonly appliedCents?: number; readonly surplusCents?: number; readonly pendingTreatmentCents?: number };
};
export type ReservationStatus = 'PENDIENTE_DE_PAGO' | 'CONFIRMADA' | 'EN_EJECUCION' | 'FINALIZADA' | 'CANCELADA';
/** RN-RES-010: one tour (a catalog service) per reservation. */
export type ReservationDraft = { departureId: string; serviceId: string; people: string; paymentType: string; paymentMethod: string; accepted: boolean };
export type ReservationMessages = Partial<Record<keyof ReservationDraft, string>>;

export {
  DEPARTURE_STATE_LABEL, FINANCIAL_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, RESERVATION_TEXT, STATUS_LABEL, persons, seats, travelers,
} from '../reservations-copy';
/** The badge class of each state the service returns. */
export const STATUS_CLASS: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'crp-is-pending', CONFIRMADA: 'crp-is-confirmed',
  EN_EJECUCION: 'crp-is-execution', FINALIZADA: 'crp-is-finalized', CANCELADA: 'crp-is-cancelled' };
/** The reservation_status codes the customer area reads (PROPUESTO until the contract, G-B). */
export const STATUS_CODE: Record<Reservation['status'], string> = { PENDIENTE_DE_PAGO: 'PENDING_PAYMENT', CONFIRMADA: 'CONFIRMED',
  EN_EJECUCION: 'IN_EXECUTION', FINALIZADA: 'FINALIZED', CANCELADA: 'CANCELLED' };
/** Mockup 10, 10A, 10C: the latest proof beside the financial situation ("Sin comprobante · Sin pago"). */
export const paymentState = (r: Reservation) => `${PROOF_LABEL[r.payments?.at(-1)?.proofStatus ?? 'SIN_COMPROBANTE']} · ${FINANCIAL_LABEL[r.financialStatus]}`;
/** "Pago total · Transferencia", or "Sin definir" while the reservation carries neither. */
export const paymentLine = (r: Reservation) => [r.paymentType, r.paymentMethod].some(Boolean)
  ? [PAYMENT_TYPE_LABEL[r.paymentType ?? ''], PAYMENT_METHOD_LABEL[r.paymentMethod ?? '']].filter(Boolean).join(' · ') : RESERVATION_LINE_TEXT.undefinedPayment;
export const executionOf = (r: Reservation) => r.status === 'CANCELADA' ? RESERVATION_LINE_TEXT.notExecuted : r.status === 'EN_EJECUCION' || r.status === 'FINALIZADA' ? STATUS_LABEL[r.status] : RESERVATION_LINE_TEXT.pendingExecution;
export const money = formatCop;

/** RN-RES-010, RN-SAL-001: only a Programada departure that is open for reservations is offered. */
export const openDepartures = (all: readonly Departure[]) => all.filter((d) => d.state === 'PROGRAMADA' && d.openForReservations);

/** A whole number of people of at least one, or null. */
export function peopleOf(text: string): number | null {
  const typed = text.trim(), people = Number(typed);
  return /^\d+$/.test(typed) && Number.isSafeInteger(people) && people >= 1 ? people : null;
}

/** The seat rule (RN-RES-007) is the port's: `capacity` answers whether the departure holds the people and with what text it refuses. */
export function validateReservation(draft: ReservationDraft, departure: Departure | undefined, capacity: DepartureCapacity): ReservationMessages {
  const errors: ReservationMessages = {}, people = peopleOf(draft.people);
  if (!departure) errors.departureId = INVALID.departureId;
  if (!draft.serviceId) errors.serviceId = INVALID.serviceId;
  if (!draft.paymentType) errors.paymentType = INVALID.paymentType;
  if (!draft.paymentMethod) errors.paymentMethod = INVALID.paymentMethod;
  if (!draft.accepted) errors.accepted = INVALID.accepted;
  if (people === null) errors.people = INVALID.people;
  else if (departure && !capacity.fits(departure, people)) errors.people = capacity.refusal(departure);
  return errors;
}

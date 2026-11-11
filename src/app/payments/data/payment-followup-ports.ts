import { Observable } from 'rxjs';
import { Reservation } from '../../reservations/data/reservations-source';

/** HU-COM-011 plan D-02: a follow-up as payment_followups keeps it (G-B); the note is DP-PP3, the actor a label (G-USR). */
export type PaymentFollowup = NonNullable<Reservation['followups']>[number];
/** Plan D-04: the effective deadline already resolved (RN-RES-006, RN-EJE-001) and the departure start; ISO with offset. */
export type PaymentDeadline = { readonly dueAt: string; readonly departureStartsAt: string;
  /** RN-RES-006, AC-PP.12: the service froze the deadline (the departure was cancelled or interrupted for a cause not attributable to the customer); present only when true. */
  readonly frozen?: boolean;
  /** RN-RES-006: the single extension the service recorded, with the person and the instant; absent while none was granted. */
  readonly extension?: { readonly hours: number; readonly actorLabel: string; readonly grantedAt: string } };
/** The history of a reservation as the service keeps it (payment_followups), newest first; a source that keeps it on the reservation needs no such port. */
export abstract class PaymentFollowupsHistory { abstract of(reservationId: string): Observable<PaymentFollowup[]>; }
export type RegisterFollowupCommand = { readonly reservationId: string; readonly note: string };

/** Plan D-03: the reservations pending payment with nothing that counts as payment (RN-PP3), already filtered. */
export abstract class PendingPaymentsSource { abstract list(): Observable<readonly Reservation[]>; }
/** Plan D-04: the view never computes a deadline; null when the reservation is unknown. */
export abstract class PaymentDeadlineReader { abstract deadlineOf(reservationId: string): Observable<PaymentDeadline | null>; }
/** RN-PP4: a follow-up never moves the deadline; the reservation comes back with its history, or { status: 403 | 409, userMessage }. */
export abstract class PaymentFollowupsWriter { abstract register(command: RegisterFollowupCommand, idempotencyKey: string): Observable<Reservation>; }
/** RN-RES-006, E15: the single extension of the deadline, in hours up to the tenant parameter; the service answers the reservation with its deadline, or { status: 403 | 409, userMessage }. */
export type ExtendDeadlineCommand = { readonly reservationId: string; readonly hours: number };
export abstract class PaymentDeadlineExtender { abstract extend(command: ExtendDeadlineCommand, idempotencyKey: string): Observable<Reservation>; }

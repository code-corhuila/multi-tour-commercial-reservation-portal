import { Observable } from 'rxjs';
import { Reservation } from '../../reservations/data/reservations-source';

/** HU-COM-011 plan D-02: a follow-up as payment_followups keeps it (G-B); the note is DP-PP3, the actor a label (G-USR). */
export type PaymentFollowup = NonNullable<Reservation['followups']>[number];
/** Plan D-04: the effective deadline already resolved (RN-RES-006, RN-EJE-001) and the departure start; ISO with offset. */
export type PaymentDeadline = { readonly dueAt: string; readonly departureStartsAt: string };
export type RegisterFollowupCommand = { readonly reservationId: string; readonly note: string };

/** Plan D-03: the reservations pending payment with nothing that counts as payment (RN-PP3), already filtered. */
export abstract class PendingPaymentsSource { abstract list(): Observable<readonly Reservation[]>; }
/** Plan D-04: the view never computes a deadline; null when the reservation is unknown. */
export abstract class PaymentDeadlineReader { abstract deadlineOf(reservationId: string): Observable<PaymentDeadline | null>; }
/** RN-PP4: a follow-up never moves the deadline; the reservation comes back with its history, or { status: 403 | 409, userMessage }. */
export abstract class PaymentFollowupsWriter { abstract register(command: RegisterFollowupCommand, idempotencyKey: string): Observable<Reservation>; }

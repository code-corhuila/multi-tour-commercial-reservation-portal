import { Observable, catchError, map, switchMap, throwError } from 'rxjs';
import { ExtendDeadlineCommand, PaymentDeadlineExtender, PaymentFollowup, PaymentFollowupsHistory, PaymentFollowupsWriter, PendingPaymentsSource, RegisterFollowupCommand } from '../payments/data/payment-followup-ports';
import { PAYMENT_FOLLOWUP_TEXT as T } from '../payments/payment-followup-copy';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll, reservationsPath } from './api-paths';

/** PendingPaymentRow of the contract (PROPOSED): only what the portal needs to join the row with the reservation it already reads. */
interface PendingRowDto { readonly reservationId: string; readonly hasProofInValidation: boolean }
/** PaymentFollowup of the contract (PROPOSED): the person is the user id of the token (G-USR), never a name. */
interface FollowupDto { readonly note: string; readonly contactedBy: string; readonly contactedAt: string }

const followupsPath = (reservationId: string): string => `${reservationsPath(reservationId)}/payment-followups`;
const refuse = (error: ApiError, text: string): Observable<never> => throwError(() => ({ ...error, userMessage: text }));
const reservationOf = (reservations: ReservationsSource, id: string): Observable<Reservation> =>
  reservations.list().pipe(map((all) => all.find((r) => r.id === id)!));

/**
 * The reservations pending payment over GET /pending-payments (initial payment only, DP-PP5). A row with a proof in validation is left to
 * HU-COM-010 (RN-PP3); the deadline and the balance are the service's, so the portal joins each row with the reservation it reads and adds nothing up.
 */
export class PendingPaymentsApiSource extends PendingPaymentsSource {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }
  override list(): Observable<readonly Reservation[]> {
    return listAll<PendingRowDto>(this.client, `${API_BASE}/pending-payments`, { kind: 'INITIAL_PAYMENT' }).pipe(
      switchMap((rows) => this.reservations.list().pipe(map((all) => {
        const waiting = new Set(rows.filter((r) => !r.hasProofInValidation).map((r) => r.reservationId));
        return all.filter((r) => waiting.has(r.id));
      }))),
    );
  }
}

/** GET /reservations/{id}/payment-followups: the newest first, as the screen draws them. */
export class PaymentFollowupsApiHistory extends PaymentFollowupsHistory {
  constructor(private readonly client: PortalApiClient) { super(); }
  override of(reservationId: string): Observable<PaymentFollowup[]> {
    return listAll<FollowupDto>(this.client, followupsPath(reservationId)).pipe(
      map((all) => all.map((f): PaymentFollowup => ({ note: f.note, actorLabel: f.contactedBy, contactedAt: f.contactedAt }))));
  }
}

/** RN-PP4: only the note travels; the date, the person and the deadline are the service's (AC-11.5). The reservation comes back with its history. */
export class PaymentFollowupsApiWriter extends PaymentFollowupsWriter {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource, private readonly history: PaymentFollowupsHistory) { super(); }
  override register(command: RegisterFollowupCommand, idempotencyKey: string): Observable<Reservation> {
    const text: Record<number, string> = { 403: T.refusals.followupForbidden, 404: T.notFound, 422: T.settled };
    return call<unknown>(this.client, followupsPath(command.reservationId), { method: 'POST', body: { note: command.note }, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      catchError((error: ApiError) => refuse(error, text[error.status] ?? T.noteRequired)),
      switchMap(() => this.history.of(command.reservationId)),
      switchMap((followups) => reservationOf(this.reservations, command.reservationId).pipe(map((r) => ({ ...r, followups })))),
    );
  }
}

/** RN-RES-006, E15: only the hours travel; the maximum, the expiry and the departure start are judged by the service. */
export class PaymentDeadlineApiExtender extends PaymentDeadlineExtender {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }
  override extend(command: ExtendDeadlineCommand, idempotencyKey: string): Observable<Reservation> {
    return call<unknown>(this.client, `${reservationsPath(command.reservationId)}/payment-deadline/extension`, { method: 'POST', body: { hours: command.hours }, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      catchError((error: ApiError) => refuse(error, this.text(error))),
      switchMap(() => reservationOf(this.reservations, command.reservationId)),
    );
  }
  private text(error: ApiError): string {
    if (error.status === 403) return T.refusals.extensionForbidden;
    if (error.status === 400) return T.refusals.hoursRequired;
    if (error.status === 404) return T.notFound;
    return T.refusals.byMessage[error.message] ?? error.userMessage;
  }
}

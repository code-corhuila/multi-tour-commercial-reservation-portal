import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { ApiError, PortalApiClient } from '../shell-contract';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import {
  Admission, ModificationLines, ModificationOutcome, ModificationQuote, ModificationTrace, ModifyCommand, Recalculation, ReservationModificationWriter, TravellersChange,
} from '../reservation-changes/travellers-modification/data/modification-ports';
import { call, notInContract, reservationsPath } from './api-paths';

/** ModificationQuote of the contract (PROPOSED, HU-COM-012): the service recomputes with the terms fixed at creation; a refused quote answers the values as they are. */
interface QuoteDto {
  readonly allowed: boolean; readonly refusalReason?: 'NO_POLICY' | 'NOT_ALLOWED' | 'TOO_LATE' | 'NO_AVAILABILITY';
  readonly originalFinalValueCents: number; readonly newFinalValueCents: number; readonly differenceCents: number; readonly newPendingBalanceCents: number;
  readonly excessCents: number; readonly seatsAvailable: boolean;
}
/** ReservationModificationRecord of the contract (PROPOSED): the record of one applied change, never edited. */
interface RecordDto {
  readonly originalFinalValueCents: number; readonly newFinalValueCents: number; readonly resultingPendingBalanceCents: number; readonly excessCents: number;
  readonly excessDecisionOpened: boolean; readonly reason: string; readonly modifiedBy: string; readonly modifiedAt: string;
}

const quotePath = (code: string) => `${reservationsPath(code)}/modification-quote`;
const writePath = (code: string) => `${reservationsPath(code)}/modifications`;
/** The change the portal offers is the number of travellers; the service keeps the tour and the departure (a date change is another type of change). */
const bodyOf = (people: number) => ({ changeType: 'MODIFICATION', people });
const peopleAfter = (reservation: Reservation, change: TravellersChange) => reservation.people + change.added - change.removed;
const find = (reservations: ReservationsSource, code: string) => reservations.list().pipe(map((all) => all.find((r) => r.id === code) ?? null));
const beforeExecution = (reservation: Reservation) => reservation.status === 'PENDIENTE_DE_PAGO' || reservation.status === 'CONFIRMADA';

/**
 * The quote over POST /reservations/{id}/modification-quote (PROPOSED). The terms (no policy, not allowed, too late) are the service's: the portal reads
 * them as one answer, "not allowed". A status past execution is answered as such without asking. A reservation the service does not know is null.
 */
export class ModificationApiQuote extends ModificationQuote {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }

  override admits(code: string): Observable<Admission | null> {
    return find(this.reservations, code).pipe(switchMap((reservation) => {
      if (!reservation) return of(null);
      if (!beforeExecution(reservation)) return of<Admission>({ kind: 'refused', reason: 'not-before-execution' });
      return this.ask(code, reservation.people).pipe(map((dto): Admission | null => (dto === null ? null
        : dto.allowed || dto.refusalReason === 'NO_AVAILABILITY' ? { kind: 'allowed' } : { kind: 'refused', reason: 'not-allowed' })));
    }));
  }

  override lines(code: string, change: TravellersChange): Observable<ModificationLines | null> {
    return find(this.reservations, code).pipe(switchMap((reservation) => (reservation ? this.ask(code, peopleAfter(reservation, change)) : of(null))), map((dto) => (dto === null ? null : {
      allowed: dto.allowed, projectedCents: null, discountCents: null, finalCents: dto.newFinalValueCents, balanceCents: dto.newPendingBalanceCents,
      differenceCents: dto.differenceCents, excessCents: dto.excessCents, seatsAvailable: dto.seatsAvailable,
    })));
  }

  /** The service answers the totals only: no projected value or discount lines, so the preview of the demo has no equivalent here. */
  override preview(): Observable<Recalculation | null> { return notInContract('El servicio responde los totales de la modificación, no las líneas de la cotización.'); }

  private ask(code: string, people: number): Observable<QuoteDto | null> {
    return call<QuoteDto>(this.client, quotePath(code), { method: 'POST', body: bodyOf(people) }).pipe(
      catchError((error: ApiError) => (error.status === 404 ? of(null) : throwError(() => error))));
  }
}

/** A 422 of the write is a refusal that changed nothing: the state, the capacity or the terms of the tour; any other failure goes to the page. */
function refusalOf(error: ApiError): Extract<ModificationOutcome, { kind: 'refused' }> | null {
  if (error.status !== 422) return null;
  if (error.code === 'INVALID_STATUS_TRANSITION') return { kind: 'refused', reason: 'not-before-execution' };
  if (error.code !== 'BUSINESS_RULE_VIOLATION') return null;
  return { kind: 'refused', reason: /no seats/i.test(error.message) ? 'no-capacity' : 'not-allowed' };
}

/**
 * The modification over POST /reservations/{id}/modifications with the Idempotency-Key of the intention. The body is the new number of travellers
 * and the cause; the user and the instant are the service's. The reservation answered is read again, as the service holds it after the change.
 */
export class ModificationApiWriter extends ReservationModificationWriter {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }

  override modify({ code, change, cause, idempotencyKey }: ModifyCommand): Observable<ModificationOutcome> {
    return find(this.reservations, code).pipe(switchMap((before) => {
      const people = before ? peopleAfter(before, change) : 0;
      if (!before || people < 1) return throwError(() => new Error('Unknown reservation or no traveller left'));
      return call<RecordDto>(this.client, writePath(code), { method: 'POST', body: { ...bodyOf(people), reason: cause }, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
        switchMap((record) => find(this.reservations, code).pipe(map((reservation): ModificationOutcome => ({ kind: 'modified', reservation: reservation!, trace: this.trace(code, record) })))),
        catchError((error: ApiError) => { const refused = refusalOf(error); return refused ? of(refused) : throwError(() => error); }),
      );
    }));
  }

  /** G-USR: the person of the record is the user id of the token, the only identity the service returns. */
  private trace(code: string, r: RecordDto): ModificationTrace {
    return { reservationCode: code, originalCents: r.originalFinalValueCents, recalculatedCents: r.newFinalValueCents, balanceCents: r.resultingPendingBalanceCents,
      differenceCents: r.newFinalValueCents - r.originalFinalValueCents, cause: r.reason, by: r.modifiedBy, at: r.modifiedAt,
      decision: r.excessDecisionOpened ? { kind: 'MODIFICATION_EXCESS', excessCents: r.excessCents, outcome: null } : null };
  }
}

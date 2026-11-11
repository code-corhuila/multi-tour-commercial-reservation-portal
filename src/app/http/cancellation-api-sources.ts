import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { ApiError, PortalApiClient } from '../shell-contract';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import {
  CancelCommand, CancellationOutcome, CancellationQuote, CancellationQuoteResult, CancellationWriter, Eligibility, RefundableAmount,
} from '../reservation-changes/data/cancellation-ports';
import { call, notInContract, reservationsPath } from './api-paths';

/** CancellationQuote of the contract (PROPOSED, HU-COM-013): the service computes the validated value, the penalty and the refundable amount. */
interface QuoteDto {
  readonly cancellable: boolean; readonly refusalReason?: 'INVALID_STATUS_TRANSITION' | 'BUSINESS_RULE_VIOLATION';
  readonly validatedValueCents: number; readonly penaltyCents: number; readonly refundableCents: number;
}
/** ReservationCancellation of the contract (PROPOSED): the record of the cancellation, never edited. */
interface RecordDto {
  readonly reason: string; readonly validatedValueCents: number; readonly penaltyCents: number; readonly refundableCents: number; readonly cancelledAt: string;
}

const quotePath = (code: string) => `${reservationsPath(code)}/cancellation-quote`;
const cancelPath = (code: string) => `${reservationsPath(code)}/cancellation`;

/** The refusal the service gives, in the words of the screens: a status refusal reads the status the reservation has now; the other is the rescheduling mark. */
function eligibilityOf(refusal: QuoteDto['refusalReason'] | string | undefined, reservation: Reservation): Eligibility {
  if (refusal === 'BUSINESS_RULE_VIOLATION') return 'rescheduling-pending';
  return reservation.status === 'EN_EJECUCION' ? 'in-execution' : 'terminal';
}

const refundableOf = (dto: Pick<QuoteDto, 'validatedValueCents' | 'penaltyCents' | 'refundableCents'>): RefundableAmount =>
  dto.validatedValueCents === 0 ? { kind: 'no-payments' } : { kind: 'amount', cents: dto.refundableCents, penaltyCents: dto.penaltyCents };

const find = (reservations: ReservationsSource, code: string) => reservations.list().pipe(map((all) => all.find((r) => r.id === code) ?? null));

/**
 * The quote over GET /reservations/{id}/cancellation-quote (PROPOSED). The portal adds nothing up: the amounts come as the service
 * computed them, and with no penalty policy the service answers a penalty of zero. A reservation the service does not know is null.
 */
export class CancellationApiQuote extends CancellationQuote {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }
  override quote(code: string): Observable<CancellationQuoteResult | null> {
    const dto$ = call<QuoteDto>(this.client, quotePath(code)).pipe(catchError((error: ApiError) => (error.status === 404 ? of(null) : throwError(() => error))));
    return forkJoin([find(this.reservations, code), dto$]).pipe(map(([reservation, dto]) => (reservation && dto ? {
      reservation, eligibility: dto.cancellable ? 'allowed' as const : eligibilityOf(dto.refusalReason, reservation), refundable: refundableOf(dto),
    } : null)));
  }
}

/**
 * The cancellation over POST /reservations/{id}/cancellation with the Idempotency-Key of the intention. The body is the reason and the only
 * origin the route registers; the user and the instant are the service's. A 422 is a refusal that changed nothing; any other failure goes to the page.
 */
export class CancellationApiWriter extends CancellationWriter {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource, private readonly roleLabel: () => string) { super(); }
  override cancel({ code, cause, origin, idempotencyKey }: CancelCommand): Observable<CancellationOutcome> {
    if (origin !== 'customer') return notInContract('Esta ruta solo registra la cancelación solicitada por el cliente.');
    return call<RecordDto>(this.client, cancelPath(code), { method: 'POST', body: { reason: cause, origin: 'CUSTOMER_REQUEST' }, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      switchMap((record) => find(this.reservations, code).pipe(map((reservation) => ({ kind: 'registered' as const, reservation: this.cancelled(reservation!, record) })))),
      catchError((error: ApiError) => (error.status === 422 && (error.code === 'INVALID_STATUS_TRANSITION' || error.code === 'BUSINESS_RULE_VIOLATION')
        ? find(this.reservations, code).pipe(map((reservation) => ({ kind: 'refused' as const, eligibility: eligibilityOf(error.code, reservation!), reservation: reservation! })))
        : throwError(() => error))),
    );
  }
  private cancelled(reservation: Reservation, record: RecordDto): Reservation {
    return {
      ...reservation, status: 'CANCELADA', seatHeld: false, cancellation: { cause: record.reason, by: this.roleLabel(), at: record.cancelledAt, origin: 'customer' },
      ...(record.refundableCents > 0 ? { financialDecision: { kind: 'CUSTOMER_CANCELLATION' as const, baseAmountCents: record.validatedValueCents, penaltyAmountCents: record.penaltyCents,
        refundableCents: record.refundableCents, recognizedAt: record.cancelledAt, outcome: null } } : {}),
    };
  }
}

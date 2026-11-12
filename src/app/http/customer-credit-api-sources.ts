import { Observable, catchError, concat, defer, forkJoin, last, map, of, switchMap, throwError } from 'rxjs';
import { CreditApplyOutcome } from '../credit-balance/data/credit-balance-ports';
import { MyPaymentsSource } from '../my-payments/data/my-payments-source';
import { CustomerCredit, CustomerCreditRequest, CustomerCreditSource, CustomerCreditWriter } from '../credit-balance/data/customer-credit-ports';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll } from './api-paths';

/** The credit of the contract (PROPOSED, HU-COM-017): for the Final Customer the list is their own credit only (AC-17.13), so the portal sends no customer. */
interface CreditDto { readonly creditBalanceId: string; readonly sourceReservationId: string; readonly inRefundCents: number; readonly availableCents: number }
interface RecordDto { readonly financialDecisionId: string; readonly amountCents: number; readonly requestedAt: string; readonly outcome?: string }
interface DetailDto extends CreditDto { readonly refundRequests: readonly RecordDto[] }
interface DecisionDto { readonly financialDecisionId: string; readonly reservationId: string; readonly baseAmountCents: number; readonly recognizedAt: string; readonly outcome?: string }

const creditsPath = `${API_BASE}/credit-balances`;
const stateOf = (outcome?: string): CustomerCreditRequest['state'] => (outcome === 'REJECTED' ? 'RECHAZADA' : outcome ? 'AUTORIZADA' : 'PENDIENTE_DE_AUTORIZACION');

/**
 * The own credit over GET /credit-balances, plus the detail of the credits that have something in refund, where the requests are listed. The Final Customer cannot list the
 * financial decisions, so a request that was rejected and released shows only while its credit has another one in refund (DP, declared).
 */
export class CustomerCreditApiSource extends CustomerCreditSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override mine(): Observable<CustomerCredit> {
    return listAll<CreditDto>(this.client, creditsPath).pipe(switchMap((credits) => {
      const asked = credits.filter((c) => c.inRefundCents > 0);
      return (asked.length ? forkJoin(asked.map((c) => call<DetailDto>(this.client, `${creditsPath}/${c.creditBalanceId}`))) : of([] as DetailDto[])).pipe(map((details): CustomerCredit => {
        const sources = credits.filter((c) => c.availableCents > 0).map((c) => ({ reservationId: c.sourceReservationId, availableCents: c.availableCents }));
        return { totalCents: sources.reduce((total, s) => total + s.availableCents, 0), sources,
          requests: details.flatMap((d) => d.refundRequests.map((q): CustomerCreditRequest => ({ id: q.financialDecisionId, reservationId: d.sourceReservationId, amountCents: q.amountCents, state: stateOf(q.outcome), requestedAt: q.requestedAt }))) };
      }));
    }));
  }
}

/**
 * POST /credit-balances/{id}/refund-requests with the amount only (the reason is the staff's). The route asks one credit at a time, so an origin with several credits goes credit by
 * credit with a key per credit (DP: not one atomic operation); the service refuses (422, 404) and the portal never judges.
 */
export class CustomerCreditApiWriter extends CustomerCreditWriter {
  constructor(private readonly client: PortalApiClient, private readonly payments?: MyPaymentsSource) { super(); }

  /**
   * POST /credit-balances/{id}/applications credit by credit for the least of the own credit and the pending balance (the first payment is the one with nothing validated yet);
   * a refusal of the service (422, 409) is data with its message, the portal never judges. One key per credit (DP: not one atomic operation).
   */
  override apply(targetReservationId: string, idempotencyKey: string): Observable<CreditApplyOutcome> {
    return forkJoin([listAll<CreditDto>(this.client, creditsPath), this.payments!.listMine()]).pipe(switchMap(([credits, mine]) => {
      const target = mine.find((r) => r.reservationId === targetReservationId);
      if (!target) return throwError((): Partial<ApiError> => ({ status: 404, code: 'NOT_FOUND' }));
      let remaining = Math.min(credits.reduce((total, c) => total + c.availableCents, 0), target.balanceCents);
      const wanted = remaining;
      const steps = credits.filter((c) => c.availableCents > 0).flatMap((c, index) => {
        const used = Math.min(c.availableCents, remaining);
        remaining -= used;
        return used > 0 ? [defer(() => call<unknown>(this.client, `${creditsPath}/${c.creditBalanceId}/applications`, { method: 'POST', body: { targetReservationId, amountCents: used },
          headers: { 'Idempotency-Key': `${idempotencyKey}-${index + 1}` } }))] : [];
      });
      return concat(...steps, of(null)).pipe(last(), map((): CreditApplyOutcome => ({ ok: true, appliedCents: wanted, firstPayment: !target.validatedCents })));
    }), catchError((error: ApiError) => (error.status === 422 || error.status === 409 ? of<CreditApplyOutcome>({ ok: false, reason: error.message }) : throwError(() => error))));
  }

  override requestRefund(sourceReservationId: string, amountCents: number, idempotencyKey: string): Observable<CustomerCreditRequest> {
    return listAll<CreditDto>(this.client, creditsPath).pipe(switchMap((credits) => {
      const own = credits.filter((c) => c.sourceReservationId === sourceReservationId && c.availableCents > 0);
      if (!own.length) return throwError((): Partial<ApiError> => ({ status: 404, code: 'NOT_FOUND' }));
      let remaining = amountCents;
      const steps = own.flatMap((c, index) => {
        const used = Math.min(c.availableCents, remaining);
        remaining -= used;
        return used > 0 ? [defer(() => call<DecisionDto>(this.client, `${creditsPath}/${c.creditBalanceId}/refund-requests`, { method: 'POST', body: { amountCents: used },
          headers: { 'Idempotency-Key': own.length > 1 ? `${idempotencyKey}-${index + 1}` : idempotencyKey } }))] : [];
      });
      if (!steps.length || remaining > 0) return throwError((): Partial<ApiError> => ({ status: 422, code: 'BUSINESS_RULE_VIOLATION' }));
      return concat(...steps).pipe(last());
    }), map((d): CustomerCreditRequest => ({ id: d.financialDecisionId, reservationId: sourceReservationId, amountCents: d.baseAmountCents, state: stateOf(d.outcome), requestedAt: d.recognizedAt })));
  }
}

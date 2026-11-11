import { Observable, concatMap, defaultIfEmpty, expand, filter, forkJoin, map, of, switchMap, take, throwError, timer } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ExecuteOutcome, Refund, RefundMethod, RefundState, RefundsSource, RefundsWriter } from '../refunds/data/refunds-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, executeRefundSagaPath, listAll, notInContract } from './api-paths';

/** FinancialDecision of the contract (PROPOSED, HU-COM-016): one 24-hour decision, never edited by the portal. */
interface DecisionDto {
  readonly financialDecisionId: string; readonly reservationId: string; readonly kind: string; readonly baseAmountCents: number; readonly recognizedAt: string;
  readonly decisionDueAt: string; readonly frozen: boolean; readonly outcome?: string; readonly decidedAt?: string; readonly decidedBySystem?: boolean; readonly justification?: string;
}
/** RefundAuthorization of the contract (PROPOSED): one authorized refund and its execution; overdue is the mark, never a state. */
interface RefundDto {
  readonly refundAuthorizationId: string; readonly reservationId: string; readonly financialDecisionId?: string; readonly origin: string; readonly authorizedAmountCents: number;
  readonly reason: string; readonly authorizedAt: string; readonly executionDueAt: string; readonly overdue: boolean; readonly executionState: string;
  readonly outflowMethod?: string; readonly executionStartedAt?: string; readonly cashMovementId?: string; readonly executedAt?: string;
}

const decisionsPath = (id?: string, act?: string): string => [`${API_BASE}/financial-decisions`, id, act].filter(Boolean).join('/');
const refundsPath = `${API_BASE}/refund-authorizations`;
/** The causes in the words of the screens (the wire speaks English, DP-08). */
const REASON: Record<string, string> = {
  CUSTOMER_CANCELLATION: 'Cancelación solicitada por el cliente', PENDING_TREATMENT: 'Tratamiento pendiente de valores abonados', MODIFICATION_EXCESS: 'Excedente por modificación',
  CREDIT_BALANCE_REFUND_REQUEST: 'Solicitud de devolución de saldo a favor', NOT_ATTRIBUTABLE_TO_CUSTOMER: 'Causa no atribuible al cliente', PERSONAL_EMERGENCY_DURING_EXECUTION: 'Emergencia personal durante la ejecución',
};
const METHOD: Record<string, RefundMethod> = { TRANSFER: 'BANK_TRANSFER', CASH: 'CASH' };
const MINUTE = 60_000;
const OUTFLOW: Record<string, string> = { BANK_TRANSFER: 'TRANSFER', CASH: 'CASH' };
/** Saga of the contract of execute-refund (HU-WFL-003): it ends COMPLETED, COMPENSATED (the refund stays authorized) or FAILED (a person decides). */
interface SagaDto { readonly id: string; readonly status: 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'FAILED' }
const SAGA_POLLS = 60;
const SAGA_FAILURE: Record<number, string> = { 400: 'Los datos de la devolución no son válidos.', 403: 'No tienes permiso para ejecutar devoluciones.', 404: 'La ejecución de la devolución no se encontró.' };
const failure = (status: number, code: string, message: string): ApiError => ({ status, code, message, details: [], traceId: '', userMessage: message });
/** The business date the saga asks for: today in the tenant's country (the cash day), never the browser's UTC day. */
const businessDate = (at: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(at);

/** The state a reservation shows: the refund when there is one, else what the decision ended as (derived by the portal, never stored). */
function stateOf(decision: DecisionDto | undefined, refund: RefundDto | undefined): RefundState {
  if (refund) return refund.executionState === 'EXECUTED' ? 'EJECUTADA' : 'AUTORIZADA';
  switch (decision?.outcome) {
    case undefined: return 'PENDIENTE_DE_DECISION';
    case 'REFUND_FULL': return 'PENDIENTE_DE_AUTORIZACION';
    case 'REJECTED': return 'RECHAZADA';
    case 'CREDIT_FULL': return 'SALDO_A_FAVOR';
    default: return 'AUTORIZADA';
  }
}

/**
 * The refunds over GET /financial-decisions and GET /refund-authorizations, one per reservation (the latest decision, with its refund when authorized).
 * The service computes every amount and instant; the portal joins the name of the customer and the minutes left of the 24 hours at the clock it is given.
 * The people who acted are ids in the contract (no directory yet), so the owner stays empty.
 */
export class RefundsApiSource extends RefundsSource {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource, private readonly now: () => number = Date.now) { super(); }

  override list(): Observable<readonly Refund[]> {
    return forkJoin([listAll<DecisionDto>(this.client, decisionsPath()), listAll<RefundDto>(this.client, refundsPath), this.reservations.list()]).pipe(map(([decisions, refunds, reservations]) => {
      const names = new Map(reservations.map((r) => [r.id, r.leadCustomerName]));
      const byReservation = new Map<string, DecisionDto>();
      for (const d of [...decisions].sort((a, b) => a.recognizedAt.localeCompare(b.recognizedAt))) byReservation.set(d.reservationId, d);
      const own = new Map<string, RefundDto>(refunds.filter((r) => r.financialDecisionId).map((r) => [r.financialDecisionId!, r]));
      const rows = [...byReservation.values()].map((d) => this.row(d, own.get(d.financialDecisionId), names));
      const loose = refunds.filter((r) => !r.financialDecisionId && !byReservation.has(r.reservationId)).map((r) => this.row(undefined, r, names));
      return [...rows, ...loose];
    }));
  }

  private row(decision: DecisionDto | undefined, refund: RefundDto | undefined, names: Map<string, string>): Refund {
    const reservationId = (decision ?? refund)!.reservationId, open = !!decision && !decision.outcome && !decision.frozen;
    return {
      id: reservationId, customer: names.get(reservationId) ?? '', reason: REASON[decision?.kind ?? refund!.origin] ?? '', amountCents: refund?.authorizedAmountCents ?? decision!.baseAmountCents,
      state: stateOf(decision, refund), decisionReason: refund?.reason ?? decision?.justification ?? null, owner: null, date: refund?.executedAt ?? refund?.executionStartedAt ?? refund?.authorizedAt ?? decision!.decidedAt ?? decision!.recognizedAt,
      method: refund?.outflowMethod ? METHOD[refund.outflowMethod] ?? null : null, cashMovement: refund?.cashMovementId ?? null,
      remainingMinutes: open ? Math.max(0, Math.floor((Date.parse(decision!.decisionDueAt) - this.now()) / MINUTE)) : null, defaulted: decision?.decidedBySystem === true,
      overdue: refund?.overdue === true, note: null, decisionDueAt: decision && !decision.outcome ? decision.decisionDueAt : null,
      executionDueAt: refund && refund.executionState !== 'EXECUTED' ? refund.executionDueAt : null,
    };
  }
}

/**
 * The decision, the authorization and the rejection over POST /financial-decisions/{id}/... with the Idempotency-Key of the intention. The id of a refund is its
 * reservation, so the writer finds the decision of that reservation that is waiting for the act. A 422 is a refusal that changed nothing and goes to the page.
 * The credit balance (HU-COM-017) is not a route of this service. The execution goes through the saga execute-refund of the gateway (HU-WFL-003); its cash routes are not waited for here.
 */
export class RefundsApiWriter extends RefundsWriter {
  constructor(private readonly client: PortalApiClient, private readonly source: RefundsSource, private readonly now: () => number = Date.now, private readonly pollMs = 1000) { super(); }

  override decideFullRefund(id: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'refund-decision', undefined, idempotencyKey, (d) => !d.outcome); }
  override authorize(id: string, reason: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'refund-authorization', { reason }, idempotencyKey, (d) => d.outcome === 'REFUND_FULL'); }
  override reject(id: string, reason: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'rejection', { justification: reason }, idempotencyKey, (d) => !d.outcome); }
  override keepAsCreditBalance(): Observable<Refund> { return notInContract('El saldo a favor lo registra la historia de saldos a favor (HU-COM-017).'); }
  /**
   * POST /sagas/execute-refund under the Idempotency-Key, then GET until the saga ends. The body is the authorization it executes and the outflow: the tenant and the
   * executor are the token's. Without money out (RF-015B) the value is a credit balance, which is HU-COM-017's route and not this one.
   */
  override executeRefund(reservationId: string, method: RefundMethod | null, idempotencyKey: string): Observable<ExecuteOutcome> {
    if (!method) return notInContract('El saldo a favor lo registra la historia de saldos a favor (HU-COM-017).');
    return listAll<RefundDto>(this.client, refundsPath).pipe(
      map((all) => all.find((r) => r.reservationId === reservationId && r.executionState !== 'EXECUTED')),
      switchMap((authorization) => (authorization ? of(authorization) : throwError(() => failure(404, 'NOT_FOUND', 'La devolución no tiene una autorización por ejecutar.')))),
      concatMap((a) => this.start(a, method, idempotencyKey)),
      switchMap((saga) => this.follow(saga)),
      switchMap((saga) => this.source.list().pipe(map((all): ExecuteOutcome => ({ kind: saga.status === 'COMPLETED' ? 'executed' : 'cash-failed', refund: all.find((r) => r.id === reservationId)! })))),
    );
  }

  private start(a: RefundDto, method: RefundMethod, key: string): Observable<SagaDto> {
    const body = { refundAuthorizationId: a.refundAuthorizationId, reservationId: a.reservationId, outflowMedium: OUTFLOW[method], amountCents: a.authorizedAmountCents,
      businessDate: businessDate(this.now()), reason: a.reason.slice(0, 200) };
    return this.saga(call<SagaDto>(this.client, executeRefundSagaPath(), { method: 'POST', body, headers: { 'Idempotency-Key': key } }));
  }

  /** Asks the saga again, one pause apart, until it ends; a FAILED one is for a person to decide, so it is an error and no outcome. */
  private follow(first: SagaDto): Observable<SagaDto> {
    let asked = 0;
    return of(first).pipe(
      expand((s) => (s.status === 'RUNNING' && ++asked < SAGA_POLLS ? timer(this.pollMs).pipe(concatMap(() => this.saga(call<SagaDto>(this.client, executeRefundSagaPath(s.id))))) : of())),
      filter((s) => s.status !== 'RUNNING'), take(1),
      switchMap((s) => (s.status === 'FAILED' ? throwError(() => failure(0, 'SAGA_FAILED', 'La ejecución no terminó: un responsable debe revisarla.')) : of(s))),
      defaultIfEmpty(undefined as never),
      switchMap((s) => (s ? of(s) : throwError(() => failure(0, 'SAGA_TIMEOUT', 'La ejecución sigue en curso: consulta de nuevo en unos minutos.')))),
    );
  }

  /** The refusal of the saga in the words of the screens; any other failure keeps what the container said. */
  private saga<T>(request: Observable<T>): Observable<T> {
    return request.pipe(catchError((e: ApiError) => throwError(() => (SAGA_FAILURE[e.status] ? { ...e, userMessage: SAGA_FAILURE[e.status] } : e))));
  }

  private act(reservationId: string, route: string, body: object | undefined, key: string, waiting: (d: DecisionDto) => boolean): Observable<Refund> {
    return listAll<DecisionDto>(this.client, decisionsPath(), { pending: 'true' }).pipe(
      map((all) => all.filter((d) => d.reservationId === reservationId && waiting(d)).sort((a, b) => b.recognizedAt.localeCompare(a.recognizedAt))[0]),
      switchMap((decision) => (decision ? of(decision) : throwError(() => ({ status: 404, code: 'NOT_FOUND', message: 'La devolución no tiene una decisión que esperar.', details: [], traceId: '', userMessage: 'La devolución no tiene una decisión que esperar.' })))),
      switchMap((decision) => call<unknown>(this.client, decisionsPath(decision.financialDecisionId, route), { method: 'POST', ...(body ? { body } : {}), headers: { 'Idempotency-Key': key } })),
      switchMap(() => this.source.list()), map((all) => all.find((r) => r.id === reservationId)!),
    );
  }
}

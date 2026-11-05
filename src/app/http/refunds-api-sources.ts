import { Observable, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { ExecuteOutcome, Refund, RefundMethod, RefundState, RefundsSource, RefundsWriter } from '../refunds/data/refunds-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll, notInContract } from './api-paths';

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
 * The credit balance (HU-COM-017) and the execution through the saga (HU-WFL-003, HU-CSH-001) are not routes of this service.
 */
export class RefundsApiWriter extends RefundsWriter {
  constructor(private readonly client: PortalApiClient, private readonly source: RefundsSource) { super(); }

  override decideFullRefund(id: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'refund-decision', undefined, idempotencyKey, (d) => !d.outcome); }
  override authorize(id: string, reason: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'refund-authorization', { reason }, idempotencyKey, (d) => d.outcome === 'REFUND_FULL'); }
  override reject(id: string, reason: string, idempotencyKey: string): Observable<Refund> { return this.act(id, 'rejection', { justification: reason }, idempotencyKey, (d) => !d.outcome); }
  override keepAsCreditBalance(): Observable<Refund> { return notInContract('El saldo a favor lo registra la historia de saldos a favor (HU-COM-017).'); }
  override executeRefund(): Observable<ExecuteOutcome> { return notInContract('La ejecución la orquesta el flujo de devoluciones (HU-WFL-003) con Caja; este portal no la ejecuta.'); }

  private act(reservationId: string, route: string, body: object | undefined, key: string, waiting: (d: DecisionDto) => boolean): Observable<Refund> {
    return listAll<DecisionDto>(this.client, decisionsPath(), { pending: 'true' }).pipe(
      map((all) => all.filter((d) => d.reservationId === reservationId && waiting(d)).sort((a, b) => b.recognizedAt.localeCompare(a.recognizedAt))[0]),
      switchMap((decision) => (decision ? of(decision) : throwError(() => ({ status: 404, code: 'NOT_FOUND', message: 'La devolución no tiene una decisión que esperar.', details: [], traceId: '', userMessage: 'La devolución no tiene una decisión que esperar.' })))),
      switchMap((decision) => call<unknown>(this.client, decisionsPath(decision.financialDecisionId, route), { method: 'POST', ...(body ? { body } : {}), headers: { 'Idempotency-Key': key } })),
      switchMap(() => this.source.list()), map((all) => all.find((r) => r.id === reservationId)!),
    );
  }
}

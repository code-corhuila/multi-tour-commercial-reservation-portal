import { Observable, catchError, concat, defer, forkJoin, last, map, of, switchMap, throwError } from 'rxjs';
import { CREDIT_BALANCE_COPY as T } from '../credit-balance/credit-balance-copy';
import {
  CreditApplyOutcome, CreditRefundRequester, CreditRequestOutcome, CreditBalance, CreditBalanceSource, CreditBalanceTreatment, CreditBalanceWriter, CreditCustomer, CreditMovement, CreditOverview, CreditRequest, ExcessSplit,
} from '../credit-balance/data/credit-balance-ports';
import { formatCop as money } from '../shared/format';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll } from './api-paths';

/** CreditBalance, its history and the decisions of the contract (PROPOSED, HU-COM-017): every value is the service's. */
interface CreditDto {
  readonly creditBalanceId: string; readonly sourceReservationId: string; readonly customerId: string; readonly origin: string; readonly recordedCents: number;
  readonly appliedCents: number; readonly inRefundCents: number; readonly availableCents: number; readonly recordedAt: string; readonly recordedBy?: string;
}
interface DetailDto extends CreditDto {
  readonly applications: readonly { readonly targetReservationId: string; readonly amountCents: number; readonly appliedBy: string; readonly appliedAt: string }[];
  readonly refundRequests: readonly { readonly financialDecisionId: string; readonly amountCents: number; readonly requestedBy?: string; readonly requestedAt: string }[];
}
interface DecisionDto {
  readonly financialDecisionId: string; readonly reservationId: string; readonly kind: string; readonly baseAmountCents: number; readonly recognizedAt: string;
  readonly decisionDueAt: string; readonly frozen: boolean; readonly outcome?: string; readonly decidedAt?: string;
}
interface SummaryDto { readonly availableCents: number; readonly customersWithCredit: number; readonly requestsToDecide: number }

const creditsPath = `${API_BASE}/credit-balances`, decisionsPath = `${API_BASE}/financial-decisions`;
const REQUEST = 'CREDIT_BALANCE_REFUND_REQUEST';
/** DP-CB8: the Reservation of the portal carries no customer id, so a customer is told by name, as the demo does. */
const normalize = (name: string) => name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** The mockup: these states admit no new payment. */
const CLOSED: ReadonlySet<Reservation['status']> = new Set(['CANCELADA', 'FINALIZADA', 'EN_EJECUCION']);

/**
 * The credit book over GET /credit-balances, /credit-balance-summary and /financial-decisions, plus the detail of the credits that have a history. The service computes
 * recorded, applied, in refund and available; the portal only groups them by customer. The people who acted are ids in the contract (no directory yet), so the actor stays empty.
 */
export class CreditBalanceApiSource extends CreditBalanceSource {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }

  override treatmentOf(reservationId: string): Observable<CreditBalanceTreatment | null> {
    return forkJoin([listAll<DecisionDto>(this.client, decisionsPath), listAll<CreditDto>(this.client, creditsPath)]).pipe(map(([decisions, credits]) => {
      const decision = [...decisions].filter((d) => d.reservationId === reservationId && d.kind !== REQUEST).sort((a, b) => a.recognizedAt.localeCompare(b.recognizedAt)).pop();
      const recorded = credits.find((c) => c.sourceReservationId === reservationId && c.origin !== 'PAYMENT_EXCESS');
      if (!decision && !recorded) return null;
      return { reservationId, amountCents: decision?.baseAmountCents ?? recorded!.recordedCents, open: !!decision && !decision.outcome && !recorded, recorded: recorded ? lineOf(recorded) : null };
    }));
  }

  override list(): Observable<CreditOverview> {
    return forkJoin([listAll<CreditDto>(this.client, creditsPath), call<SummaryDto>(this.client, `${API_BASE}/credit-balance-summary`),
      listAll<DecisionDto>(this.client, decisionsPath), this.reservations.list()]).pipe(
      switchMap(([credits, summary, decisions, reservations]) => {
        const withHistory = credits.filter((c) => c.appliedCents > 0 || c.inRefundCents > 0);
        const details$ = withHistory.length ? forkJoin(withHistory.map((c) => call<DetailDto>(this.client, `${creditsPath}/${c.creditBalanceId}`))) : of([] as DetailDto[]);
        return details$.pipe(map((details) => overviewOf(credits, summary, decisions.filter((d) => d.kind === REQUEST), reservations, details)));
      }));
  }
}

const lineOf = (c: CreditDto): CreditBalance => ({ id: c.creditBalanceId, reservationId: c.sourceReservationId, tenant: '', amountCents: c.recordedCents,
  origin: c.origin === 'PAYMENT_EXCESS' ? 'EXCEDENTE' : 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: c.recordedBy ?? '', recordedAt: c.recordedAt, appliedTo: null });

function overviewOf(credits: readonly CreditDto[], summary: SummaryDto, requests: readonly DecisionDto[], reservations: readonly Reservation[], details: readonly DetailDto[]): CreditOverview {
  const nameOf = (id: string) => reservations.find((r) => r.id === id)?.leadCustomerName ?? T.unknownCustomer;
  const grouped = new Map<string, { name: string; sources: CreditCustomer['sources'][number][]; history: CreditMovement[] }>();
  for (const c of credits) {
    const key = normalize(nameOf(c.sourceReservationId)), history = details.find((d) => d.creditBalanceId === c.creditBalanceId);
    const customer = grouped.get(key) ?? { name: nameOf(c.sourceReservationId), sources: [], history: [] };
    customer.sources.push({ reservationId: c.sourceReservationId, balanceCents: c.recordedCents - c.appliedCents, requestedCents: c.inRefundCents, availableCents: c.availableCents });
    customer.history.push({ at: c.recordedAt, kind: 'ORIGEN', detail: T.origin[lineOf(c).origin], reservationId: c.sourceReservationId, amountCents: c.recordedCents, actor: c.recordedBy ?? '' },
      ...(history?.applications ?? []).map((a): CreditMovement => ({ at: a.appliedAt, kind: 'APLICACION', detail: T.appliedTo(a.targetReservationId), reservationId: c.sourceReservationId, amountCents: -a.amountCents, actor: '' })),
      ...(history?.refundRequests ?? []).map((q): CreditMovement => ({ at: q.requestedAt, kind: 'DEVOLUCION', detail: 'Solicitud de devolución', reservationId: c.sourceReservationId, amountCents: -q.amountCents, actor: '' })));
    grouped.set(key, customer);
  }
  const customers = [...grouped].map(([key, c]): CreditCustomer => {
    const availableCents = c.sources.reduce((total, s) => total + s.availableCents, 0);
    const targets = reservations.filter((r) => normalize(r.leadCustomerName) === key && !CLOSED.has(r.status) && r.balanceCents > 0).map((r) => ({ reservationId: r.id, balanceCents: r.balanceCents }));
    return { key, name: c.name, availableCents, sources: c.sources, targets, suggestedCents: Math.min(availableCents, targets[0]?.balanceCents ?? 0), history: [...c.history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) };
  }).sort((a, b) => b.availableCents - a.availableCents);
  const asked = (d: DecisionDto): CreditRequest => ({ id: d.financialDecisionId, reservationId: d.reservationId, customer: nameOf(d.reservationId), amountCents: d.baseAmountCents,
    state: d.outcome === 'REJECTED' ? 'RECHAZADA' : 'PENDIENTE_DE_AUTORIZACION', reason: 'Solicitud de devolución de saldo a favor', requestedBy: '', requestedAt: d.recognizedAt, decisionDueAt: d.decisionDueAt, tenant: '' });
  return { availableCents: summary.availableCents, customersWithBalance: summary.customersWithCredit, pendingDecisions: summary.requestsToDecide, customers, requests: requests.filter((d) => !d.outcome || d.outcome === 'REJECTED').map(asked) };
}

/**
 * Records the credit of the open decision (POST /financial-decisions/{id}/credit-decision) and applies a credit (POST /credit-balances/{id}/applications). The excess of an
 * approved proof is recorded by the service in the same transaction of the approval, so the portal records none (DP). The route applies one credit at a time, so a
 * payment above one credit goes credit by credit with a key per credit (DP: not one atomic operation); the service refuses, the portal never judges.
 */
export class CreditBalanceApiWriter extends CreditBalanceWriter {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource) { super(); }

  override recordFromTreatment(reservationId: string, idempotencyKey: string): Observable<CreditBalance> {
    return listAll<DecisionDto>(this.client, decisionsPath).pipe(
      map((all) => all.find((d) => d.reservationId === reservationId && d.kind !== REQUEST && !d.outcome)),
      switchMap((decision) => (decision
        ? call<CreditDto>(this.client, `${decisionsPath}/${decision.financialDecisionId}/credit-decision`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } })
        : throwError((): Partial<ApiError> => ({ status: 409, code: 'INVALID_STATUS_TRANSITION' })))),
      map(lineOf));
  }

  override recordExcess(reservation: Reservation, approvedCents: number, _idempotencyKey: string): Observable<ExcessSplit> {
    const appliedCents = Math.min(approvedCents, reservation.balanceCents);
    return of({ appliedCents, pendingCents: reservation.balanceCents - appliedCents, excess: null });
  }

  override apply(targetReservationId: string, amountCents: number, idempotencyKey: string): Observable<CreditApplyOutcome> {
    return forkJoin([listAll<CreditDto>(this.client, creditsPath), this.reservations.list()]).pipe(switchMap(([credits, reservations]) => {
      const target = reservations.find((r) => r.id === targetReservationId), key = normalize(target?.leadCustomerName ?? '');
      let remaining = amountCents;
      const steps = credits.filter((c) => normalize(reservations.find((r) => r.id === c.sourceReservationId)?.leadCustomerName ?? '') === key && c.availableCents > 0)
        .flatMap((c, index) => {
          const used = Math.min(c.availableCents, remaining);
          remaining -= used;
          return used > 0 ? [defer(() => call<unknown>(this.client, `${creditsPath}/${c.creditBalanceId}/applications`, { method: 'POST', body: { targetReservationId, amountCents: used },
            headers: { 'Idempotency-Key': `${idempotencyKey}-${index + 1}` } }))] : [];
        });
      if (remaining > 0) return of<CreditApplyOutcome>({ ok: false, reason: T.refusal.aboveAvailable(money(amountCents - remaining)) });
      return concat(...steps, of(null)).pipe(last(), map((): CreditApplyOutcome => ({ ok: true, appliedCents: amountCents, firstPayment: !target?.seatHeld })));
    }), catchError((error: ApiError) => (error.status === 422 || error.status === 409 ? of<CreditApplyOutcome>({ ok: false, reason: error.message }) : throwError(() => error))));
  }
}

/**
 * POST /credit-balances/{id}/refund-requests with the amount and the motive of the staff (the reason is required when staff asks, and the service never logs it). The credit is the
 * one of the origin reservation; the service refuses an amount of zero or above the available (422) or a missing motive (400) and the portal shows its message.
 */
export class CreditRefundApiRequester extends CreditRefundRequester {
  constructor(private readonly client: PortalApiClient) { super(); }

  override request(sourceReservationId: string, amountCents: number, reason: string, idempotencyKey: string): Observable<CreditRequestOutcome> {
    return listAll<CreditDto>(this.client, creditsPath).pipe(
      map((credits) => credits.find((c) => c.sourceReservationId === sourceReservationId)),
      switchMap((credit) => (credit ? call<{ decisionDueAt?: string }>(this.client, `${creditsPath}/${credit.creditBalanceId}/refund-requests`, { method: 'POST', body: { amountCents, reason }, headers: { 'Idempotency-Key': idempotencyKey } })
        : throwError((): Partial<ApiError> => ({ status: 422, message: T.refusal.noSource })))),
      map((d): CreditRequestOutcome => ({ ok: true, amountCents, ...(d?.decisionDueAt && { decisionDueAt: d.decisionDueAt }) })),
      catchError((error: ApiError) => (error.status === 422 || error.status === 400 ? of<CreditRequestOutcome>({ ok: false, reason: error.message }) : throwError(() => error))));
  }
}

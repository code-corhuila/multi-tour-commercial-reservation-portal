import { Observable, concatMap, defaultIfEmpty, expand, filter, of, switchMap, take, throwError, timer } from 'rxjs';
import { ApiError, PortalApiClient } from '../shell-contract';
import { call } from './api-paths';

/** The gateway door of the saga register-payment (HU-WFL-002): one route per saga, outside the service's own base. */
export const registerPaymentSagaPath = (sagaId?: string): string => ['/api/v1/sagas/register-payment', sagaId].filter(Boolean).join('/');

/** Saga of the contract of register-payment: Cash records the income, then the reservation records the validated payment (ADR-004 D3). */
interface SagaDto { readonly id: string; readonly status: 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'FAILED'; readonly failedStep?: 'RECORD_CASH_INCOME' | 'RECORD_VALIDATED_PAYMENT' }

/** What the approval of a transfer proof sends: the verified amount, and the reason only when there is one (the service asks for it when the amount differs). */
export type RegisterPayment = { readonly reservationId: string; readonly paymentId: string; readonly amountCents: number; readonly reason: string };

const SAGA_POLLS = 60;
/** The concept of the cash movement: fixed text, never a name, a document or the reason (no personal data travels to Cash). */
const CONCEPT = 'Comprobante de transferencia aprobado';
/** The outcomes of the saga in the words of the screens (PROPUESTO: the mockup draws no such notice). */
const OUTCOME = {
  cashRefused: 'Caja rechazó el ingreso y el comprobante sigue pendiente.',
  reversed: 'La reserva no aceptó el pago y Caja reversó el ingreso; el comprobante sigue pendiente.',
  unknown: 'No se conoce el resultado del registro: un responsable debe revisarlo.',
  running: 'El registro sigue en curso: consulta de nuevo en unos minutos.',
};
const failure = (message: string, code: string): ApiError => ({ status: 0, code, message, details: [], traceId: '', userMessage: message });
/** The business date the saga asks for: today in the tenant's country (the cash day), never the browser's UTC day. */
const businessDate = (at: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(at);

/**
 * POST /sagas/register-payment under the Idempotency-Key, then GET until the saga ends. The tenant and the person are the token's. Only a COMPLETED saga is an
 * approval: a refusal of Cash leaves the proof pending, a refusal of the reservation is reversed in Cash, and an unknown outcome is for a person to decide.
 */
export class RegisterPaymentSaga {
  constructor(private readonly client: PortalApiClient, private readonly pollMs = 1500, private readonly now: () => number = Date.now) {}

  run(payment: RegisterPayment, idempotencyKey: string): Observable<void> {
    const body = { reservationId: payment.reservationId, paymentId: payment.paymentId, paymentMedium: 'TRANSFER', amountCents: payment.amountCents,
      businessDate: businessDate(this.now()), concept: CONCEPT, ...(payment.reason ? { reason: payment.reason } : {}) };
    return call<SagaDto>(this.client, registerPaymentSagaPath(), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      switchMap((first) => this.follow(first)),
      switchMap((saga) => this.outcome(saga)),
    );
  }

  /** Asks the saga again, one pause apart, until it ends; `undefined` when it never did. */
  private follow(first: SagaDto): Observable<SagaDto | undefined> {
    let asked = 0;
    return of(first).pipe(
      expand((s) => (s.status === 'RUNNING' && ++asked < SAGA_POLLS ? timer(this.pollMs).pipe(concatMap(() => call<SagaDto>(this.client, registerPaymentSagaPath(s.id)))) : of())),
      filter((s) => s.status !== 'RUNNING'), take(1), defaultIfEmpty(undefined),
    );
  }

  private outcome(saga: SagaDto | undefined): Observable<void> {
    if (!saga) return throwError(() => failure(OUTCOME.running, 'SAGA_TIMEOUT'));
    if (saga.status === 'COMPLETED') return of(undefined);
    if (saga.status === 'COMPENSATED') return throwError(() => failure(OUTCOME.reversed, 'SAGA_COMPENSATED'));
    return throwError(() => (saga.failedStep === 'RECORD_CASH_INCOME' ? failure(OUTCOME.cashRefused, 'CASH_REFUSED') : failure(OUTCOME.unknown, 'SAGA_FAILED')));
  }
}

import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { DecideProofCommand, PendingProof, PendingProofs, PendingProofsSource, ProofReviewWriter } from '../payments/data/proof-review-ports';
import { Reservation } from '../reservations/model/reservation';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, call, listPages } from './api-paths';
import { PROOF, readReservation } from './payments-api-sources';
import { RegisterPaymentSaga } from './register-payment-saga';
import { METHOD_IN, TYPE_IN } from './reservations-api-sources';

export const paymentProofsPath = (paymentId?: string, action?: 'approve' | 'reject' | 'file'): string => [`${API_BASE}/payment-proofs`, paymentId, action].filter(Boolean).join('/');

/** PaymentProofSummary of the contract (PROPOSED): the row of the panel, with all it draws; `reviewOverdue` is the mark the service derives from its clock. */
interface ProofRowDto {
  readonly paymentId: string; readonly reservationId: string; readonly customerName: string; readonly paymentType?: string; readonly paymentMethod?: string;
  readonly declaredAmountCents: number; readonly validationStatus: string; readonly reviewOverdue: boolean;
}
/** PaymentProofDecision of the contract (PROPOSED): what the decision did with the verified amount, in cents. */
interface DecisionDto { readonly appliedAmountCents?: number; readonly excessAmountCents?: number; readonly treatmentAmountCents?: number }

const rowOf = (dto: ProofRowDto): PendingProof => ({
  reservation: { id: dto.reservationId, leadCustomerName: dto.customerName,
    ...(dto.paymentType ? { paymentType: TYPE_IN[dto.paymentType] ?? dto.paymentType } : {}), ...(dto.paymentMethod ? { paymentMethod: METHOD_IN[dto.paymentMethod] ?? dto.paymentMethod } : {}) },
  payment: { id: dto.paymentId, amountCents: dto.declaredAmountCents, proofStatus: PROOF[dto.validationStatus] ?? 'SIN_COMPROBANTE' }, overdue: dto.reviewOverdue,
});

/**
 * The proofs of every status (the mockup lists the decided ones too), each row complete for the panel: the list is the only read, nothing is read per row.
 * The overdue count is the one the service answers for the proofs in validation (`overdueCount` of the first page); the portal derives no mark.
 */
export class PendingProofsApiSource extends PendingProofsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<PendingProofs> {
    return forkJoin(['IN_VALIDATION', 'APPROVED', 'REJECTED'].map((status) => listPages<ProofRowDto>(this.client, paymentProofsPath(), { status }))).pipe(
      map((byStatus): PendingProofs => ({ rows: byStatus.flatMap((pages) => pages.flatMap((result) => result.data)).map(rowOf), overdueCount: byStatus[0][0]?.overdueCount ?? 0 })),
    );
  }
}

/**
 * A rejection is one POST under the Idempotency-Key with the reason only. An approval starts the saga register-payment (DP-11): Cash records the income first and
 * step 2 applies the verified amount, so it is an approval only when the saga completed; the result is then read from the proof and the reservation.
 * The reviewer and the time are the token's and the clock's.
 */
export class ProofReviewApiWriter extends ProofReviewWriter {
  private readonly saga: RegisterPaymentSaga;
  constructor(private readonly client: PortalApiClient, pollMs = 1500) { super(); this.saga = new RegisterPaymentSaga(client, pollMs); }
  override decide(command: DecideProofCommand, idempotencyKey: string): Observable<Reservation> {
    const approving = command.decision === 'APROBADO', reason = command.reason.trim();
    const decision$ = approving
      ? this.saga.run({ reservationId: command.reservationId, paymentId: command.paymentId, amountCents: command.verifiedAmountCents, reason }, idempotencyKey).pipe(switchMap(() => call<DecisionDto>(this.client, paymentProofsPath(command.paymentId))))
      : call<DecisionDto>(this.client, paymentProofsPath(command.paymentId, 'reject'), { method: 'POST', body: { reason }, headers: { 'Idempotency-Key': idempotencyKey } });
    return decision$.pipe(
      switchMap((decided) => readReservation(this.client, command.reservationId).pipe(map((reservation): Reservation => ({
        ...reservation,
        payments: reservation.payments?.map((p) => (p.id === command.paymentId && approving && p.review
          ? { ...p, review: { ...p.review, appliedCents: decided.appliedAmountCents, surplusCents: decided.excessAmountCents, pendingTreatmentCents: decided.treatmentAmountCents } } : p)),
      })))),
    );
  }
}

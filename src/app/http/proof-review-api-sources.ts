import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { DecideProofCommand, PendingProof, PendingProofs, PendingProofsSource, ProofReviewWriter } from '../payments/data/proof-review-ports';
import { Reservation } from '../reservations/model/reservation';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll } from './api-paths';
import { readReservation } from './payments-api-sources';
import { rowsOf } from './reservations-api-sources';

export const paymentProofsPath = (paymentId?: string, action?: 'approve' | 'reject'): string => [`${API_BASE}/payment-proofs`, paymentId, action].filter(Boolean).join('/');

/** PaymentProofSummary of the contract (PROPOSED): the row of the panel; `reviewOverdue` is the mark the service derives from its clock. */
interface ProofRowDto { readonly paymentId: string; readonly reservationId: string; readonly reviewOverdue: boolean }
/** PaymentProofDecision of the contract (PROPOSED): what the decision did with the verified amount, in cents. */
interface DecisionDto { readonly appliedAmountCents?: number; readonly excessAmountCents?: number; readonly treatmentAmountCents?: number }

/**
 * The proofs of every status (the mockup lists the decided ones too), each with its reservation and payments, read once per reservation.
 * The overdue count is the number of rows the service marked; the portal derives no mark. DEBT: one read per reservation.
 */
export class PendingProofsApiSource extends PendingProofsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<PendingProofs> {
    return forkJoin(['IN_VALIDATION', 'APPROVED', 'REJECTED'].map((status) => listAll<ProofRowDto>(this.client, paymentProofsPath(), { status }))).pipe(
      map((byStatus) => byStatus.flat()),
      switchMap((proofs) => {
        if (!proofs.length) { return of<PendingProofs>({ rows: [], overdueCount: 0 }); }
        const ids = [...new Set(proofs.map((p) => p.reservationId))];
        return rowsOf(this.client).pipe(
          switchMap((summaries) => forkJoin(ids.map((id) => readReservation(this.client, id, summaries.find((s) => s.reservationId === id))))),
          map((reservations): PendingProofs => {
            const rows = proofs.flatMap((proof): PendingProof[] => {
              const reservation = reservations.find((r) => r.id === proof.reservationId), payment = reservation?.payments?.find((p) => p.id === proof.paymentId);
              return reservation && payment ? [{ reservation, payment, overdue: proof.reviewOverdue }] : [];
            });
            return { rows, overdueCount: rows.filter((row) => row.overdue).length };
          }),
        );
      }),
    );
  }
}

/**
 * One POST per decision under the Idempotency-Key: approve with the verified amount (and the reason when there is one), reject with the reason only.
 * The reviewer and the time are the token's and the clock's. The approval is the human decision that comes first; the saga register-payment
 * that records the validated payment is not in this contract (api spec 010, update of 2026-11-01), so it is not called here.
 */
export class ProofReviewApiWriter extends ProofReviewWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override decide(command: DecideProofCommand, idempotencyKey: string): Observable<Reservation> {
    const approving = command.decision === 'APROBADO', reason = command.reason.trim();
    const body = approving ? { verifiedAmountCents: command.verifiedAmountCents, ...(reason ? { reason } : {}) } : { reason };
    return call<DecisionDto>(this.client, paymentProofsPath(command.paymentId, approving ? 'approve' : 'reject'), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }).pipe(
      switchMap((decided) => readReservation(this.client, command.reservationId).pipe(map((reservation): Reservation => ({
        ...reservation,
        payments: reservation.payments?.map((p) => (p.id === command.paymentId && approving && p.review
          ? { ...p, review: { ...p.review, appliedCents: decided.appliedAmountCents, surplusCents: decided.excessAmountCents, pendingTreatmentCents: decided.treatmentAmountCents } } : p)),
      })))),
    );
  }
}

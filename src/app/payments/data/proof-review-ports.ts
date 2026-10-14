import { Observable } from 'rxjs';
import { Reservation, ReservationPayment } from '../../reservations/data/reservations-source';

/** HU-COM-010: what the decision page sends (RN-RES-006A); field names await payment_attempts (G-B, DD-PV1). */
export type DecideProofCommand = {
  readonly reservationId: string; readonly paymentId: string; readonly decision: 'APROBADO' | 'RECHAZADO';
  readonly verifiedAmountCents: number; readonly reason: string;
};

/** Plan D-03 to D-05: the reservation already resolved (applied amount, validated total, status, situation), or { status: 403 | 409, userMessage }. */
export abstract class ProofReviewWriter { abstract decide(command: DecideProofCommand, idempotencyKey: string): Observable<Reservation>; }

/** A row of "Pagos pendientes": a proof En validación, its reservation and the Revisión vencida mark (RN-RES-006C), resolved. */
export type PendingProof = { readonly reservation: Reservation; readonly payment: ReservationPayment; readonly overdue: boolean };
export type PendingProofs = { readonly rows: readonly PendingProof[]; readonly overdueCount: number };

/** Plan D-03: the rows and the overdue count come resolved; the view never computes a balance or a mark. */
export abstract class PendingProofsSource { abstract list(): Observable<PendingProofs>; }

/** The proof still to decide of a reservation: its last line En validación. */
export const proofToDecide = (r: Reservation): ReservationPayment | undefined => (r.payments ?? []).filter((p) => p.proofStatus === 'EN_VALIDACION').at(-1);

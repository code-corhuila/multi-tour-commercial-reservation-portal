import { Observable } from 'rxjs';
import { Reservation } from '../../reservations/data/reservations-source';

/** HU-COM-017 plan D-03 (PROPUESTO): field names follow 06-data credit_balances; no path yet (G-B, DD-1). */
export type CreditBalance = {
  readonly id: string; readonly reservationId: string; readonly tenant: string; readonly amountCents: number;
  readonly origin: 'TRATAMIENTO' | 'EXCEDENTE'; readonly status: 'PENDIENTE'; readonly recordedBy: string; readonly recordedAt: string;
  /** AC4: never applied by itself; applying it waits DP-CB1. */
  readonly appliedTo: null;
};
/** The 24-hour treatment of a reservation, resolved: its 100 % amount, whether it is still open, the balance already recorded. */
export type CreditBalanceTreatment = { readonly reservationId: string; readonly amountCents: number; readonly open: boolean; readonly recorded: CreditBalance | null };
/** AC4: what an approval applies, what stays pending and the excess kept as a credit balance. */
export type ExcessSplit = { readonly appliedCents: number; readonly pendingCents: number; readonly excess: CreditBalance | null };

/** Null when the reservation has no treatment. */
export abstract class CreditBalanceSource {
  abstract treatmentOf(reservationId: string): Observable<CreditBalanceTreatment | null>;
}

/** One line per Idempotency-Key; the service refuses without the capability (403) or with the treatment closed (409). No apply, no no-outflow (DP-CB1, DP-CB2). */
export abstract class CreditBalanceWriter {
  abstract recordFromTreatment(reservationId: string, idempotencyKey: string): Observable<CreditBalance>;
  /** Plan D-04: called by the approval of HU-COM-010 with the reservation before it and the approved value. */
  abstract recordExcess(reservation: Reservation, approvedCents: number, idempotencyKey: string): Observable<ExcessSplit>;
}

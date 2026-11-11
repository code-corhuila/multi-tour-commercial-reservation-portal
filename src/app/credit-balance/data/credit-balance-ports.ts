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

/** Amendment 2026-10-14, plan D-08: the overview of admin-saldo-favor.html, every figure resolved by the port; the view formats only (pillar 2). DP-CB8: a customer is grouped by name in the demo. */
export type CreditSourceLine = { readonly reservationId: string; readonly balanceCents: number; readonly requestedCents: number; readonly availableCents: number };
export type CreditTarget = { readonly reservationId: string; readonly balanceCents: number };
export type CreditMovement = { readonly at: string; readonly kind: 'ORIGEN' | 'APLICACION' | 'DEVOLUCION'; readonly detail: string; readonly reservationId: string; readonly amountCents: number; readonly actor: string };
export type CreditCustomer = { readonly key: string; readonly name: string; readonly availableCents: number; readonly sources: readonly CreditSourceLine[];
  /** The reservations the credit can pay (not Cancelada, Finalizada or En ejecución, with a pending balance) and the amount the form offers. */
  readonly targets: readonly CreditTarget[]; readonly suggestedCents: number; readonly history: readonly CreditMovement[] };
export type CreditRequest = { readonly id: string; readonly reservationId: string; readonly customer: string; readonly amountCents: number; readonly state: 'PENDIENTE_DE_AUTORIZACION' | 'RECHAZADA';
  readonly reason: string; readonly requestedBy: string; readonly requestedAt: string; readonly decisionDueAt: string; readonly tenant: string };
export type CreditOverview = { readonly availableCents: number; readonly customersWithBalance: number; readonly pendingDecisions: number; readonly customers: readonly CreditCustomer[]; readonly requests: readonly CreditRequest[] };
/** A business refusal is data with the mockup's text (D-5); a missing capability is an error 403. */
export type CreditApplyOutcome = { readonly ok: true; readonly appliedCents: number; readonly firstPayment: boolean } | { readonly ok: false; readonly reason: string };
/** Sub-screen of 13 opened with PortalNavigation.open (plan D-07); no sidebar item. */
export const CREDIT_BALANCE_AREA = 'credit-balance';

/** Null when the reservation has no treatment. */
export abstract class CreditBalanceSource {
  abstract treatmentOf(reservationId: string): Observable<CreditBalanceTreatment | null>;
  abstract list(): Observable<CreditOverview>;
}

/** One line per Idempotency-Key; the service refuses without the capability (403) or with the treatment closed (409). No no-outflow operation (DP-CB2). */
export abstract class CreditBalanceWriter {
  abstract recordFromTreatment(reservationId: string, idempotencyKey: string): Observable<CreditBalance>;
  /** Plan D-04: called by the approval of HU-COM-010 with the reservation before it and the approved value. */
  abstract recordExcess(reservation: Reservation, approvedCents: number, idempotencyKey: string): Observable<ExcessSplit>;
  /** AC-CB.4: the customer's credit paid as a validated payment without proof; the first payment holds the seat in the same operation, or nothing is applied. */
  abstract apply(targetReservationId: string, amountCents: number, idempotencyKey: string): Observable<CreditApplyOutcome>;
}

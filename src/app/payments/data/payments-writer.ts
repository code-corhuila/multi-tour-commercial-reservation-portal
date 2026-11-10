import { Observable } from 'rxjs';
import { Reservation } from '../../reservations/data/reservations-source';

/** What the operator sends from 13; the method is the reservation's (DP-PY3). Field names await payment_attempts (G-B). */
export type RegisterPaymentCommand = {
  readonly reservationId: string; readonly amountCents: number; readonly proof: File | null;
  /** 24: the type chosen on 21 (DP-PY3); kept when the reservation has none. */
  readonly paymentType?: string;
};

/** D-03: one payment pending validation per Idempotency-Key; the service checks proof, start, cash and seat (D-06) and answers the reservation. */
export abstract class PaymentsWriter { abstract register(command: RegisterPaymentCommand, idempotencyKey: string): Observable<Reservation>; }

/** DD-3: whether a cash session is open; HU-CSH-001 answers it through the saga. */
export abstract class CashSessionStatus { abstract isOpen(): boolean; }

/** D-07 (G-USR): the label of who registers; the service takes the real user from the token. */
export abstract class RegisteringUser { abstract label(): string; }

/** AC-PY.13: what the service says the reservation pays now; the view computes nothing. The amount is null when no payment type is enabled. */
export type PaymentQuote = { readonly amountToPayCents: number | null; readonly pendingBalanceCents: number };
/** GET /reservations/{id}/payment-quote for the portal type (`TOTAL`, `PARTIAL`): the minimum deposit on a first deposit, else the pending balance. */
export abstract class PaymentQuoteReader { abstract quote(reservationId: string, type: string): Observable<PaymentQuote>; }

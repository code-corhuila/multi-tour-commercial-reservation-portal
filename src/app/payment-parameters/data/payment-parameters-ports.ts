import { Observable } from 'rxjs';
import { EffectiveParameters, ParameterOverrides, ParameterPatch } from '../model/payment-parameters';

/** Sub-screen of Catálogos (and Pagos) opened with PortalNavigation.open; no sidebar item (amendment A.1, P14). */
export const PAYMENT_PARAMETERS_AREA = 'payment-parameters';

/** What the minimum deposit needs of a reservation: which one it is (its parameters were fixed at creation), its service and its final value after discounts. */
export type DepositSubject = { readonly id: string; readonly tourName: string; readonly quote: { readonly finalCents: number } };

/** One row of the grid: what the row defines itself and what applies to it (the grey placeholder of the mockup). */
export type ParameterRow = { readonly scope: 'tenant' | 'service'; readonly service: string; readonly own: ParameterOverrides; readonly applied: EffectiveParameters };
/** One line of the audit: who changed which record, why, and the values before and after (AC-PY.17). */
export type ParameterAuditLine = { readonly at: string; readonly actor: string; readonly record: string; readonly reason: string; readonly previous: string; readonly next: string };
export type PaymentParametersView = {
  readonly rows: readonly ParameterRow[]; readonly audit: readonly ParameterAuditLine[];
  /** Null while nothing was saved: the defaults apply. */
  readonly lastChange: { readonly at: string; readonly actor: string } | null;
};
export type SaveParametersCommand = { readonly tenant: ParameterPatch; readonly services: Readonly<Record<string, ParameterPatch>>; readonly reason: string };

/**
 * The single owner of the payment parameters (DP-PY7): 009- draws them; 011- (deadlines) and 013- (penalty) read them here and seed no value of
 * their own. Gap G-B: no path yet, so only the demo supplies it.
 */
export abstract class PaymentParametersSource {
  /** The tenant row first, then one row per service name given (the catalog's tours). */
  abstract read(services: readonly string[]): Observable<PaymentParametersView>;
  /** AC-PY.12: the minimum deposit of the reservation, over its final value after discounts, under the parameters it was created with. */
  abstract minimumDepositCents(reservation: DepositSubject): Observable<number>;
}

/**
 * Saves a change under one Idempotency-Key (RN-P6). The service refuses a role without the capability (403), an empty reason, a value out of bounds
 * or no change at all (409/422 with a userMessage); the same key answers the same result.
 */
export abstract class PaymentParametersWriter {
  abstract save(command: SaveParametersCommand, idempotencyKey: string): Observable<PaymentParametersView>;
}

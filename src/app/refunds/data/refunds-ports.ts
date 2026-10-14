import { Injector } from '@angular/core';
import { Observable } from 'rxjs';
import { PortalCapabilities } from '../../shared/portal-capabilities';

/** DP-RF7 (PROPUESTO, mockup labels): En ejecución is not stored, only drawn while executeRefund is in flight (plan D-05). */
export type RefundState = 'PENDIENTE_DE_DECISION' | 'PENDIENTE_DE_AUTORIZACION' | 'AUTORIZADA' | 'EJECUTADA';
export type RefundMethod = 'BANK_TRANSFER' | 'CASH';

/** Plan D-03: one refund per reservation (its code is the id), every business value resolved by the port; the view formats only (RN-RF1). */
export interface Refund {
  readonly id: string; readonly customer: string; readonly reason: string; readonly amountCents: number; readonly state: RefundState;
  /** The authorization reason; the person and date of the last act (execution, else authorization); null while there is none. */
  readonly decisionReason: string | null; readonly owner: string | null; readonly date: string; readonly method: RefundMethod | null; readonly cashMovement: string | null;
}
/** The refunds of the reservations store (plan D-02); gap G-B: no path in the contract yet. */
export abstract class RefundsSource { abstract list(): Observable<readonly Refund[]>; }
/** The final state the saga execute-refund returns (DD-2): executed with its cash movement, or still authorized because the cash step failed. */
export type ExecuteOutcome = { readonly kind: 'executed' | 'cash-failed'; readonly refund: Refund };

/** One record per Idempotency-Key; the service refuses a role without the capability and a refund in another state (AC-RF.2, AC-RF.3). */
export abstract class RefundsWriter {
  abstract authorize(id: string, reason: string, idempotencyKey: string): Observable<Refund>;
  abstract executeRefund(id: string, method: RefundMethod, idempotencyKey: string): Observable<ExecuteOutcome>;
}
/** Sub-screens of 13 opened with PortalNavigation and { refund }. */
export const REFUND_SCREENS = { requests: 'refund-requests', detail: 'refund-detail' } as const;

/** Plan D-04, DP-RF5: who authorizes or executes, in a build that supplies both ports. */
export function refundsAvailable(injector: Injector): boolean {
  const can = injector.get(PortalCapabilities);
  return (can.canAuthorizeRefund() || can.canExecuteRefund()) && injector.get(RefundsSource, null) !== null && injector.get(RefundsWriter, null) !== null;
}

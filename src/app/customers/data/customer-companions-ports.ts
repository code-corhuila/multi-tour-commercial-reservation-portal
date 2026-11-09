import { Observable } from 'rxjs';
import { CustomerCompanion } from '../../shared/customer-companions';

/** Key of screen 25 (`acompanantes.html`), opened with `PortalNavigation.open(COMPANIONS_AREA, { reservation })`; it has no entrance of its own (spec DP-005-V19-5). */
export const COMPANIONS_AREA = 'companions';

/** What screen 25 needs of the active reservation: the document of the titular, to refuse a repeat, and the companions already saved. */
export interface CompanionsRecord { readonly holderDocument: string; readonly companions: readonly CustomerCompanion[] }

/** The contract has no operation for these yet (spec G-B, decision D-1 of 2026-11-02): only the demo build supplies them. */
export abstract class CustomerCompanionsSource {
  abstract load(reservationId: string): Observable<CompanionsRecord>;
}

/** Each save carries its Idempotency-Key, reused while the same data is retried (Annex H). */
export abstract class CustomerCompanionsWriter {
  abstract save(reservationId: string, companions: readonly CustomerCompanion[], idempotencyKey: string): Observable<void>;
}

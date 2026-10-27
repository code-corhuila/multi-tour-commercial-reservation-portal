import { Observable } from 'rxjs';

/** PROPUESTO (G-B): a reason for which an additional discount may be authorized; `removable` is false for the last one (resolved by the service). */
export type AuthorizableReason = { readonly reason: string; readonly removable: boolean };

/**
 * Panel "Motivos autorizables" of admin-descuentos.html (AC-CD.13). Pillar 2: a duplicate or empty reason and the removal of the last one are
 * refused by the service; each change answers the whole list. One Idempotency-Key per intention, reused on retry (norm 5.3.8).
 */
export abstract class AuthorizableReasons {
  abstract list(): Observable<readonly AuthorizableReason[]>;
  abstract add(reason: string, idempotencyKey: string): Observable<readonly AuthorizableReason[]>;
  abstract remove(reason: string, idempotencyKey: string): Observable<readonly AuthorizableReason[]>;
}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CustomerGroup, CustomerMatch } from '../model/customer-group';

/** The group being prepared; null when there is none. The contract has no customer operation yet (spec G-B). */
export abstract class CustomersSource {
  abstract current(): Observable<CustomerGroup | null>;
  /** The customers whose name, document or e-mail contain the text (the caller asks from two characters on); the newest search wins at the caller. */
  abstract search(text: string): Observable<readonly CustomerMatch[]>;
}

/**
 * Whether the actor holds "Consultar datos sensibles". The container does not report it yet (spec DP-PC1),
 * so the default fails closed for every role.
 */
@Injectable({ providedIn: 'root', useFactory: (): SensitiveDataAccess => ({ granted: false }) })
export abstract class SensitiveDataAccess {
  abstract readonly granted: boolean;
}

/** PROPUESTO (spec DP-PC1): how the container would report "Consultar datos sensibles" is not decided. */
export const SENSITIVE_DATA_PERMISSION = 'CONSULT_SENSITIVE_DATA';

/** The grant as the session reports it; screens still ask PortalCapabilities which roles may use it. */
export function sensitiveDataAccessFor(grants: readonly string[]): SensitiveDataAccess {
  return { granted: grants.includes(SENSITIVE_DATA_PERMISSION) };
}

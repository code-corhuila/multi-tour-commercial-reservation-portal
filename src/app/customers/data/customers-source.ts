import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CustomerGroup } from '../model/customer-group';

/** The group being prepared; null when there is none. The contract has no customer operation yet (spec G-B). */
export abstract class CustomersSource {
  abstract current(): Observable<CustomerGroup | null>;
}

/**
 * Whether the actor holds "Consultar datos sensibles". The container does not report it yet (spec DP-PC1),
 * so the default fails closed for every role.
 */
@Injectable({ providedIn: 'root', useFactory: (): SensitiveDataAccess => ({ granted: false }) })
export abstract class SensitiveDataAccess {
  abstract readonly granted: boolean;
}

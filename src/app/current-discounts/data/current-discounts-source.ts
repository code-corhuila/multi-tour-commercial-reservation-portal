import { Observable } from 'rxjs';
import { PricedService } from '../model/current-discounts';

/** The container supplies the implementation and resolves the tenant; today the demo store (DD-1, G-API). */
export abstract class CurrentDiscountsSource {
  abstract list(date: string): Observable<readonly PricedService[]>;
}

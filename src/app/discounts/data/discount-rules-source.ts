import { Observable } from 'rxjs';
import { DiscountRule } from '../model/discount-rule';
/** The container supplies the implementation and resolves the tenant. */
export abstract class DiscountRulesSource {
  abstract list(): Observable<readonly DiscountRule[]>;
}

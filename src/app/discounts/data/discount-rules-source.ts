import { Observable } from 'rxjs';
import { DiscountRule } from '../model/discount-rule';
/** The rule records other stories read through this port (amendment 2026-10-13, plan H-D2). */
export type { DiscountRule, DiscountValue } from '../model/discount-rule';
/** The container supplies the implementation and resolves the tenant. */
export abstract class DiscountRulesSource {
  abstract list(): Observable<readonly DiscountRule[]>;
}

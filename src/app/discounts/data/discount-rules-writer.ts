import { Observable } from 'rxjs';
import { DiscountRule, DiscountRuleCommand } from '../model/discount-rule';
/** PROPUESTO (DP-03): the container supplies the adapter; each intention carries its key. */
export abstract class DiscountRulesWriter {
  abstract create(command: DiscountRuleCommand, idempotencyKey: string): Observable<DiscountRule>;
  abstract update(id: string, command: DiscountRuleCommand, idempotencyKey: string): Observable<DiscountRule>;
  abstract inactivate(id: string, idempotencyKey: string): Observable<DiscountRule>;
}

import { Observable, of } from 'rxjs';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRule } from '../discounts/model/discount-rule';

/** DEMO build only: invented discount rules (screen 12), read-only until HU-COM-003 brings its demo writer. */
export class DemoDiscountRulesStore extends DiscountRulesSource {
  private readonly rules: readonly DiscountRule[] = [
    { id: 'demo-discount-1', name: 'Tour Montañas', startsOn: '2026-09-01', endsOn: '2026-09-30', priority: 1,
      calculationBase: 'ORIGINAL_VALUE', type: 'PERCENTAGE', percentageBasisPoints: 2000, status: 'ACTIVE' },
  ];
  override list(): Observable<readonly DiscountRule[]> { return of(this.rules); }
}

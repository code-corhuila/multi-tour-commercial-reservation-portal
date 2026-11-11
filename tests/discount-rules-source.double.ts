import { Observable } from 'rxjs';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRule } from '../src/app/discounts/model/discount-rule';

export class ControllableDiscountRulesSource extends DiscountRulesSource {
  readonly requests: { reply: (items: readonly DiscountRule[]) => void; fail: (error?: unknown) => void; isOpen: () => boolean }[] = [];
  override list(): Observable<readonly DiscountRule[]> {
    return new Observable((subscriber) => {
      this.requests.push({ reply: (items) => { subscriber.next(items); subscriber.complete(); },
        fail: (error?: unknown) => subscriber.error(error ?? new Error('unavailable')), isOpen: () => !subscriber.closed });
    });
  }
}
export function discountNamed(tourName = 'Promotion', priority = 1): DiscountRule {
  return { id: tourName, tourId: `tour-${tourName}`, tourName, startsOn: '2026-01-01', endsOn: '2026-12-31', priority,
    calculationBase: 'ORIGINAL_VALUE', percentageBasisPoints: 1250, stackable: false, status: 'ACTIVE', validity: { label: 'Vigente', tone: 'confirmed', inForce: true } };
}

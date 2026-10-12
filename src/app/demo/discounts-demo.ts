import { Observable, of } from 'rxjs';
import { DemoCatalogStore } from './demo-sources';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../discounts/model/discount-rule';

/** DEMO build only: invented discount rules (screen 12), kept in memory. */
export class DemoDiscountRulesStore extends DiscountRulesSource {
  rules: readonly DiscountRule[] = [
    { id: 'demo-discount-1', name: 'Tour Montañas', startsOn: '2026-09-01', endsOn: '2026-12-31', priority: 1,
      calculationBase: 'ORIGINAL_VALUE', type: 'PERCENTAGE', percentageBasisPoints: 2000, status: 'ACTIVE' },
    { id: 'demo-discount-2', name: 'Temporada de vacaciones', startsOn: '2026-12-15', endsOn: '2027-01-15', priority: 2,
      calculationBase: 'PREVIOUS_SUBTOTAL', type: 'FIXED_AMOUNT', amountCents: 5_000_000, status: 'ACTIVE' },
    { id: 'demo-discount-3', name: 'Ruta del café', startsOn: '2026-07-01', endsOn: '2026-08-31', priority: 3,
      calculationBase: 'ORIGINAL_VALUE', type: 'PERCENTAGE', percentageBasisPoints: 1250, status: 'INACTIVE' },
  ];
  /** The rules with their badge resolved on the day the store reads. */
  get rules(): readonly DiscountRule[] { return this.stored.map((rule) => this.resolve(rule)); }
  set rules(rules: readonly RawRule[]) { this.stored = rules; }
  resolve(rule: RawRule): DiscountRule { return { ...rule, validity: validityOn(rule, this.today()) }; }
  override list(): Observable<readonly DiscountRule[]> { return of(this.rules); }
}

/** DEMO build only: one answer per Idempotency-Key, so a retried intention never writes twice (AC-PD.11). */
export class DemoDiscountRulesWriter extends DiscountRulesWriter {
  private sequence = 100;
  private readonly answered = new Map<string, DiscountRule>();
  constructor(private readonly store: DemoDiscountRulesStore) { super(); }
  override create(command: DiscountRuleCommand, key: string): Observable<DiscountRule> {
    return this.once(key, () => ({ ...command, id: `demo-discount-${++this.sequence}`, status: 'ACTIVE' }) as DiscountRule);
  }
  override update(id: string, command: DiscountRuleCommand, key: string): Observable<DiscountRule> {
    return this.once(key, () => ({ ...command, id, status: this.find(id).status }) as DiscountRule);
  }
  override inactivate(id: string, key: string): Observable<DiscountRule> {
    return this.once(key, () => ({ ...this.find(id), status: 'INACTIVE' }));
  }
  private find(id: string): DiscountRule { return this.store.rules.find(r => r.id === id)!; }
  private once(key: string, next: () => DiscountRule): Observable<DiscountRule> {
    const known = this.answered.get(key);
    if (known) return of(known);
    const stored = next();
    this.store.rules = [...this.store.rules.filter(r => r.id !== stored.id), stored];
    this.answered.set(key, stored);
    return of(stored);
  }
}

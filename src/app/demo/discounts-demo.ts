import { Observable, of } from 'rxjs';
import { DemoCatalogStore } from './demo-sources';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand, DiscountValidity } from '../discounts/model/discount-rule';

/** DEMO: DP-PD2, the badge of a rule against the day the store reads (the service would resolve it). */
export function validityOn(rule: Pick<DiscountRule, 'status' | 'startsOn' | 'endsOn'>, today: string): DiscountValidity {
  return rule.status === 'INACTIVE' ? { label: 'Inactivo', tone: 'pending', inForce: false } : today < rule.startsOn ? { label: 'Próximo', tone: 'execution', inForce: false }
    : today > rule.endsOn ? { label: 'Vencido', tone: 'finalized', inForce: false } : { label: 'Vigente', tone: 'confirmed', inForce: true };
}
type RawRule = Omit<DiscountRule, 'validity'>;

/** DEMO build only: invented discount rules (screen 12) over the tours of the demo catalog, kept in memory. */
export class DemoDiscountRulesStore extends DiscountRulesSource {
  constructor(private readonly today: () => string = () => new Date().toLocaleDateString('en-CA')) { super(); }
  private stored: readonly RawRule[] = [
    { id: 'demo-discount-1', tourId: 'demo-svc-1', tourName: 'Desierto de la Tatacoa al atardecer', startsOn: '2026-09-01', endsOn: '2026-12-31', priority: 1,
      calculationBase: 'ORIGINAL_VALUE', percentageBasisPoints: 2000, stackable: false, status: 'ACTIVE' },
    { id: 'demo-discount-2', tourId: 'demo-svc-2', tourName: 'Ruta del café en Pitalito', startsOn: '2026-12-15', endsOn: '2027-01-15', priority: 2,
      calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 1500, capCents: 8_000_000, stackable: true, status: 'ACTIVE' },
    { id: 'demo-discount-3', tourId: 'demo-svc-3', tourName: 'Canotaje en el Río Suaza', startsOn: '2026-07-01', endsOn: '2026-08-31', priority: 3,
      calculationBase: 'ORIGINAL_VALUE', percentageBasisPoints: 1250, stackable: false, status: 'INACTIVE' },
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
  constructor(private readonly store: DemoDiscountRulesStore, private readonly catalog: DemoCatalogStore) { super(); }
  override create(command: DiscountRuleCommand, key: string): Observable<DiscountRule> {
    return this.once(key, () => this.store.resolve({ ...command, id: `demo-discount-${++this.sequence}`, tourName: this.tourName(command), status: 'ACTIVE' }));
  }
  override update(id: string, command: DiscountRuleCommand, key: string): Observable<DiscountRule> {
    return this.once(key, () => this.store.resolve({ ...command, id, tourName: this.tourName(command), status: this.find(id).status }));
  }
  override inactivate(id: string, key: string): Observable<DiscountRule> {
    return this.once(key, () => this.store.resolve({ ...this.find(id), status: 'INACTIVE' }));
  }
  override reactivate(id: string, key: string): Observable<DiscountRule> {
    return this.once(key, () => this.store.resolve({ ...this.find(id), status: 'ACTIVE' }));
  }
  private tourName(command: DiscountRuleCommand): string { return this.catalog.find(command.tourId).commercialName; }
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

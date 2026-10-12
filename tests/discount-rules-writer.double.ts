import { Subject } from 'rxjs';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountRule, DiscountRuleCommand } from '../src/app/discounts/model/discount-rule';
export class ControllableDiscountRulesWriter extends DiscountRulesWriter {
  readonly calls: { kind: string; id?: string; command?: DiscountRuleCommand; key: string;
    reply: (rule: DiscountRule) => void; fail: (error: unknown) => void }[] = [];
  private request(kind: string, key: string, id?: string, command?: DiscountRuleCommand) {
    const answers = new Subject<DiscountRule>();
    this.calls.push({ kind, key, id, command, reply: rule => { answers.next(rule); answers.complete(); }, fail: error => answers.error(error) });
    return answers;
  }
  override create(command: DiscountRuleCommand, key: string) { return this.request('create', key, undefined, command); }
  override update(id: string, command: DiscountRuleCommand, key: string) { return this.request('update', key, id, command); }
  override inactivate(id: string, key: string) { return this.request('inactivate', key, id); }
}

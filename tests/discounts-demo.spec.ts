import { readFileSync } from 'node:fs';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { DiscountRuleCommand } from '../src/app/discounts/model/discount-rule';
import { sourceProviders } from '../src/app/sources.demo';

const demo = () => {
  const providers = sourceProviders(undefined as never) as { provide: unknown; useValue: unknown }[];
  const port = <T>(token: unknown) => providers.find(p => p.provide === token)?.useValue as T | undefined;
  return { source: port<DiscountRulesSource>(DiscountRulesSource)!, writer: port<DiscountRulesWriter>(DiscountRulesWriter) };
};
const command: DiscountRuleCommand = { name: 'Fin de semana', startsOn: '2026-11-01', endsOn: '2026-11-30', priority: 4,
  calculationBase: 'PREVIOUS_SUBTOTAL', type: 'PERCENTAGE', percentageBasisPoints: 1250 };

describe('demo build lets the administrator manage discount rules (AC-PD.1, AC-PD.7)', () => {
  it('supplies a writer over the same in-memory store: create, edit and inactivate', async () => {
    const { source, writer } = demo(); expect(writer).toBeDefined();
    const created = await firstValueFrom(writer!.create(command, 'key-1'));
    expect(created).toMatchObject({ ...command, status: 'ACTIVE' });
    const edited = await firstValueFrom(writer!.update(created.id, { ...command, priority: 9 }, 'key-2'));
    expect(edited).toMatchObject({ id: created.id, priority: 9, status: 'ACTIVE' });
    const inactive = await firstValueFrom(writer!.inactivate(created.id, 'key-3'));
    expect(inactive).toMatchObject({ id: created.id, priority: 9, status: 'INACTIVE' });
    const listed = await firstValueFrom(source.list());
    expect(listed.filter(r => r.id === created.id)).toEqual([inactive]);
  });
  it('answers a repeated Idempotency-Key with the first result and creates one rule (AC-PD.11)', async () => {
    const { source, writer } = demo(); const before = (await firstValueFrom(source.list())).length;
    const first = await firstValueFrom(writer!.create(command, 'same-key'));
    const again = await firstValueFrom(writer!.create(command, 'same-key'));
    expect(again).toEqual(first); expect(await firstValueFrom(source.list())).toHaveLength(before + 1);
    const other = await firstValueFrom(writer!.create(command, 'other-key')); expect(other.id).not.toBe(first.id);
  });
  it('starts with invented rules, active and inactive, by percentage and by amount', async () => {
    const rules = await firstValueFrom(demo().source.list());
    expect(rules.length).toBeGreaterThanOrEqual(3);
    expect(new Set(rules.map(r => r.status))).toEqual(new Set(['ACTIVE', 'INACTIVE']));
    expect(rules.some(r => r.type === 'FIXED_AMOUNT')).toBe(true);
  });
});

describe('panels keep the spacing of main.css', () => {
  it('pads operator panels with 25px', () => {
    expect(readFileSync('src/styles/portal.css', 'utf8')).toMatch(/\.crp-root \.crp-operator-panel \{[^}]*padding: 25px;/);
  });
});

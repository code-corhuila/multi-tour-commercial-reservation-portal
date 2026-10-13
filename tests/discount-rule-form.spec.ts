import { describe, expect, it } from 'vitest';
import { parsePercentage } from '../src/app/discounts/model/percentage';
import { openDiscountForm } from './discount-form.helpers';
import { discountNamed } from './discount-rules-source.double';
import { apiError } from './catalog-items-writer.double';

describe('percentage text becomes exact basis points', () => {
  it.each([['12.5', 1250], ['0.07', 7], ['0.29', 29], ['1.15', 115], ['100', 10000], ['0.01', 1]])('%s becomes %i', (text, units) => {
    expect(parsePercentage(text as string)).toEqual({ kind: 'valid', minorUnits: units });
  });
  it.each(['', 'abc', '1e2', '-1', '0', '100.01', '0.007', '1,5', '.5', '99999999999999999'])('refuses %j', text => {
    expect(parsePercentage(text).kind).toBe('invalid');
  });
});
describe('discount form validates before sending', () => {
  it('shows empty, data, loading and retryable error form states', async () => {
    const f = await openDiscountForm(); const state = () => f.element.querySelector('form')!.getAttribute('data-state');
    expect(state()).toBe('empty'); await f.fill(); expect(state()).toBe('data');
    await f.submit(); expect(state()).toBe('loading'); f.writer.calls[0].fail(apiError()); await f.settle();
    expect(state()).toBe('error'); await f.submit(); expect(state()).toBe('loading'); expect(f.writer.calls[1].key).toBe(f.writer.calls[0].key);
  });
  it.each([['startsOn', ''], ['endsOn', ''], ['startsOn', '2027-01-01'], ['endsOn', '2025-01-01']])('refuses invalid validity at %s on blur', async (name, value) => {
    const f = await openDiscountForm(); await f.fill(); await f.text(name, value); await f.blur(name);
    expect(f.errorFor(name)).toMatch(/required|date|validity/i);
    expect(f.field(name).getAttribute('aria-invalid')).toBe('true');
    expect(f.field(name).parentElement?.querySelector('[role="alert"]')).not.toBeNull();
    expect(f.writer.calls).toHaveLength(0); await f.submit(); expect(f.writer.calls).toHaveLength(0);
  });
  it('offers exactly two bases with explanations, two value types and one value control', async () => {
    const f = await openDiscountForm();
    expect(Array.from((f.field('calculationBase') as HTMLSelectElement).options, o => o.value)).toEqual(['ORIGINAL_VALUE', 'PREVIOUS_SUBTOTAL']);
    expect(f.element.textContent).toContain('Original value'); expect(f.element.textContent).toContain('Subtotal after the previous discount');
    expect(Array.from((f.field('type') as HTMLSelectElement).options, o => o.value)).toEqual(['PERCENTAGE', 'FIXED_AMOUNT']);
    expect(f.element.querySelectorAll('[name="value"]')).toHaveLength(1);
    for (const c of Array.from(f.element.querySelectorAll<HTMLInputElement>('input, select'))) expect(f.element.querySelector(`label[for="${c.id}"]`)).not.toBeNull();
  });
  it.each([['PERCENTAGE', '12.5', 'percentageBasisPoints', 1250], ['FIXED_AMOUNT', '0.07', 'amountCents', 7]] as const)('sends only the %s integer value and emits the stored rule', async (type, value, key, units) => {
    const f = await openDiscountForm(); await f.fill(); await f.text('type', type); await f.text('value', value); await f.submit();
    const command = f.writer.calls[0].command!;
    expect(command).toMatchObject({ name: 'Promotion', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: 1, calculationBase: 'ORIGINAL_VALUE', type, [key]: units });
    expect(Object.keys(command)).toHaveLength(7);
    f.writer.calls[0].reply(discountNamed('Stored')); await f.settle(); expect(f.saved).toEqual([discountNamed('Stored')]);
  });
  it.each([['value', '0'], ['priority', '1.5'], ['priority', '-1'], ['name', ''], ['calculationBase', ''], ['type', '']])('refuses invalid %s', async (name, value) => {
    const f = await openDiscountForm(); await f.fill(); await f.text(name, value); await f.submit();
    expect(f.errorFor(name)).toBeTruthy(); expect(f.writer.calls).toHaveLength(0);
  });
  it('guards double clicks, disables controls, retries with the same key and renews after success', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.submit(); await f.submit();
    expect(f.writer.calls).toHaveLength(1);
    for (const c of Array.from(f.element.querySelectorAll<HTMLInputElement>('input, select, button'))) expect(c.disabled).toBe(true);
    f.writer.calls[0].fail(apiError({ details: [{ field: 'name', message: 'Name conflict.' }] })); await f.settle();
    expect(f.errorFor('name')).toContain('Name conflict.'); await f.submit();
    expect(f.writer.calls[1].key).toBe(f.writer.calls[0].key);
    f.writer.calls[1].reply(discountNamed()); await f.settle(); await f.fill(); await f.submit();
    expect(f.writer.calls[2].key).not.toBe(f.writer.calls[0].key);
  });
  it('a changed submitted payload is a new intention', async () => {
    const f = await openDiscountForm(); await f.fill(); await f.submit(); f.writer.calls[0].fail(apiError()); await f.settle();
    await f.text('value', '15'); await f.submit(); expect(f.writer.calls[1].key).not.toBe(f.writer.calls[0].key);
  });
  it('updates the selected rule using a key and its id', async () => {
    const f = await openDiscountForm(discountNamed('Existing')); expect(f.field('name').value).toBe('Existing');
    expect(f.field('value').value).toBe('12.50'); await f.text('value', '15'); await f.submit();
    expect(f.writer.calls[0]).toMatchObject({ kind: 'update', id: 'Existing', key: f.keys.generated[0], command: { percentageBasisPoints: 1500 } });
  });
});

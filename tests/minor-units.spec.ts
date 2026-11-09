import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMinorUnits } from '../src/app/shared/money';
import { withoutComments } from './source-files';

// Pillar 3 (money): an amount that travels as text of whole minor units (cents) is read in shared/money.ts, not by a regex in a page.

describe('parseMinorUnits', () => {
  it.each([['30000000', 30_000_000], ['100', 100], ['1', 1], ['9007199254740991', Number.MAX_SAFE_INTEGER]])('reads the whole cents %j', (text, cents) => {
    expect(parseMinorUnits(text)).toBe(cents);
  });

  it.each(['1.5', '12.50', '1e3', ' 100', '100 ', '+5', '1,000'])('refuses decimals and any other shape (%j)', (text) => {
    expect(parseMinorUnits(text)).toBeNull();
  });

  it.each([undefined, '', '0', '000', '-5', '-0'])('refuses empty, zero and negative (%j)', (text) => {
    expect(parseMinorUnits(text)).toBeNull();
  });

  it('refuses what loses digits past the safe integer', () => {
    expect(parseMinorUnits('9007199254740993')).toBeNull();
  });
});

describe('transferAmountReadsThroughSharedMoney', () => {
  it('the transfer page keeps no regex of its own for the amount', () => {
    const page = withoutComments(readFileSync('src/app/payments/pages/transfer-payment-page.component.ts', 'utf8'));
    expect(page).not.toMatch(/\[0-9\]\+|\d\+/);
    expect(page).toContain('parseMinorUnits');
  });
});

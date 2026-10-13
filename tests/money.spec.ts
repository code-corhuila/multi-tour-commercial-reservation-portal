import { describe, expect, it } from 'vitest';
import { formatMoney, parseCop, parseMoney } from '../src/app/shared/money';

const minorUnitsOf = (text: string): number | string => {
  const result = parseMoney(text);
  return result.kind === 'valid' ? result.minorUnits : result.reason;
};

describe('convertsTypedTextToIntegerUnits', () => {
  it.each([
    ['12.5', 1250],
    ['0.07', 7],
    ['100', 10000],
    ['0', 0],
    ['0.7', 70],
    ['1250.00', 125000],
    ['  42.10  ', 4210],
    ['1.15', 115],
    ['4.35', 435],
    ['8.2', 820],
    ['19.99', 1999],
    ['0.29', 29],
  ])('reads %s as %i minor units', (text, expected) => {
    expect(minorUnitsOf(text)).toBe(expected);
  });

  it('neverMultipliesAFloat: gets exact integers where multiplying by 100 drifts', () => {
    // Each text is one whose float value times 100 is not the integer it looks like.
    const drifting: ReadonlyArray<readonly [string, number]> = [
      ['0.07', 7],
      ['0.29', 29],
      ['0.57', 57],
      ['0.58', 58],
      ['1.1', 110],
      ['1.15', 115],
      ['4.35', 435],
      ['8.2', 820],
      ['19.99', 1999],
      ['16.35', 1635],
      ['1.13', 113],
    ];
    for (const [text, expected] of drifting) {
      expect(Number.isInteger(parseFloat(text) * 100), `${text} drifts as a float`).toBe(false);
      expect(minorUnitsOf(text)).toBe(expected);
    }
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['abc', 'format'],
    ['1e3', 'format'],
    ['0x10', 'format'],
    ['1,2,3', 'format'],
    ['1..5', 'format'],
    ['1.2.3', 'format'],
    ['1,234', 'format'],
    ['.5', 'format'],
    ['5.', 'format'],
    ['-1', 'negative'],
    ['-0.5', 'negative'],
    ['1.234', 'too-many-decimals'],
    ['1.005', 'too-many-decimals'],
    ['0.075', 'too-many-decimals'],
    ['90071992547409.92', 'out-of-range'],
    ['99999999999999999999', 'out-of-range'],
  ])('rejects %j with the reason %s', (text, reason) => {
    expect(minorUnitsOf(text)).toBe(reason);
  });

  it('accepts the largest amounts that stay a safe integer and refuses the next one', () => {
    expect(minorUnitsOf('90071992547409.90')).toBe(9007199254740990);
    expect(minorUnitsOf('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(minorUnitsOf('90071992547409.92')).toBe('out-of-range');
  });

  it('formats minor units with two decimals', () => {
    expect(formatMoney(0)).toBe('0.00');
    expect(formatMoney(7)).toBe('0.07');
    expect(formatMoney(1250)).toBe('12.50');
    expect(formatMoney(125000)).toBe('1250.00');
  });

  it('refuses to format what is not a non-negative safe integer', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => formatMoney(bad)).toThrow(RangeError);
    }
  });

  it('round-trips every amount from 0 to 2000 minor units', () => {
    for (let units = 0; units <= 2000; units++) {
      expect(minorUnitsOf(formatMoney(units))).toBe(units);
    }
  });
});

describe('readsThePesosAsTheScreensWriteThem (HU-COM-010, Valor recibido)', () => {
  it.each([
    ['$100.000', 10_000_000],
    ['$ 1.039.200', 103_920_000],
    ['100.000', 10_000_000],
    ['100000', 10_000_000],
    ['$100000', 10_000_000],
    ['0.07', 7],
    ['12.5', 1250],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseCop(text)).toEqual({ kind: 'valid', minorUnits: cents });
  });

  it.each([['', 'empty'], ['$', 'empty'], ['$1.00.000', 'format'], ['-$100.000', 'negative'], ['1,000', 'format']])('refuses %j as %s', (text, reason) => {
    expect(parseCop(text)).toEqual({ kind: 'invalid', reason });
  });
});

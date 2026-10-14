import { describe, expect, it } from 'vitest';
import { formatCop, formatDate, formatDateRange } from '../src/app/shared/format';
import { pctOff } from '../src/app/demo/discount-label-demo';

// Authorized screens, section 3: money `$1.039.200` / `-$259.800`; dates `15 sep 2026`; ranges with " - ".
describe('formatCop', () => {
  it('writes pesos from cents with es-CO grouping, no decimals and no space', () => {
    expect(formatCop(103_920_000)).toBe('$1.039.200');
    expect(formatCop(18_000_000)).toBe('$180.000');
    expect(formatCop(100_000)).toBe('$1.000');
    expect(formatCop(99_900)).toBe('$999');
    expect(formatCop(0)).toBe('$0');
  });

  it('puts the minus sign before the peso sign for a discount', () => {
    expect(formatCop(-25_980_000)).toBe('-$259.800');
  });

  it('rounds a fraction of a peso to the nearest peso', () => {
    expect(formatCop(149)).toBe('$1');
    expect(formatCop(150)).toBe('$2');
  });
});

describe('formatDate', () => {
  it('writes a two-digit day, a lowercase short Spanish month and the year', () => {
    expect(formatDate('2026-09-15')).toBe('15 sep 2026');
    expect(formatDate('2026-09-01')).toBe('01 sep 2026');
    expect(formatDate('2026-01-31')).toBe('31 ene 2026');
    expect(formatDate('2026-12-05')).toBe('05 dic 2026');
  });

  it('reads the calendar date of an ISO date-time without shifting the time zone', () => {
    expect(formatDate('2026-08-20T23:30:00-05:00')).toBe('20 ago 2026');
  });

  it('leaves a text that is not an ISO date as it came', () => {
    expect(formatDate('pending')).toBe('pending');
    expect(formatDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('formatDateRange', () => {
  it('joins both dates with a spaced hyphen', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('01 sep 2026 - 30 sep 2026');
  });
});

describe('pctOff', () => {
  it('rounds the whole percentage below the base value and is 0 without a base', () => {
    expect(pctOff(129_900_000, 103_920_000)).toBe(20);
    expect(pctOff(18_000_000, 18_000_000)).toBe(0);
    expect(pctOff(0, 0)).toBe(0);
  });
});

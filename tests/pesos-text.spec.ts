import { describe, expect, it } from 'vitest';
import { pesosText } from '../src/app/shared/money';

describe('pesosText', () => {
  it('writes whole pesos without decimals and cents with two', () => {
    expect(pesosText(18_000_000)).toBe('180000');
    expect(pesosText(1_250)).toBe('12.50');
  });
});

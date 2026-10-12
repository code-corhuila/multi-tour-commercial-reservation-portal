import { MoneyParse, parseMoney } from '../../catalog/model/money';
/** D-03: reuse the integer text conversion, constrained to 1..10000 basis points. */
export function parsePercentage(text: string): MoneyParse {
  const result = parseMoney(text);
  return result.kind === 'valid' && (result.minorUnits < 1 || result.minorUnits > 10000)
    ? { kind: 'invalid', reason: 'out-of-range' } : result;
}

/** Why a typed amount was refused; the form of T-05 maps each reason to a message. */
export type MoneyRejection = 'empty' | 'format' | 'too-many-decimals' | 'negative' | 'out-of-range';

export type MoneyParse =
  | { readonly kind: 'valid'; readonly minorUnits: number }
  | { readonly kind: 'invalid'; readonly reason: MoneyRejection };

const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d+))?$/;
const MINOR_UNIT_DIGITS = 2;

/**
 * Reads the text the person typed into whole minor units (D-08, RN-P7).
 *
 * The digits are joined as a string and only then read as an integer: multiplying a float by 100
 * turns 0.07 into 7.000000000000001, and that is not the amount the person typed. Only the dot is
 * accepted as separator and thousands grouping is refused, so "1,234" is never silently read as 1.234.
 * The API stores `long`; anything beyond the JavaScript safe integer would lose digits on the way,
 * so it is refused instead of rounded.
 */
export function parseMoney(text: string): MoneyParse {
  const typed = text.trim();
  if (typed === '') {
    return { kind: 'invalid', reason: 'empty' };
  }
  if (typed.startsWith('-')) {
    return { kind: 'invalid', reason: 'negative' };
  }
  const match = DECIMAL_AMOUNT.exec(typed);
  if (match === null) {
    return { kind: 'invalid', reason: 'format' };
  }
  const [, whole, fraction = ''] = match;
  if (fraction.length > MINOR_UNIT_DIGITS) {
    return { kind: 'invalid', reason: 'too-many-decimals' };
  }
  const minorUnits = Number(whole + fraction.padEnd(MINOR_UNIT_DIGITS, '0'));
  return Number.isSafeInteger(minorUnits)
    ? { kind: 'valid', minorUnits }
    : { kind: 'invalid', reason: 'out-of-range' };
}

/** Minor units as text with two decimals, the inverse of `parseMoney`; integer arithmetic only. */
export function formatMoney(minorUnits: number): string {
  if (!Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw new RangeError('Minor units must be a non-negative safe integer');
  }
  const base = 10 ** MINOR_UNIT_DIGITS;
  const fraction = String(minorUnits % base).padStart(MINOR_UNIT_DIGITS, '0');
  return `${Math.floor(minorUnits / base)}.${fraction}`;
}

/** The pesos as the screens write them ("$100.000", grouping dots read as thousands); any other text is read by `parseMoney`. */
export function parseCop(text: string): MoneyParse {
  const grouped = /^\$?\s*(\d{1,3}(?:\.\d{3})+)$/.exec(text.trim());
  return parseMoney(grouped ? grouped[1].replace(/\./g, '') : text.trim().replace(/^\$\s*/, ''));
}

/** Cents to the text a person types (RN-P7): whole pesos as they are (`180000`), two decimals only when there are cents (`12.50`). */
export function pesosText(minorUnits: number): string {
  return minorUnits % 100 === 0 ? String(minorUnits / 100) : formatMoney(minorUnits);
}

/** A positive amount of whole minor units carried as text (navigation parameters): digits only, safe integer; anything else is null. */
export function parseMinorUnits(text: string | undefined): number | null {
  const minorUnits = /^\d+$/.test(text ?? '') ? Number(text) : NaN;
  return Number.isSafeInteger(minorUnits) && minorUnits > 0 ? minorUnits : null;
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Pillar 2 (rules behind a port), whole portal: the screens and their components format what a port resolved; they decide nothing.

/** Arithmetic on money, date comparisons, rounding and seat comparisons: the business rules a view must not hold. */
const BUSINESS_RULES: readonly [string, RegExp][] = [
  ['Math.', /\bMath\./],
  ['cents / 100 or toFixed', /\/ ?100\b|\* ?100\b|toFixed\(/],
  ['arithmetic on a value in cents', /Cents ?[-+*/] ?[a-zA-Z0-9(]|[a-zA-Z)] ?[-+*/] ?[a-zA-Z.]*Cents\b/],
  ['a date compared with today or a validity bound', /\b(today|startsOn|endsOn)\b ?[<>]|[<>]=? ?(this\.)?[a-z.]*\b(today|startsOn|endsOn)\b/],
  ['a comparison of the seats of a departure', /effectiveCapacity ?[<>]|[<>] ?[a-z.]*effectiveCapacity/],
];

/** file -> the rule it may still hold, and why. Each entry is debt or a UI bound, never a new business rule. */
const EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  'src/app/self-service-reservation/pages/reserve-tour-page.component.ts': ['Math.'], // the minus button of the people stepper never goes below one: a control bound, not a rule
  'src/app/payments/pages/payment-management-page.component.ts': ['arithmetic on a value in cents'], // DEBT: the surplus of a payment should come resolved from the payments port
  'src/app/current-discounts/components/current-discounts-value.component.ts': ['arithmetic on a value in cents'], // DEBT: the discounted amount should come in the breakdown of HU-COM-004
};

describe('viewsAndComponentsHoldNoBusinessRule', () => {
  it('has no money arithmetic, date comparison, rounding or seat comparison under pages/ or components/', () => {
    const files = listSourceFiles().filter((file) => /^src\/app\/[^/]+\/(?:[^/]+\/)*(pages|components)\/[^/]+\.ts$/.test(file));
    expect(files.length).toBeGreaterThan(40);
    const breaches: string[] = [];
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      for (const [name, pattern] of BUSINESS_RULES) {
        if (pattern.test(code) && !(EXCEPTIONS[file] ?? []).includes(name)) breaches.push(`${file}: ${name}`);
      }
    }
    expect(breaches).toEqual([]);
  });
});

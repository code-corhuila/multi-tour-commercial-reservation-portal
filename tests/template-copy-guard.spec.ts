import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

/** Pillar 5: the texts live in <feature>-copy.ts, never in a template. Explicit, justified exceptions only. */
/** Symbols and glyphs that are not words. */
const ALLOWED_TEXT = new Set(['✓', '×', '·', '—', '–', '+', '-', '/', '|', '%', '→', '←', '★', '☆', '…', '#', ':', ',', '.', '(', ')', '*', '©', '!', '$']);
/** Lookup keys of the model (not text): an upper-case code, or one of these identifiers a template uses to index a copy table. */
const CODE_KEYS = new Set(['lead', 'all', 'data', 'type', 'method', 'proof', 'financial', 'closed', 'execute', 'pay']);
const isCode = (literal: string) => !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(literal) || /^[A-Z][A-Z0-9_]*$/.test(literal) || CODE_KEYS.has(literal);
const LITERALS = /(['"])([^'"]*)(['"])/g;

export function templateViolations(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const [, template] of source.matchAll(/template:\s*`([\s\S]*?)`/g)) {
    for (const [, expr] of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      for (const [, , literal] of expr.matchAll(LITERALS)) { if (!isCode(literal)) found.push(`literal in {{ }}: ${literal}`); }
    }
    const plain = template.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<(?:"[^"]*"|'[^']*'|[^>"'])*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ')
      .replace(/@(?:if|else if|for|switch|case|default|else|let|empty)\b[^\n{]*\{?/g, ' ').replace(/&ngsp;/g, ' ').replace(/[{}]/g, ' ');
    for (const word of plain.split(/\s+/).filter(Boolean)) { if (!ALLOWED_TEXT.has(word)) found.push(`loose text: ${word}`); }
    for (const [, name, value] of template.matchAll(/\s(aria-label|aria-description|placeholder|title|alt|label)="([^"]*)"/g)) { if (value.trim() !== '') found.push(`literal ${name}: ${value}`); }
    for (const [, name, value] of template.matchAll(/\[attr\.(aria-label|placeholder|title|alt)\]="([^"]*)"/g)) {
      for (const [, , literal] of value.matchAll(LITERALS)) { if (!isCode(literal)) found.push(`literal ${name} binding: ${literal}`); }
    }
  }
  return found;
}

describe('templatesHaveNoLooseSpanishText', () => {
  it('keeps every text, aria-label, placeholder and title of a template in a *-copy.ts file (pillar 5)', () => {
    const files = listSourceFiles().filter((file) => /^src\/app\/.*\.ts$/.test(file) && !/-copy\.ts$/.test(file));
    const offenders = files.map((file) => [file, templateViolations(file)] as const).filter(([, found]) => found.length > 0);
    expect(offenders.map(([file, found]) => `${file}: ${found.join(' | ')}`)).toEqual([]);
  });
});

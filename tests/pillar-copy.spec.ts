import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// Pillar 5 (texts in <feature>-copy.ts): no Spanish text lives inside a template or a model of these stories.
// A text is a decision of the screen; it is read from `reservations-copy.ts`, `self-service-copy.ts` or `shell-copy.ts`.
// One entry per story that already has its copy file; a story is added in the same commit that creates its copy file.
const GUARDED = [{ prefix: 'src/app/reservations/', copy: 'src/app/reservations/reservations-copy.ts' },
  { prefix: 'src/app/self-service-reservation/', copy: 'src/app/self-service-reservation/self-service-copy.ts' }];
const TEXT_ATTRIBUTES = /\s(?:aria-label|aria-description|placeholder|title|alt|label)="([^"]*)"/g;
/** Text that is not a sentence: symbols and units a template may draw by itself. Kept minimal on purpose. */
const ALLOWED = new Set(['✓', '·', '—', 'COP', '#', '%']);
/** Messages for developers that no screen ever shows (the read-failure component draws its own text). */
const INTERNAL_ERRORS = new Set(['No catalog port']);

/** The product name is a proper noun, drawn as MULTI + TOUR in the header and the footer. */
const isBrand = (text: string) => text.replace(/\s/g, '').toLowerCase() === 'multitour';
const guarded = () => listSourceFiles().filter((file) => file.endsWith('.ts') && !file.endsWith('-copy.ts') && GUARDED.some(({ prefix }) => file.startsWith(prefix)));
const hasWords = (text: string) => /\p{L}/u.test(text.replace(/&\w+;/g, ''));
/** A string literal inside an expression is Spanish text when it has several words or a non-ASCII letter; codes (`'PARTIAL'`, `'loading'`) are not. */
const isSentence = (literal: string) => /\p{L}/u.test(literal) && (/\s/.test(literal.trim()) || /[^\x00-\x7F]/.test(literal));

function templatesOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'template' && ts.isStringLiteralLike(node.initializer)) found.push(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The Spanish texts a template carries by itself: text nodes, static text attributes and sentences inside expressions. */
function textsInTemplate(template: string): string[] {
  const html = template.replace(/<!--[\s\S]*?-->/g, '');
  const found = [...html.matchAll(TEXT_ATTRIBUTES)].map((match) => match[1]).filter((value) => hasWords(value) && !value.includes('{{'));
  for (const expression of html.match(/\{\{[\s\S]*?\}\}|="[^"]*"/g) ?? []) {
    for (const literal of expression.matchAll(/'([^'\n]*)'/g)) if (isSentence(literal[1])) found.push(literal[1]);
  }
  const text = html
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/@let [^;]*;/g, ' ')
    .replace(/@(?:else if|if|for|switch|case)\s*\((?:[^()]|\([^()]*\))*\)/g, ' ')
    .replace(/@(?:else|default|empty)\b/g, ' ')
    .replace(/&(?:ngsp|nbsp|amp|lt|gt);/g, ' ')
    .replace(/[{}]/g, ' ');
  for (const piece of text.split(/\s{2,}|\n/)) {
    const trimmed = piece.trim();
    if (trimmed && hasWords(trimmed) && !ALLOWED.has(trimmed) && !isBrand(trimmed)) found.push(trimmed);
  }
  return found;
}

/** Every string literal outside the template (models, pages, components) with several words or an accent, in source order. */
function sentencesOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || (ts.isPropertyAssignment(node) && node.name.getText() === 'template')) return;
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (isSentence(node.text) && !INTERNAL_ERRORS.has(node.text)) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('textsLiveInCopyFiles', () => {
  it('recognises the texts a template draws by itself', () => {
    expect(textsInTemplate('<h2>Resumen</h2>')).toEqual(['Resumen']);
    expect(textsInTemplate('<div aria-label="Filtros rápidos"></div>')).toContain('Filtros rápidos');
    expect(textsInTemplate(`<p>{{ ok ? 'Hay cupo' : t.none }}</p>`)).toEqual(['Hay cupo']);
    expect(textsInTemplate('<p>{{ t.title }}</p> @if (a === \'PARTIAL\') { <b>{{ x }}</b> } <span aria-hidden="true">✓</span>')).toEqual([]);
  });

  it('finds no Spanish text inside a template of a guarded story', () => {
    const files = guarded();
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.flatMap((file) => templatesOf(file).flatMap(textsInTemplate).map((text) => `${file}: ${text}`));
    expect(offenders).toEqual([]);
  });

  it('keeps the Spanish sentences of models, pages and components in the copy files', () => {
    expect(guarded().filter((file) => !file.includes('/data/')).flatMap((file) => sentencesOf(file).map((text) => `${file}: ${text}`))).toEqual([]);
  });

  it('has the copy file of each guarded story', () => {
    const all = listSourceFiles();
    for (const { copy } of GUARDED) expect(all).toContain(copy);
  });
});

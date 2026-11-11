import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Amendment 2026-10-13, plan H-D2: a story imports from another story only its public data/ ports;
// what several stories share lives in src/app/shared/. Folders that are not a story are not checked here.
const NOT_A_STORY = new Set(['shared', 'http', 'demo']);
const INTERNAL = new Set(['model', 'pages', 'components']);
const IMPORT = /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The story folder of a file under src/app/, or null for a file outside every story. */
function storyOf(file: string): string | null {
  const parts = file.split('/');
  return parts.length > 3 && parts[0] === 'src' && parts[1] === 'app' && !NOT_A_STORY.has(parts[2]) ? parts[2] : null;
}

/** Each import of another story's model/, pages/ or components/, as "importer -> target". */
function internalImports(file: string): string[] {
  const story = storyOf(file);
  if (story === null) return [];
  return [...withoutComments(readFileSync(file, 'utf8')).matchAll(IMPORT)]
    .map((match) => posix.normalize(posix.join(posix.dirname(file), match[1] ?? match[2])))
    .filter((target) => {
      const [, , other, layer] = target.split('/');
      return storyOf(target + '.ts') !== null && other !== story && INTERNAL.has(layer);
    })
    .map((target) => `${file} -> ${target}`);
}

describe('noStoryImportsTheInternalsOfAnother', () => {
  it('finds no story that imports a model/, pages/ or components/ of another story', () => {
    const files = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(files.some((file) => storyOf(file) === 'catalog')).toBe(true);
    expect(files.flatMap(internalImports)).toEqual([]);
  });

  it('keeps the shared pieces out of the catalog story', () => {
    const catalog = listSourceFiles().filter((file) => file.startsWith('src/app/catalog/'))
      .map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    expect(catalog).not.toMatch(/\bclass\s+(ActorContext|IdempotencyKeys)\b|\btype\s+PageState\b|\bfunction\s+(parseMoney|formatMoney)\b/);
    expect(listSourceFiles()).not.toContain('src/app/catalog/model/money.ts');
  });
});

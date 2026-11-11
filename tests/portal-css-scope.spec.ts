import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Pillar 6 (CSS), scope half: one stylesheet, src/styles/portal.css; every rule under .crp-root, every class named crp-<feature>-*,
// and no CSS inside the components (no styles: / styleUrls:), so nothing leaks into or out of the shell.
const css = readFileSync('src/styles/portal.css', 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const selectors = rules.map((rule) => rule.selector).filter((selector) => !selector.startsWith('@'))
  .flatMap((selector) => selector.split(',').map((part) => part.trim()));

describe('portalCssIsScopedAndPrefixed', () => {
  it('scopes every rule under .crp-root', () => {
    expect(selectors.filter((selector) => !selector.startsWith('.crp-root'))).toEqual([]);
  });

  it('names every class of the stylesheet with crp-', () => {
    const classes = selectors.flatMap((selector) => [...selector.matchAll(/\.([\w-]+)/g)].map(([, name]) => name));
    expect(classes.filter((name) => !name.startsWith('crp-'))).toEqual([]);
  });

  it('keeps CSS out of the components and every template class under crp-', () => {
    const sources = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(listSourceFiles().filter((file) => /\.(css|scss)$/.test(file))).toEqual(['src/styles/portal.css']);
    const styled = sources.filter((file) => /\bstyles\s*:|\bstyleUrls?\s*:/.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(styled).toEqual([]);
    const loose = sources.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bclass="([^"]*)"/g)]
      .flatMap(([, names]) => names.replace(/\{\{[^}]*\}\}/g, ' ').split(/\s+/).filter((name) => name && !name.startsWith('crp-')).map((name) => `${file}: ${name}`)));
    expect(loose).toEqual([]);
  });
});

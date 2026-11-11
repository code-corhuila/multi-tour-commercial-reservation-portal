import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Pillar 6 (CSS): one stylesheet, src/styles/portal.css; colours only as --crp-* tokens declared in the .crp-root
// token block (values from the mockup main.css); the portal stays in its column and keeps the shell CSP (no url(), no @import).
const css = readFileSync('src/styles/portal.css', 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

describe('portalCssUsesOnlyItsColourTokens', () => {
  it('declares the --crp-* tokens of the mockup on .crp-root', () => {
    const root = rules.find((rule) => rule.selector === '.crp-root')!;
    expect(root.body).toMatch(/--crp-bg:\s*#f5f7f7;/);
    expect(root.body).toMatch(/--crp-text:\s*#17252b;/);
    expect(root.body).toMatch(/--crp-accent:\s*#2f6b57;/);
    expect(root.body).toMatch(/--crp-error:\s*#b34a4a;/);
  });

  it('writes a colour literal only as the value of a --crp-* token', () => {
    const literals = rules.flatMap(({ selector, body }) => body.split(';')
      .filter((declaration) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(declaration) && !/^\s*--crp-[\w-]+\s*:/.test(declaration))
      .map((declaration) => `${selector} { ${declaration.trim()} }`));
    expect(literals).toEqual([]);
  });

  it('has no viewport bleed, no fixed or sticky position and no z-index', () => {
    expect(code).not.toMatch(/100vmax|100vw|100vh|clip-path|z-index/);
    expect(code).not.toMatch(/position:\s*(fixed|sticky)/);
  });

  it('keeps the shell CSP: no !important, no @import, no @font-face and no url()', () => {
    expect(code).not.toMatch(/!important|@import|@font-face|url\(/);
  });
});

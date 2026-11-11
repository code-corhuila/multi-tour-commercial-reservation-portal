import { readFileSync } from 'node:fs';

/**
 * portal.css with every var(--crp-*) that points at a colour literal replaced by that literal, so a spec can still
 * assert the value a rule resolves to while the stylesheet itself carries colours only as tokens (pillar 6).
 */
export function resolvedPortalCss(): string {
  const css = readFileSync('src/styles/portal.css', 'utf8');
  const tokens = new Map([...css.matchAll(/(--crp-[\w-]+):\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*;/gi)].map(([, name, value]) => [name, value]));
  return css.replace(/var\((--crp-[\w-]+)\)/g, (whole, name: string) => tokens.get(name) ?? whole);
}

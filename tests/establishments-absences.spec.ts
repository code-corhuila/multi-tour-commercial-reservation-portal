import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

const actions = /delete|remove|erase|destroy|borrar|eliminar|suprimir/gi;
const fields = /\b(?:room|dish|menu|seat|rate|availability)s?\b|\b(?:room|dish|menu|seat|rate|availability)[A-Z_]/gi;
const featureFiles = () => listSourceFiles().filter((file) => file.startsWith('src/app/establishments/'));
function surfaces(): Array<{ file: string; text: string }> {
  return featureFiles().flatMap((file) => {
    const code = withoutComments(readFileSync(file, 'utf8'));
    if (file.endsWith('.routes.ts') || file.includes('/data/')) { return [{ file, text: code }]; }
    // Field metadata outside the inline template can also render a forbidden column or control.
    return Array.from(code.matchAll(/template:\s*`([\s\S]*?)`/g), () => ({ file, text: code.replace(/<!--[\s\S]*?-->/g, '') }));
  });
}
describe('routeMapTemplatesAndApiServiceDeclareNoDeleteAction', () => {
  it('finds no prohibited action on any of the three establishments surfaces', () => {
    expect(surfaces().filter(({ text }) => [...text.matchAll(actions)].length)).toEqual([]);
  });
});
describe('routeMapTemplatesAndApiServiceDeclareNoRoomDishMenuSeatRateOrAvailability', () => {
  it('finds none of the six forbidden fields on routes, templates or data services', () => {
    expect(surfaces().filter(({ text }) => [...text.matchAll(fields)].length)).toEqual([]);
  });
  it('reads a route, a page template, the form template and a writer rather than passing on absent files', () => {
    for (const fragment of ['.routes.ts', '/pages/', '/components/', 'writer.ts']) {
      expect(surfaces().some(({ file }) => file.includes(fragment))).toBe(true);
    }
  });
  it('detects each forbidden field and action on representative surfaces', () => {
    for (const text of ['room', 'dish', 'menu', 'seat', 'rate', 'availability']) {
      expect([...`<th>${text}</th>`.matchAll(fields)].length).toBeGreaterThan(0);
    }
    for (const text of ['delete', 'remove', 'erase', 'destroy', 'borrar', 'eliminar', 'suprimir']) {
      expect([...`<button>${text}</button>`.matchAll(actions)].length).toBeGreaterThan(0);
    }
  });
});

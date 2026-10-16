import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Pillar 8 (idempotent writes): every operation of a write port receives the Idempotency-Key, in its parameters or in its command.

const sources = listSourceFiles().filter((f) => f.endsWith('.ts') && !f.startsWith('src/app/demo/')).map((f) => ({ file: f, text: withoutComments(readFileSync(f, 'utf8')) }));

/** Operations that carry no key on purpose, with why (RN-P6): a repeated call leaves the same state. */
const NO_KEY_BY_NATURE: Readonly<Record<string, string>> = {
  'CatalogItemsWriter.update': 'api plan D-06: only creation takes the key; an update with the same body leaves the same item',
  'CatalogItemsWriter.inactivate': 'a status action: inactivating twice leaves the same state',
  'CatalogItemsWriter.reactivate': 'a status action: reactivating twice leaves the same state',
  'AssociatedEstablishmentsWriter.inactivate': 'a transition to a target state: repeating it changes nothing',
  'AssociatedEstablishmentsWriter.reactivate': 'a transition to a target state: repeating it changes nothing',
};

const WRITE_PORT = /export abstract class (\w+(?:Writer|Extender))\s*\{/g;
const OPERATION = /abstract (\w+)\(([^)]*)\)\s*:/g;

/** Every `abstract op(params)` of a write port, found by scanning to the matching closing brace of the class. */
function operations(): { port: string; op: string; params: string; file: string }[] {
  return sources.flatMap(({ file, text }) => [...text.matchAll(WRITE_PORT)].flatMap((m) => {
    let depth = 1, i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (depth > 0 && i < text.length) { depth += text[i] === '{' ? 1 : text[i] === '}' ? -1 : 0; i += 1; }
    return [...text.slice(start, i).matchAll(OPERATION)].map((o) => ({ port: m[1], op: o[1], params: o[2], file }));
  }));
}

/** true when a command type named in the parameters declares idempotencyKey. */
const commandCarriesKey = (params: string) =>
  [...params.matchAll(/:\s*(\w+)/g)].some(([, type]) => sources.some(({ text }) => new RegExp(String.raw`interface ${type}\b[^{]*[{][^}]*idempotencyKey`).test(text)));

describe('writePortsTakeTheIdempotencyKey', () => {
  const found = operations();

  it('finds the write ports of the portal', () => {
    expect(new Set(found.map((o) => o.port)).size).toBeGreaterThanOrEqual(14);
  });

  it('gives every operation the key in its parameters or in its command, or lists it as idempotent by nature', () => {
    const without = found.filter((o) => !o.params.includes('idempotencyKey') && !commandCarriesKey(o.params)).map((o) => `${o.port}.${o.op}`);
    expect(without.filter((name) => !(name in NO_KEY_BY_NATURE)).sort()).toEqual([]);
  });

  it('keeps the list of exceptions honest: each one still exists and still has no key', () => {
    const without = found.filter((o) => !o.params.includes('idempotencyKey') && !commandCarriesKey(o.params)).map((o) => `${o.port}.${o.op}`);
    expect(Object.keys(NO_KEY_BY_NATURE).filter((name) => !without.includes(name))).toEqual([]);
  });

  it('keeps the key in the input of the reservation change types, whose submit(input) takes no other parameter', () => {
    const text = sources.find((s) => s.file.endsWith('reservation-changes/data/reservation-change-types.ts'))!.text;
    expect(text).toMatch(/interface ReservationChangeInput\s*\{[^}]*idempotencyKey: string/);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pillar 13 (weight): the mounted module has a size budget that fails the build when it is passed or removed.

const read = (file: string) => readFileSync(file, 'utf8');
const budget = (): Record<string, { maxBytes: number }> => JSON.parse(read('scripts/bundle-budget.json'));

describe('bundleBudget', () => {
  it('sets a positive limit for portal.js and for portal.css', () => {
    const limits = budget();
    expect(Object.keys(limits).sort()).toEqual(['dist/portal.css', 'dist/portal.js']);
    for (const { maxBytes } of Object.values(limits)) expect(maxBytes).toBeGreaterThan(0);
  });

  it('is declared for the module target of angular.json', () => {
    const module = JSON.parse(read('angular.json')).projects['commercial-reservation-portal'].architect.module;
    expect(module.options.budgets?.some((b: { type: string; maximumError?: string }) => b.type === 'initial' && b.maximumError)).toBe(true);
  });

  it('is checked by a step of the CI after the module is built', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/run: node scripts\/check-bundle-size\.mjs/);
  });

  const run = (dir: string) => {
    try { execFileSync('node', [join(process.cwd(), 'scripts/check-bundle-size.mjs')], { cwd: dir, stdio: 'pipe' }); return 0; }
    catch (error) { return (error as { status: number }).status; }
  };
  const project = (js: number, css: number) => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-'));
    mkdirSync(join(dir, 'dist')); mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/bundle-budget.json'), JSON.stringify({ 'dist/portal.js': { maxBytes: 100 }, 'dist/portal.css': { maxBytes: 50 } }));
    writeFileSync(join(dir, 'dist/portal.js'), 'x'.repeat(js)); writeFileSync(join(dir, 'dist/portal.css'), 'x'.repeat(css));
    return dir;
  };

  it('passes inside the limits and fails past either one', () => {
    expect(run(project(100, 50))).toBe(0);
    expect(run(project(101, 50))).toBe(1);
    expect(run(project(100, 51))).toBe(1);
  });

  it('fails when the budget file is missing or a built file is missing', () => {
    const noBudget = project(1, 1); writeFileSync(join(noBudget, 'scripts/bundle-budget.json'), '{}');
    expect(run(noBudget)).toBe(1);
    expect(run(mkdtempSync(join(tmpdir(), 'budget-')))).toBe(1);
  });
});

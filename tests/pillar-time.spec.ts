import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tenantDateTime } from '../src/app/payments/payment-followup-copy';
import { tenantDay, tenantWallTime } from '../src/app/shared/clock';
import { listSourceFiles, withoutComments } from './source-files';

// Pillar 2 (rules and time): "today" is the tenant's day (America/Bogota, UTC-5), read from the Clock, never the browser's zone.

describe('tenantDay', () => {
  it('is the calendar day in Bogota, not the UTC or the browser one', () => {
    expect(tenantDay(Date.parse('2026-10-14T03:00:00Z'))).toBe('2026-10-13');
    expect(tenantDay(Date.parse('2026-10-14T05:00:00Z'))).toBe('2026-10-14');
  });
});

describe('noViewReadsTheBrowserClock', () => {
  it('has no new Date, Date.now or toLocale*String in a page or a component', () => {
    const views = listSourceFiles().filter((f) => /\/(pages|components)\/[^/]+\.ts$/.test(f) && !f.startsWith('src/app/demo/'));
    expect(views.length).toBeGreaterThan(20);
    const offenders = views.filter((f) => /new Date\(|Date\.now|toLocale\w*String/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('tenantWallTime', () => {
  it('reads an instant with any offset as the tenant wall clock, from the shared clock', () => {
    expect(tenantWallTime('2026-10-10T15:00:00Z')).toBe('2026-10-10T10:00:00.000Z');
    expect(tenantWallTime('2026-10-10T03:30:00Z')).toBe('2026-10-09T22:30:00.000Z');
    expect(tenantWallTime('2026-10-10T10:00:00-05:00')).toBe('2026-10-10T10:00:00.000Z');
  });
});

describe('tenantDateTime', () => {
  it('writes the tenant day and hour of an instant', () => {
    expect(tenantDateTime('2026-10-10T15:00:00Z')).toBe('10 oct 2026 · 10:00');
    expect(tenantDateTime('2026-10-10T03:30:00Z')).toBe('09 oct 2026 · 22:30');
  });

  it('does not repeat the five hour offset by hand: it lives in shared/clock.ts only', () => {
    const copy = withoutComments(readFileSync('src/app/payments/payment-followup-copy.ts', 'utf8'));
    expect(copy).not.toMatch(/5 \* 60|3_?600_?000|18_?000_?000/);
    expect(copy).toContain("shared/clock");
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tenantDay } from '../src/app/shared/clock';
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

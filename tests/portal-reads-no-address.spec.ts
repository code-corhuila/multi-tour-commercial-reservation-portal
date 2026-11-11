import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Lesson 12 (008-): the portal never reads the address; the container owns the URL and hands parameters over
// PortalNavigation or MountProps.initialParams. HU-COM-009 plan D-06: the only exception is the e2e hook of the
// demo build, src/app/demo/demo-fixtures.ts (?demoFixtures, ?demoNow), which the production module never imports.
const ONLY_READER = 'src/app/demo/demo-fixtures.ts';

describe('portalReadsNoAddress', () => {
  it('reads location only in the demo fixtures of the demo build', () => {
    const readers = listSourceFiles().filter((file) => file.endsWith('.ts'))
      .filter((file) => /\blocation\b/.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(readers).toEqual([ONLY_READER]);
  });
});

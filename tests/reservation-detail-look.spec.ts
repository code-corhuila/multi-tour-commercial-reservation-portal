import { describe, expect, it } from 'vitest';
import { resolvedPortalCss } from './css-tokens';

// admin-detalle-reserva.html (10A, mockup PDR v1.9): the hero is dark green with light text, the access note and the panels have the mockup surface and
// the lists of values are compact (small gray label, darker value, a line under each row). Measured on the mockup with RES-1842.
const css = resolvedPortalCss().replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};
const detail = '.crp-root .crp-reservations-detail';

describe('theHeroOfTheDetailIsDarkGreen', () => {
  it('paints the hero #193d3a with the 24px 28px padding of the mockup', () => {
    expect(ruleOf(`${detail} .crp-reservations-hero`)).toMatch(/background:\s*#193d3a;/i);
    expect(ruleOf(`${detail} .crp-reservations-hero`)).toMatch(/padding:\s*24px 28px;/);
  });

  it('writes the code in light green, the title in white and the departure line in pale green', () => {
    expect(ruleOf(`${detail} .crp-reservations-hero .crp-operator-eyebrow`)).toMatch(/color:\s*#bde3d7;/i);
    expect(ruleOf(`${detail} .crp-reservations-hero h2`)).toMatch(/color:\s*#ffffff;[^}]*font-size:\s*1\.612rem;/i);
    expect(ruleOf(`${detail} .crp-reservations-hero p:not(.crp-operator-eyebrow)`)).toMatch(/color:\s*#cbe3dc;/i);
  });
});

describe('theNoteAndThePanelsHaveTheMockupSurface', () => {
  it('draws the access note as a pale green box with its border', () => {
    const rule = ruleOf(`${detail} > p.crp-operator-copy`);
    expect(rule).toMatch(/background:\s*#f4faf7;/i);
    expect(rule).toMatch(/border:\s*1px solid #dce9e2;/i);
    expect(rule).toMatch(/color:\s*#5c6c6b;/i);
  });

  it('gives the panels the warm white, the #dce5df border and the soft shadow', () => {
    const rule = ruleOf(`${detail} .crp-operator-panel`);
    expect(rule).toMatch(/border-color:\s*#dce5df;/i);
    expect(rule).toMatch(/background:\s*rgba\(255, 254, 251, 0\.94\);/);
    expect(rule).toMatch(/box-shadow:\s*var\(--crp-shadow-panel\);/);
    expect(css).toMatch(/--crp-shadow-panel:\s*0 13px 26px rgba\(25, 52, 47, 0\.035\);/);
  });
});

describe('theListsOfValuesAreCompact', () => {
  it('writes the label small and gray, the value darker, and a line under each row', () => {
    expect(ruleOf(`${detail} .crp-reservations-lines dt`)).toMatch(/color:\s*#718084;[^}]*font-size:\s*0\.77rem;/i);
    expect(ruleOf(`${detail} .crp-reservations-lines dd`)).toMatch(/color:\s*#334547;[^}]*font-size:\s*0\.82rem;/i);
    expect(ruleOf(`${detail} .crp-reservations-lines div`)).toMatch(/border-bottom:\s*1px solid #e5ece7;/i);
  });
});

describe('theHeaderKickerIsGreenLikeTheMockup', () => {
  it('colors the kicker of the operator header #1f4d3d', () => {
    expect(ruleOf('.crp-root .crp-page-header-eyebrow')).toMatch(/color:\s*#1f4d3d;/i);
  });
});

describe('theActionsOfTheHeaderStayOnTheRight', () => {
  it('keeps the group of header actions on the right, also when it wraps under the title', () => {
    const rule = ruleOf('.crp-root .crp-page-header .crp-header-actions');
    expect(rule).toMatch(/margin-left:\s*auto;/);
    expect(rule).toMatch(/justify-content:\s*flex-end;/);
  });
});

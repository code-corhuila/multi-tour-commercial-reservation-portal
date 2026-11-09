import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolvedPortalCss } from './css-tokens';

// HU-COM-010 / HU-COM-016, tables of admin-pagos.html and admin-solicitudes-devolucion.html: the status pills keep the mockup colors, the actions of a row
// are tidy pills without a loose separator and the refund list fits a normal screen without a horizontal bar.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const resolved = resolvedPortalCss().replace(/\r\n/g, '\n');
const ruleOf = (source: string, selector: string) => {
  const start = source.indexOf(`\n${selector} {`);
  return start < 0 ? '' : source.slice(start, source.indexOf('}', start) + 1);
};

describe('theStatusPillsOfThePaymentsTableKeepTheirColors', () => {
  it('does not reset the background and the color of the pills inside the payments table', () => {
    expect(css).not.toMatch(/crp-proof-review-hero ~ \.crp-operator-panel \.crp-operator-table \.crp-operator-status/);
  });

  it('colors the pending, approved and rejected pills as the mockup does', () => {
    const rule = (state: string) => ruleOf(resolved, `.crp-root .crp-status.crp-is-${state}, .crp-root .crp-operator-status.crp-is-${state}`);
    expect(rule('pending')).toMatch(/background:\s*#fff1dc;\s*color:\s*#a4621e;/i);
    expect(rule('confirmed')).toMatch(/background:\s*#ddf0e7;\s*color:\s*#17685f;/i);
    expect(rule('cancelled')).toMatch(/background:\s*#f6e5e1;\s*color:\s*#a34a38;/i);
  });
});

describe('theActionsOfARowAreTidy', () => {
  it('hides the loose separator and leaves a gap between the action pills', () => {
    expect(ruleOf(css, '.crp-root .crp-row-sep')).toMatch(/display:\s*none;/);
    expect(ruleOf(css, '.crp-root .crp-operator-table td:last-child button')).toMatch(/margin:\s*3px 8px 3px 0;/);
  });
});

describe('theRefundListFitsANormalScreen', () => {
  it('lets the refund table shrink to the content column', () => {
    expect(ruleOf(css, '.crp-root .crp-refunds-table')).toMatch(/min-width:\s*0;/);
  });

  it('lets the pills and the action pills of every operator table wrap instead of drawing a horizontal bar', () => {
    expect(ruleOf(css, '.crp-root .crp-operator-table .crp-operator-status')).toMatch(/width:\s*auto;[^}]*white-space:\s*normal;/);
    expect(ruleOf(css, '.crp-root .crp-operator-table td:last-child button')).toMatch(/width:\s*auto;[^}]*white-space:\s*normal;/);
  });

  it('keeps a minimum width for the other tables that fits the content column at 1280px', () => {
    expect(ruleOf(css, '.crp-root .crp-table, .crp-root .crp-operator-table')).toMatch(/min-width:\s*720px;/);
  });
});

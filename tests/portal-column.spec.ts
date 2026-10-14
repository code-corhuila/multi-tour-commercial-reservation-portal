import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mount } from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';

// 001- amendment HC-3 (plan H-D3) and 008- H-D11: the container owns the page (ADR-007), so the portal
// draws only inside the element it is given. Replaces the three tests that asserted the mockup's
// page-wide header and footer and the fixed booking bar.
describe('portalCssHasNoViewportBleedNoFixedPositionAndNoZIndex', () => {
  const css = readFileSync('src/styles/portal.css', 'utf8');
  const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.trim().startsWith(selector + ' {'))?.split('{')[1] ?? '';

  it('has no viewport bleed, no fixed or sticky position and no z-index anywhere', () => {
    expect(css).not.toMatch(/100vmax|100vw|100vh/);
    expect(css).not.toMatch(/clip-path/);
    expect(css).not.toMatch(/position:\s*(fixed|sticky)/);
    expect(css).not.toMatch(/z-index/);
  });

  it('keeps no bottom padding reserved for a floating bar (144px, 210px)', () => {
    expect(css).not.toMatch(/\b144px\b|\b210px\b/);
    for (const selector of ['.crp-root .crp-booking-content', '.crp-root .crp-finish-content']) {
      expect(rule(selector), selector).toMatch(/width:\s*min\(100%, 1100px\);\s*margin:\s*0 auto;/);
    }
  });

  it('centres the client header and footer content in 1320px while their background stays in the portal element', () => {
    for (const selector of ['.crp-root .crp-client-header', '.crp-root .crp-client-footer']) {
      expect(rule(selector), selector).toMatch(/padding-inline:\s*max\(24px, calc\(\(100% - 1320px\) \/ 2\)\)/);
    }
  });

  it('lays the booking bar at the end of the booking column, in its flow', () => {
    const bar = rule('.crp-root .crp-booking-bar');
    expect(bar).toMatch(/width:\s*min\(100%, 1100px\);\s*margin:\s*0 auto 24px;/);
    expect(bar).not.toMatch(/transform|left:|bottom:/);
  });
});

// 001- amendment HC-5 (plan H-D4): the container hosts other portals, so the stylesheet leaves with the last portal.
describe('theStylesheetLeavesWithTheLastUnmount', () => {
  const props: MountProps = {
    apiClient: { request: async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }) } as never,
    session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined },
  };
  const links = () => document.head.querySelectorAll('link[data-crp-stylesheet]').length;

  it('keeps one link while a portal is mounted and removes it when the last one is unmounted', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const unmountFirst = mount(first, props);
    const unmountSecond = mount(second, props);
    expect(links()).toBe(1);
    unmountFirst();
    unmountFirst(); // a second cleanup of the same portal does not count twice
    expect(links()).toBe(1);
    unmountSecond();
    expect(links()).toBe(0);
    const again = mount(first, props);
    expect(links()).toBe(1);
    again();
    expect(links()).toBe(0);
    first.remove(); second.remove();
  });
});

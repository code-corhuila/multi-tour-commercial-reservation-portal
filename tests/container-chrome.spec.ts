import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

// HU-COM-001 container chrome: with chrome 'container' the portal draws no sidebar of its own and opens the area the container asks.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const request = async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } });
const propsFor = (extra: Partial<MountProps> = {}): MountProps => ({
  apiClient: { request } as never,
  session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined },
  ...extra,
});

let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountWith = (extra: Partial<MountProps> = {}) => {
  host = document.createElement('div');
  document.body.append(host);
  cleanup = entry.mountWith(host, propsFor(extra), demoSources);
};
const content = () => host.querySelector('.crp-operator-content');

afterEach(() => { cleanup?.(); host.remove(); });

describe('portalChromeOfTheContainer', () => {
  it('draws its own sidebar when the container does not say anything (compatibility)', async () => {
    mountWith();
    await expect.poll(() => host.querySelector('.crp-operator-sidebar')).toBeTruthy();
    expect(host.querySelector('.crp-operator-shell')?.classList.contains('crp-no-sidebar')).toBe(false);
  });

  it('draws no sidebar and keeps the content when the container owns the chrome', async () => {
    mountWith({ chrome: 'container' });
    await expect.poll(() => content()?.children.length ?? 0).toBeGreaterThan(0);
    expect(host.querySelector('.crp-operator-sidebar')).toBeNull();
    expect(host.querySelector('.crp-operator-shell')?.classList.contains('crp-no-sidebar')).toBe(true);
  });

  it('opens the area the container asks for in initialParams', async () => {
    mountWith({ chrome: 'container', initialParams: { area: 'discounts' } });
    await expect.poll(() => host.querySelector('.crp-operator-content h1')?.textContent).toBe('Descuentos');
  });

  it('falls back to the default area for an unknown area, without failing', async () => {
    mountWith({ chrome: 'container' });
    await expect.poll(() => host.querySelector('.crp-operator-content h1')?.textContent).toBeTruthy();
    const landing = host.querySelector('.crp-operator-content h1')?.textContent;
    cleanup?.(); host.remove();
    mountWith({ chrome: 'container', initialParams: { area: 'does-not-exist' } });
    await expect.poll(() => host.querySelector('.crp-operator-content h1')?.textContent).toBe(landing);
    expect(landing).not.toBe('Descuentos');
  });

  it('lays the shell out in one column without the sidebar, also on small screens', () => {
    expect(css).toMatch(/\.crp-root \.crp-operator-shell\.crp-no-sidebar \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  });
});

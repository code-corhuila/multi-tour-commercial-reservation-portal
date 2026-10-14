import { resolvedPortalCss } from './css-tokens';
import { describe, expect, it } from 'vitest';

/** The site header and footer of the portal look as tours.html (main.css .mt-site-header*, .mt-site-footer*). */
const css = resolvedPortalCss();
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

describe('siteHeaderLooksAsTheLanding', () => {
  it('draws the brand in one dark colour with wide letter-spacing, no orange TOUR', () => {
    const brand = ruleOf('.crp-root .crp-client-header .crp-client-brand');
    expect(brand).toMatch(/letter-spacing:\s*0\.16em;/);
    expect(brand).toMatch(/text-transform:\s*uppercase;/);
    expect(brand).toMatch(/color:\s*#111111;/);
    expect(ruleOf('.crp-root .crp-client-brand span, .crp-root .crp-client-footer-brand span')).toMatch(/color:\s*inherit;/);
    expect(css).not.toMatch(/crp-client-(?:footer-)?brand span[^{]*\{[^}]*--crp-cta/);
  });

  it('wraps the center links in a white-bordered pill whose active link is white and bold', () => {
    const nav = ruleOf('.crp-root .crp-client-nav');
    expect(nav).toMatch(/border-radius:\s*999px;/);
    expect(nav).toMatch(/border:\s*1px solid #e6ebe9;/);
    expect(nav).toMatch(/background:\s*#f7f9f8;/);
    const active = ruleOf('.crp-root .crp-client-header .crp-client-nav button.crp-is-active');
    expect(active).toMatch(/background:\s*#ffffff;/);
    expect(active).toMatch(/color:\s*#111111;/);
    expect(active).toMatch(/font-weight:\s*700;/);
  });

  it('draws Mis reservas as an outlined pill button', () => {
    const action = ruleOf('.crp-root .crp-client-header .crp-client-actions button');
    expect(action).toMatch(/border:\s*1px solid #d7e0de;/);
    expect(action).toMatch(/border-radius:\s*999px;/);
    expect(action).toMatch(/background:\s*#ffffff;/);
  });
});

describe('siteFooterLooksAsTheLanding', () => {
  it('is light: white background, #4b5a60 text, a #e3e7e6 top border and the dark spaced brand', () => {
    const footer = ruleOf('.crp-root .crp-client-footer');
    expect(footer).toMatch(/background:\s*#ffffff;/);
    expect(footer).toMatch(/color:\s*#4b5a60;/);
    expect(footer).toMatch(/border-top:\s*1px solid #e3e7e6;/);
    expect(css).not.toContain('#0c1a16');
    const brand = ruleOf('.crp-root .crp-client-footer-brand');
    expect(brand).toMatch(/color:\s*#111111;/);
    expect(brand).toMatch(/letter-spacing:\s*0\.16em;/);
    expect(ruleOf('.crp-root .crp-client-footer-col button, .crp-root .crp-client-footer-col span')).toMatch(/color:\s*#4b5a60;/);
  });
});

describe('catalogHeadIsCenteredAsTheLanding', () => {
  it('centres the eyebrow, the title and the search of Tours, and gives Buscar the dark pill button', () => {
    const head = ruleOf('.crp-root .crp-offer-head');
    expect(head).toMatch(/flex-direction:\s*column;/);
    expect(head).toMatch(/align-items:\s*center;/);
    expect(head).toMatch(/text-align:\s*center;/);
    expect(ruleOf('.crp-root .crp-offer-head .crp-offer-search')).toMatch(/border-radius:\s*999px;/);
    const search = ruleOf('.crp-root .crp-offer-head .crp-offer-search button');
    expect(search).toMatch(/background:\s*#17252b;/);
    expect(search).toMatch(/border-radius:\s*999px;/);
  });
});

describe('siteChromeKeepsThePillars', () => {
  it('adds no fixed position, z-index or 100vw to the site chrome', () => {
    const chrome = css.split('\n').filter((line) => /crp-client-(?:header|nav|brand|actions|footer)/.test(line)).join('\n');
    expect(chrome).not.toMatch(/position:\s*(?:fixed|sticky)|z-index|100vw/);
  });
});

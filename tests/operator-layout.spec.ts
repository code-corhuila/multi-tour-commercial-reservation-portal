import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 001- operator layout (admin audit 2026-10-13): header actions, heroes, form fields, row actions and the portal height
// as the mockup draws them (admin-detalle-reserva.html, admin-pagos.html, main.css operator-hero and operator-table).
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};
const noHex = (rule: string) => expect(rule.replace(/\{|\}/g, '')).not.toMatch(/#[0-9a-f]{3,8}\b/i);

const ROW_ACTIONS = '.crp-root .crp-table-wrap[data-state="data"] > .crp-operator-table td:last-child button, '
  + '.crp-root .crp-proof-review-hero ~ .crp-operator-panel .crp-operator-table td:last-child button';
const PAYMENTS_STATUS = '.crp-root .crp-proof-review-hero ~ .crp-operator-panel .crp-operator-table .crp-operator-status';

describe('operatorHeaderKeepsItsActionsTogetherOnTheRight', () => {
  it('pushes every header action to the right of the title block, as the actions group of 10A', () => {
    const main = ruleOf('.crp-root .crp-page-header-main');
    expect(main).toMatch(/margin-right:\s*auto;/);
    noHex(main);
  });

  it('takes the empty slot hosts out of the header flow, so they add no gap between the actions', () => {
    expect(ruleOf('.crp-root .crp-page-header > :empty')).toMatch(/display:\s*none;/);
  });
});

describe('operatorHeroesUseTheMockupGradient', () => {
  it('defines the operator-hero gradient of main.css as a token', () => {
    expect(ruleOf('.crp-root')).toContain('--crp-hero-gradient: linear-gradient(135deg, #e9f4ed, #fffefa 76%);');
  });

  it('paints the heroes of Pagos, Solicitudes de devolución and Reprogramación with the token, never flat grey', () => {
    for (const selector of ['.crp-root .crp-proof-review-hero', '.crp-root .crp-refunds-hero', '.crp-root .crp-rescheduling-hero']) {
      const rule = ruleOf(selector);
      expect(rule, selector).toMatch(/background:\s*var\(--crp-hero-gradient\);/);
      expect(rule, selector).not.toMatch(/background:\s*var\(--crp-accent-soft\)/);
      noHex(rule);
    }
  });
});

describe('operatorFormFieldsAsTheMockupGrid', () => {
  it('lets a textarea fill its cell, with the 92px height of operator-form-grid', () => {
    const rule = ruleOf('.crp-root .crp-operator-shell textarea');
    expect(rule).toMatch(/max-width:\s*none;/);
    expect(rule).toMatch(/min-height:\s*92px;/);
    noHex(rule);
  });

  it('keeps 16px between field rows, not only between columns', () => {
    const rule = ruleOf('.crp-root .crp-form-grid');
    expect(rule).toMatch(/gap:\s*16px;/);
    expect(rule).not.toMatch(/gap:\s*0 16px/);
  });
});

describe('operatorRowActionsArePillsAndPaymentStatusIsBoldText', () => {
  it('defines the row action colours of main.css as tokens', () => {
    const root = ruleOf('.crp-root');
    expect(root).toContain('--crp-row-action-bg: #e7f4ef;');
    expect(root).toContain('--crp-row-action-text: #0c7168;');
  });

  it('draws the last-cell actions of screens 10 and 13 as the mockup pills', () => {
    const rule = ruleOf(ROW_ACTIONS);
    expect(rule).toMatch(/min-height:\s*34px;/);
    expect(rule).toMatch(/padding:\s*0 11px;/);
    expect(rule).toMatch(/border-radius:\s*8px;/);
    expect(rule).toMatch(/background:\s*var\(--crp-row-action-bg\);/);
    expect(rule).toMatch(/color:\s*var\(--crp-row-action-text\);/);
    expect(rule).toMatch(/text-decoration:\s*none;/);
    noHex(rule);
  });

  it('keeps the screen 11 actions as text links', () => {
    expect(ruleOf('.crp-root .crp-operator-table button')).toMatch(/background:\s*transparent;/);
  });

  it('draws the ESTADO pills of screen 13 with the status colours of the mockup, not as plain text', () => {
    // 2026-10-21 (portal 06059888): Pagos reset the background and the color of its pills; the mockup colours them, so the reset rule is gone.
    expect(ruleOf(PAYMENTS_STATUS)).toBe('');
    expect(css).toMatch(/\.crp-root \.crp-operator-status\.crp-is-confirmed \{ background: var\(--crp-success-soft\); color: var\(--crp-success\); \}/);
    expect(css).toMatch(/\.crp-root \.crp-operator-status\.crp-is-pending \{ background: var\(--crp-warning-soft\); color: var\(--crp-warning\); \}/);
  });
});

describe('portalFillsTheHeightItIsGiven', () => {
  it('stretches the operator and client layouts down the portal element (the shell host), without viewport units', () => {
    const root = ruleOf('.crp-root');
    expect(root).toMatch(/display:\s*flex;/);
    expect(root).toMatch(/flex-direction:\s*column;/);
    expect(root).toMatch(/min-height:\s*100%;/);
    for (const selector of ['.crp-root .crp-operator-shell', '.crp-root .crp-client-shell']) {
      expect(ruleOf(selector), selector).toMatch(/flex:\s*1 0 auto;/);
    }
    expect(css).not.toMatch(/\d+d?vh\b|\d+svh\b|\d+lvh\b/);
  });
});

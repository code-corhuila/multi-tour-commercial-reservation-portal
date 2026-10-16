import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// HU-COM-008 amendment 2026-10-15: the client screen 21 drawn as finalizar-reserva.html (main.css: travel-booking-card,
// travel-checkout-*): compact type, 14px cards, two columns with a narrow summary, option cards with a small radio,
// the summary with the picture on top and a highlighted final value, and a compact bar. Presentation only.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};
const FINISH = '.crp-root .crp-finish-content';
const CONFIRM = '.crp-root .crp-self-service-confirm';

describe('theFinishScreenHasTheCompactTypeOfTheMockup', () => {
  it('sets a 1.2rem title and 0.98rem card headings, not the 2rem and 1.35rem of the first draft', () => {
    expect(ruleOf(`${CONFIRM} .crp-booking-topbar h1`)).toMatch(/font-size:\s*1\.2rem;\s*font-weight:\s*700;/);
    expect(ruleOf(`${FINISH} h2`)).toMatch(/font-size:\s*0\.98rem;\s*font-weight:\s*700;/);
  });

  it('draws the field labels at 0.78rem semibold and the inputs 38px high with an 8px radius', () => {
    expect(ruleOf(`${FINISH} .crp-finish-grid label`)).toMatch(/font-size:\s*0\.78rem;\s*font-weight:\s*600;/);
    const input = ruleOf(`${FINISH} input:not([type="checkbox"]):not([type="radio"]), ${FINISH} select`);
    expect(input).toMatch(/min-height:\s*38px;/);
    expect(input).toMatch(/border-radius:\s*8px;/);
  });

  it('draws the consents as plain 0.8rem lines, not bold labels', () => {
    expect(ruleOf(`${FINISH} .crp-self-service-consent`)).toMatch(/font-size:\s*0\.8rem;\s*font-weight:\s*400;/);
  });

  it('does not reserve a blank line under the consents and the method for an error that is not there', () => {
    expect(ruleOf(`${FINISH} .crp-self-service-field-error`)).toMatch(/min-height:\s*0;/);
  });
});

describe('theFinishCardsAndColumnsFollowTheMockup', () => {
  it('uses 14px cards padded 16px 18px', () => {
    const rule = ruleOf(`${FINISH} .crp-booking-card`);
    expect(rule).toMatch(/padding:\s*16px 18px;/);
    expect(rule).toMatch(/border-radius:\s*var\(--crp-radius-card\);/);
  });

  it('gives the main column the room the mockup gives it and the summary the narrow side', () => {
    const rule = ruleOf(".crp-root .crp-finish-layout");
    expect(rule).toMatch(/grid-template-columns:\s*minmax\(0, 2\.4fr\) minmax\(260px, 1fr\);/);
    expect(rule).toMatch(/gap:\s*20px;/);
  });

  it('left-aligns the pill as a rounded box, not a centred capsule', () => {
    const rule = ruleOf(`${FINISH} .crp-finish-pill`);
    expect(rule).toMatch(/justify-self:\s*start;/);
    expect(rule).toMatch(/border-radius:\s*10px;/);
    expect(rule).toMatch(/font-size:\s*0\.8rem;/);
  });

  it('shows the back link as plain text, without the round arrow button', () => {
    const arrow = ruleOf(`${CONFIRM} .crp-booking-back > span:first-child`);
    expect(arrow).toMatch(/border:\s*0;/);
    expect(arrow).toMatch(/background:\s*none;/);
    expect(ruleOf(`${CONFIRM} .crp-booking-back`)).toMatch(/white-space:\s*nowrap;/);
  });
});

describe('thePaymentTypeOptionsAreCardsWithASmallRadio', () => {
  it('keeps the radio at its natural size and the option text regular weight', () => {
    const radio = ruleOf(`${FINISH} .crp-checkout-option input[type="radio"]`);
    expect(radio).toMatch(/width:\s*auto;/);
    expect(radio).toMatch(/min-height:\s*0;/);
    const option = ruleOf(`${FINISH} .crp-checkout-option`);
    expect(option).toMatch(/padding:\s*11px 14px;/);
    expect(option).toMatch(/border-radius:\s*var\(--crp-radius-control\);/);
    expect(option).toMatch(/font-weight:\s*400;/);
  });

  it('puts the deadline rules in a tinted box', () => {
    const rule = ruleOf(`${FINISH} .crp-checkout-deadline`);
    expect(rule).toMatch(/background:\s*var\(--crp-muted-green\);/);
    expect(rule).toMatch(/border-radius:\s*var\(--crp-radius-control\);/);
  });
});

describe('theSummaryHasThePictureOnTopAndTheFinalValueHighlighted', () => {
  it('stacks the picture over the tour copy in one column', () => {
    expect(ruleOf(`${FINISH} .crp-finish-summary`)).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(ruleOf(`${FINISH} .crp-finish-media`)).toMatch(/min-height:\s*96px;/);
  });

  it('draws the tour name at 0.95rem, not the 1.6rem of the first draft', () => {
    expect(ruleOf(`${FINISH} .crp-finish-summary .crp-self-service-summary-copy strong`)).toMatch(/font-size:\s*0\.95rem;/);
  });

  it('numbers the discount line once: the line carries its own order', () => {
    expect(ruleOf(`${FINISH} .crp-self-service-breakdown ol`)).toMatch(/list-style:\s*none;\s*padding-left:\s*0;/);
  });

  it('highlights the final value row on a tinted background', () => {
    const rule = ruleOf(`${FINISH} .crp-self-service-pricing dt:last-of-type, ${FINISH} .crp-self-service-total`);
    expect(rule).toMatch(/background:\s*var\(--crp-surface-alt\);/);
    expect(ruleOf(`${FINISH} .crp-self-service-total`)).toMatch(/font-size:\s*1\.2rem;/);
  });
});

describe('theFinishFormStacksOnPhones', () => {
  it('puts the holder fields one per row below 760px, after the two-column rule that would override it', () => {
    const media = css.slice(css.indexOf('/* HU-COM-008 amendment 2026-10-15'));
    expect(media).toMatch(/@media \(max-width: 760px\) \{[^@]*\.crp-finish-content \.crp-finish-grid \{ grid-template-columns: 1fr; \}/);
  });

  it('keeps the pricing rows touching so the final value highlight is one band', () => {
    expect(ruleOf(`${FINISH} .crp-self-service-pricing`)).toMatch(/gap:\s*8px 0;/);
  });
});

describe('theBottomBarIsCompact', () => {
  it('uses the 14px bar with a 40px, 8px-radius button', () => {
    expect(ruleOf(`${CONFIRM} .crp-booking-bar`)).toMatch(/border-radius:\s*var\(--crp-radius-card\);/);
    const button = ruleOf(`${CONFIRM} .crp-booking-continue`);
    expect(button).toMatch(/min-height:\s*40px;/);
    expect(button).toMatch(/border-radius:\s*8px;/);
  });
});

describe('theNewRulesKeepThePortalConventions', () => {
  it('uses tokens for colours and no fixed, sticky, vh or z-index', () => {
    const block = css.slice(css.indexOf('/* HU-COM-008 amendment 2026-10-15'), css.indexOf('/* End of HU-COM-008 amendment 2026-10-15 */'));
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(block).not.toMatch(/position:\s*(fixed|sticky)|\d\s?vh\b|z-index/);
  });
});

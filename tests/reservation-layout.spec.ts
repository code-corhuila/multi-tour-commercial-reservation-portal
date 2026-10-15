import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { COMMERCIAL_NAME } from '../src/app/shell-contract';
import { reservationProviders, screenOf } from './reservations.double';

// HU-COM-007 amendment 2026-10-14: the layout of 10B as admin-crear-reserva.html draws it (main.css: operator-reservation-form,
// operator-hero, operator-form-grid, operator-reservation-summary, operator-form-actions).
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};
const noHex = (rule: string) => expect(rule.replace(/\{|\}/g, '')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
const SHELL_FORM = '.crp-root .crp-operator-shell .crp-reservations-form';

describe('theFormIsOneColumnOfFullWidthCards', () => {
  it('overrides the two-column grid every operator form gets, as the discount form does', () => {
    const rule = ruleOf(SHELL_FORM);
    expect(rule).toMatch(/display:\s*grid;/);
    expect(rule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(rule).toMatch(/gap:\s*22px;/);
    expect(ruleOf('.crp-root .crp-reservations-form .crp-operator-panel')).toMatch(/margin-top:\s*0;/);
  });

  it('draws the cards one under the other: intro, 01, 02, 03, 04 and the summary', async () => {
    const { element } = await screenOf(ReservationFormComponent, reservationProviders());
    const cards = Array.from(element.querySelectorAll('form.crp-reservations-form section.crp-reservations-intro, form.crp-reservations-form section.crp-operator-panel'));
    expect(cards.map((c) => c.querySelector('.crp-operator-eyebrow')?.textContent?.trim())).toEqual(
      ['Nueva reserva', '01. Cliente titular', '02. Tour, salida y viajeros', '03. Acompañantes', '04. Condiciones y pago', 'Valores calculados']);
    expect(cards[0].classList).toContain('crp-reservations-intro');
    for (const card of cards.slice(1)) expect(card.classList).toContain('crp-operator-panel');
  });
});

describe('theIntroCardHasTwoColumnsOnTheMockupGradient', () => {
  it('puts the kicker and the title on the left and the paragraph on the right', async () => {
    const { element } = await screenOf(ReservationFormComponent, reservationProviders());
    const intro = element.querySelector('.crp-reservations-intro')!;
    expect(Array.from(intro.children).map((c) => c.tagName)).toEqual(['DIV', 'P']);
    expect(intro.children[0].querySelector('.crp-operator-eyebrow')).toBeTruthy();
    expect(intro.children[0].querySelector('h2')).toBeTruthy();
  });

  it('uses the hero gradient token, the two columns and the radius of operator-hero', () => {
    const rule = ruleOf('.crp-root .crp-reservations-intro');
    expect(rule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s*minmax\(230px,\s*0\.7fr\);/);
    expect(rule).toMatch(/background:\s*var\(--crp-hero-gradient\);/);
    expect(rule).toMatch(/border-radius:\s*16px;/);
    noHex(rule);
  });
});

describe('theSummaryCardHasTheDescriptionOnTheLeftAndTheThreeFiguresInARow', () => {
  it('holds the heading block and the three figures side by side', async () => {
    const { element } = await screenOf(ReservationFormComponent, reservationProviders());
    const summary = element.querySelector('.crp-reservations-summary')!;
    expect(summary.children[0].querySelector('h2')?.textContent).toBe('Resumen de la reserva');
    const values = summary.querySelector('.crp-reservations-values')!;
    expect(Array.from(values.children).map((d) => d.querySelector('span')?.textContent)).toEqual(['Valor proyectado', 'Descuentos aplicables', 'Valor final']);
  });

  it('lays the figures in three columns, in the accent color of a token', () => {
    expect(ruleOf('.crp-root .crp-reservations-summary')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
    expect(ruleOf('.crp-root .crp-reservations-values')).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(120px,\s*1fr\)\);/);
    const figure = ruleOf('.crp-root .crp-reservations-values strong');
    expect(figure).toMatch(/color:\s*var\(--crp-/);
    noHex(figure);
  });
});

describe('theCardsHoldTheFieldsAsTheMockupGrid', () => {
  it('shows the companion counter beside the title and each companion in its own card', async () => {
    const { element } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(element.querySelector('.crp-operator-panel-head > .crp-customers-count')?.textContent).toBe('3 acompañantes requeridos');
    expect(element.querySelectorAll('.crp-customers-companion')).toHaveLength(3);
  });

  it('draws the acceptance as a labelled row and the conditions in a bordered box', async () => {
    const { element } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(element.querySelector('label.crp-reservations-check input[name="accepted"]')).toBeTruthy();
    expect(element.querySelector('.crp-reservations-conditions')).toBeTruthy();
  });

  it('makes tall rounded inputs that fill their cell, inside the form only', () => {
    const rule = ruleOf('.crp-root .crp-reservations-form input:not([type="checkbox"]), .crp-root .crp-reservations-form select');
    expect(rule).toMatch(/max-width:\s*none;/);
    expect(rule).toMatch(/min-height:\s*44px;/);
    expect(rule).toMatch(/border-radius:\s*9px;/);
    noHex(rule);
  });

  it('paints the disabled Registrar reserva in the muted green of the mockup', () => {
    const rule = ruleOf('.crp-root .crp-reservations-actions .crp-operator-primary:disabled');
    expect(rule).toMatch(/background:\s*var\(--crp-shade-b7c9c3\);/);
    noHex(rule);
  });

  it('boxes the conditions with a border and the soft card background', () => {
    const rule = ruleOf('.crp-root .crp-reservations-conditions');
    expect(rule).toMatch(/border:\s*1px solid/);
    expect(rule).toMatch(/border-radius:\s*11px;/);
    noHex(rule);
  });
});

describe('theLayoutIsResponsiveAndStaysInsideTheColumn', () => {
  it('goes to one column of fields and the summary under 860px, without viewport units or fixed positions', () => {
    const media = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(media).toMatch(/\.crp-reservations-intro,[^{]*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    const own = css.split('\n').filter((l) => /crp-reservations-(intro|summary|values|form|check|conditions)|crp-customers-count/.test(l)).join('\n');
    expect(own).not.toMatch(/\bvh\b|\d+vh|vmax|vmin|position:\s*(fixed|sticky)|z-index/);
  });
});

describe('theStripStaysAboveTheCards', () => {
  it('draws the strip before the form', async () => {
    const { element } = await screenOf(ReservationFormComponent, [...reservationProviders(), { provide: COMMERCIAL_NAME, useValue: 'Travesía Natural' }]);
    const strip = element.querySelector('.crp-reservations-tenant-context')!;
    expect(strip.compareDocumentPosition(element.querySelector('form')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

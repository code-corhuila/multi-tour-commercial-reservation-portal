import { resolvedPortalCss } from './css-tokens';
import { describe, expect, it } from 'vitest';
import { lastValueFrom } from 'rxjs';
import { DemoCurrentDiscountsStore, currentDiscountsProviders } from '../src/app/demo/current-discounts-demo';
import { TourValueSource } from '../src/app/public-offer/data/public-offer-sources';
import { PublicTour } from '../src/app/public-offer/model/public-offer';

/** Cards, agreement note, page background and back chevron look as tours.html / alojamiento.html (main.css, refinement block). */
const css = resolvedPortalCss();
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};
const tour = (serviceId: string, baseRateCents: number): PublicTour => ({ serviceId, commercialName: serviceId, baseRateCents, transportIncluded: false, available: true });

describe('demoTourValueFollowsTheCurrentDiscounts', () => {
  const provided = () => currentDiscountsProviders().find((provider) => (provider as { provide: unknown }).provide === TourValueSource) as { useValue: TourValueSource } | undefined;

  it('provides a TourValueSource that applies the rules in force to the base value of the tour', () => {
    const value = provided()!.useValue.valueOf(tour('demo-svc-1', 18_000_000), '2026-10-14');
    expect(value.baseRateCents).toBe(18_000_000);
    expect(value.currentValueCents).toBe(14_750_000);
  });

  it('leaves the base value for a tour whose rules are expired, inactive or absent', () => {
    const source = provided()!.useValue;
    expect(source.valueOf(tour('demo-svc-2', 14_500_000), '2026-10-14').currentValueCents).toBe(14_500_000);
    expect(source.valueOf(tour('demo-svc-9', 5_000_000), '2026-10-14').currentValueCents).toBe(5_000_000);
  });

  it('keeps the services of the existing demo store', async () => {
    expect((await lastValueFrom(new DemoCurrentDiscountsStore().list())).length).toBeGreaterThan(0);
  });
});

describe('tourCardsAreDelicateAsTheLanding', () => {
  it('uses a 14px radius, a #e3e7e6 border, a soft shadow and a 140px photo', () => {
    const card = ruleOf('.crp-root .crp-tour-card');
    expect(card).toMatch(/border:\s*1px solid #e3e7e6;/);
    expect(card).toMatch(/border-radius:\s*14px;/);
    expect(card).toMatch(/box-shadow:\s*0 2px 10px rgba\(23, 37, 43, 0\.04\);/);
    expect(ruleOf('.crp-root .crp-tour-media')).toMatch(/height:\s*140px;/);
  });

  it('writes the name at 0.95rem, the final price at 1.15rem and Ver detalle small', () => {
    expect(ruleOf('.crp-root .crp-tour-body strong')).toMatch(/font-size:\s*0\.95rem;/);
    expect(ruleOf('.crp-root .crp-tour-price em, .crp-root .crp-offer-from')).toMatch(/font-size:\s*1\.15rem;/);
    const button = ruleOf('.crp-root .crp-tour-meta button');
    expect(button).toMatch(/font-size:\s*0\.8rem;/);
    expect(button).toMatch(/min-height:\s*32px;/);
    expect(button).toMatch(/border-radius:\s*8px;/);
  });

  it('draws the discount tag at 0.76rem on the photo', () => {
    expect(ruleOf('.crp-root .crp-tour-media .crp-tour-discount-tag')).toMatch(/top:\s*14px;/);
    expect(ruleOf('.crp-root .crp-tour-discount-tag')).toMatch(/font-size:\s*0\.76rem;/);
  });
});

describe('agreementNoteIsADarkLeftBorderNote', () => {
  it('is a compact grey note with a dark left border', () => {
    const note = ruleOf('.crp-root .crp-offer-agreement');
    expect(note).toMatch(/border-left:\s*3px solid #17252b;/);
    expect(note).toMatch(/background:\s*#f7f9f8;/);
    expect(note).toMatch(/border-radius:\s*10px;/);
    expect(note).not.toContain('#fffdf7');
    expect(ruleOf('.crp-root .crp-offer-agreement h2')).toMatch(/font-size:\s*0\.95rem;/);
  });
});

describe('pageBackgroundAndBackChevron', () => {
  it('leaves the client shell white around the canvas', () => {
    expect(ruleOf('.crp-root .crp-client-shell')).toMatch(/background:\s*#ffffff;/);
  });

  it('draws the Volver arrow as a chevron without a data URI', () => {
    expect(css).not.toMatch(/https?:\/\//);
    expect(ruleOf('.crp-root .crp-offer-back > span:first-child')).toMatch(/font-size:\s*0;/);
    const chevron = ruleOf('.crp-root .crp-offer-back > span:first-child::before');
    expect(chevron).toMatch(/rotate\(45deg\)|rotate\(-135deg\)/);
    expect(chevron).toMatch(/border-(?:left|bottom)/);
  });
});

describe('clientScreensAreDelicateAsTheLanding', () => {
  it('writes the tour detail title at 1.6-2.1rem weight 700 and the conditions as a soft grey card', () => {
    const title = ruleOf('.crp-root .crp-offer-detail h1');
    expect(title).toMatch(/font-weight:\s*700;/);
    expect(title).not.toMatch(/letter-spacing:\s*-0\.04em/);
    const conditions = ruleOf('.crp-root .crp-offer-conditions');
    expect(conditions).toMatch(/background:\s*#f7f9f8;/);
    expect(conditions).toMatch(/padding:\s*4px 18px 14px;/);
    expect(conditions).toMatch(/border-radius:\s*12px;/);
  });

  it('draws the summary card flat and the reserve button dark, as the landing', () => {
    expect(ruleOf('.crp-root .crp-offer-summary')).toMatch(/box-shadow:\s*0 4px 16px rgba\(23, 37, 43, 0\.06\);/);
    const reserve = ruleOf('.crp-root .crp-offer-reserve');
    expect(reserve).toMatch(/background:\s*#17252b;/);
    expect(reserve).toMatch(/min-height:\s*42px;/);
  });

  it('softens the panel, Mis reservas and Mis pagos cards and their type', () => {
    expect(css).toMatch(/\.crp-root \.crp-panel-card, \.crp-root \.self-service-card, \.crp-root \.crp-my-payments-card \{[^}]*border-radius:\s*14px;[^}]*box-shadow:\s*0 2px 10px/);
    expect(css).toMatch(/\.crp-root \.crp-panel-hero h1[^{]*\{[^}]*font-weight:\s*700;/);
    expect(css).toMatch(/\.crp-root \.crp-my-payments-card-lines small[^{]*\{[^}]*font-size:\s*0\.8rem;/);
  });
});

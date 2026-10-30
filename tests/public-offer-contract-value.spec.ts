import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicOfferApiSource, PublicTourValueSource } from '../src/app/http/public-offer-api-sources';
import { PublicOfferSource, TourValueSource } from '../src/app/public-offer/data/public-offer-sources';
import { PublicTour } from '../src/app/public-offer/model/public-offer';
import { PublicOfferPageComponent } from '../src/app/public-offer/pages/public-offer-page.component';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { TourImages } from '../src/app/shared/tour-photo';
import { DemoTourImages } from '../src/app/demo/tour-photo-demo';

// HU-COM-006 AC-PO.4 and RN-PO4: the value shown is the one the service calculated (finalValueCents, discountPercentageBp of
// the contract, PROPOSED); the portal copies the percentage and derives no money (plan D-06).
const tour = (extra: Partial<PublicTour> = {}): PublicTour => ({ serviceId: 't-1', commercialName: 'Caminata Ficticia', baseRateCents: 15_000_000, transportIncluded: false, available: true, ...extra });
const client = {} as PortalApiClient;

describe('publicTourValueFromTheContract', () => {
  const value = new PublicTourValueSource();

  it('shows the value the service calculated and the percentage it wrote (AC-PO.4)', () => {
    expect(value.valueOf(tour({ finalValueCents: 13_500_000, discountPercentageBp: 1000 }), '2026-12-01'))
      .toEqual({ baseRateCents: 15_000_000, currentValueCents: 13_500_000, discountLabel: '10% de descuento' });
  });

  it('writes a fractional percentage with a decimal comma and no float arithmetic', () => {
    expect(value.valueOf(tour({ finalValueCents: 13_125_000, discountPercentageBp: 1250 }), '2026-12-01').discountLabel).toBe('12,5% de descuento');
    expect(value.valueOf(tour({ finalValueCents: 14_000_000, discountPercentageBp: 1 }), '2026-12-01').discountLabel).toBe('0,01% de descuento');
  });

  it('shows only the base value when no rule applies', () => {
    expect(value.valueOf(tour({ finalValueCents: 15_000_000, discountPercentageBp: null }), '2026-12-01'))
      .toEqual({ baseRateCents: 15_000_000, currentValueCents: 15_000_000 });
  });

  it('shows only the base value when the service sent no value', () => {
    expect(value.valueOf(tour(), '2026-12-01')).toEqual({ baseRateCents: 15_000_000, currentValueCents: 15_000_000 });
  });

  it('writes no tag when the value is not below the base, even if a percentage came', () => {
    expect(value.valueOf(tour({ finalValueCents: 15_000_000, discountPercentageBp: 1000 }), '2026-12-01').discountLabel).toBeUndefined();
  });

  it('is provided by the default sources', () => {
    expect(Injector.create({ providers: sourceProviders(client) }).get(TourValueSource)).toBeInstanceOf(PublicTourValueSource);
  });
});

describe('theOfferCardShowsTheValueOfTheContract', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('draws the tag, the value before and the value now of a tour with a rule, and only the base for one without', async () => {
    const answer = { data: [
      { serviceId: 't-1', commercialName: 'Caminata Ficticia', transportIncluded: false, baseValueCents: 15_000_000, finalValueCents: 13_500_000, discountPercentageBp: 1000, maxTravelers: 12 },
      { serviceId: 't-2', commercialName: 'Cascada Ficticia', transportIncluded: false, baseValueCents: 8_000_000, finalValueCents: 8_000_000, discountPercentageBp: null, maxTravelers: 8 },
    ], meta: { page: 1, limit: 100, total: 2, totalPages: 1 } };
    TestBed.configureTestingModule({ providers: [
      { provide: TourImages, useValue: new DemoTourImages() },
      { provide: PublicOfferSource, useValue: new PublicOfferApiSource({ request: async () => answer } as never, () => 'agencia-ficticia') },
      { provide: TourValueSource, useValue: new PublicTourValueSource() },
    ] });
    const fixture = TestBed.createComponent(PublicOfferPageComponent);
    const host = fixture.nativeElement as HTMLElement;
    for (let i = 0; i < 3; i++) { fixture.detectChanges(); await fixture.whenStable(); }
    const cards = Array.from(host.querySelectorAll<HTMLElement>('[data-part="tours"] [data-state="data"] li'));
    expect(cards.length).toBe(2);
    const read = (card: HTMLElement) => ({
      tag: card.querySelector('.crp-tour-discount-tag')?.textContent?.trim() ?? null,
      base: card.querySelector('[data-value="base"]')?.textContent?.replace(/\s/g, ' ').trim() ?? null,
      now: card.querySelector('[data-value="current"]')?.textContent?.replace(/\s/g, ' ').trim(),
    });
    expect(read(cards[0])).toEqual({ tag: '10% de descuento', base: '$150.000', now: '$135.000' });
    expect(read(cards[1])).toEqual({ tag: null, base: null, now: '$80.000' });
    expect(host.textContent).not.toMatch(/Hasta \d+ viajeros/);
  });
});

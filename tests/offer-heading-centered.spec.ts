import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicEstablishmentsSource, PublicOfferSource } from '../src/app/public-offer/data/public-offer-sources';
import { GastronomyOfferPageComponent, LodgingOfferPageComponent } from '../src/app/public-offer/pages/establishments-offer-page.component';
import { PublicOfferPageComponent } from '../src/app/public-offer/pages/public-offer-page.component';
import { TourImages } from '../src/app/shared/tour-photo';
import { DemoTourImages } from '../src/app/demo/tour-photo-demo';
import { ControllablePublicEstablishmentsSource, ControllablePublicOfferSource } from './public-offer-sources.double';

// The mockup (tours.html, alojamiento.html, gastronomia.html) centres the heading of the client offer
// pages: kicker, title and phrase. The shared page header keeps margin-right:auto, which in the
// column of .crp-offer-head pins the block to the left, so the offer heading resets it.
const PAGES = [
  { name: 'Tours', component: PublicOfferPageComponent, kicker: 'Catálogo de experiencias', title: 'Tours' },
  { name: 'Alojamiento', component: LodgingOfferPageComponent, kicker: 'Establecimientos asociados', title: 'Alojamiento' },
  { name: 'Gastronomía', component: GastronomyOfferPageComponent, kicker: 'Establecimientos asociados', title: 'Gastronomía' },
];

afterEach(() => TestBed.resetTestingModule());

describe('theOfferHeadingIsCentredLikeTheMockup', () => {
  for (const page of PAGES) {
    it(`draws the kicker and the title of ${page.name} inside the one centred offer heading`, async () => {
      TestBed.configureTestingModule({ providers: [
        { provide: TourImages, useValue: new DemoTourImages() },
        { provide: PublicOfferSource, useValue: new ControllablePublicOfferSource() },
        { provide: PublicEstablishmentsSource, useValue: new ControllablePublicEstablishmentsSource() },
      ] });
      const fixture = TestBed.createComponent(page.component);
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      const main = (fixture.nativeElement as HTMLElement).querySelector('header.crp-offer-head > .crp-page-header-main')!;
      expect(main.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe(page.kicker);
      expect(main.querySelector('h1')?.textContent?.trim()).toBe(page.title);
    });
  }

  it('centres the block of the heading and its phrase in one rule shared by the three pages', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';
    expect(rule('.crp-root .crp-offer-head')).toMatch(/align-items:\s*center;.*text-align:\s*center;/);
    expect(rule('.crp-root .crp-offer-head .crp-page-header-main')).toMatch(/margin:\s*0 auto;/);
    expect(rule('.crp-root .crp-offer-head .crp-page-header-desc')).toMatch(/margin-inline:\s*auto;/);
  });
});

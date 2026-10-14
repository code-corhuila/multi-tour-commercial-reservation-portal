import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { establishmentPhoto, tourPhoto } from '../src/app/shared/tour-photo';

describe('theProductionImageOfATourComesFromThePortAndStaysOnTheOrigin', () => {
  it('answers a resource of the container for a tour, and none without a tour', () => {
    const images = TestBed.inject(TourImages);
    expect(images.urlOf('tour-Suaza')).toMatch(/^\/assets\/[\w-]+\.jpg$/);
    expect(SITE_PHOTOS as readonly string[]).toContain(images.urlOf('tour-Suaza'));
    expect(images.urlOf(undefined)).toBeNull();
    expect(images.urlOf('')).toBeNull();
  });

  it('has no demo id and no hash assignment in the shared code of production', () => {
    const code = withoutComments(readFileSync('src/app/shared/tour-photo.ts', 'utf8'));
    expect(code).not.toMatch(/demo-svc|charCodeAt|>>> 0/);
    expect(listSourceFiles().some((file) => file === 'src/app/demo/tour-photo-demo.ts')).toBe(true);
  });
});

describe('aTourKeepsOnePhotoByItsIdInTheDemo', () => {
  it('gives the same tour the same self-hosted photo wherever it is drawn, and no photo without a tour', () => {
    expect(demoTourPhoto('tour-Suaza')).toBe(demoTourPhoto('tour-Suaza'));
    expect(demoTourPhoto('tour-Suaza')).toMatch(/^\/assets\/[\w-]+\.jpg$/);
    expect(demoTourPhoto(undefined)).toBeNull();
    expect(demoTourPhoto('')).toBeNull();
    expect(new Set(['svc-1', 'svc-2', 'svc-3', 'svc-4', 'svc-5', 'svc-6'].map(demoTourPhoto)).size).toBeGreaterThan(1);
  });

  it('shows the Tatacoa desert at sunset, not a waterfall, and the Suaza canoeing by the water', () => {
    expect(demoTourPhoto('demo-svc-1')).toBe('/assets/mountain-hero.jpg');
    expect(demoTourPhoto('demo-svc-3')).toBe('/assets/destino-cascadas-de-iraka.jpg');
  });

  it('chooses a tour without a fixed photo by a stable hash of its id, as the reservation summary does', () => {
    const photos = ['/assets/destino-sendero-del-condor.jpg', '/assets/destino-bahia-esmeralda.jpg', '/assets/destino-cascadas-de-iraka.jpg', '/assets/mountain-hero.jpg'];
    let hash = 0;
    for (const char of 'tour-Pitalito') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    expect(demoTourPhoto('tour-Pitalito')).toBe(photos[hash % photos.length]);
  });
});

describe('anEstablishmentKeepsThePhotoOfItsType', () => {
  it('shows a hotel for lodging and a restaurant for gastronomy, as alojamiento.html and gastronomia.html', () => {
    expect(establishmentPhoto('HOTEL')).toBe('/assets/alojamiento-asociado.jpg');
    expect(establishmentPhoto('RESTAURANT')).toBe('/assets/restaurante-asociado.jpg');
  });
});

describe('anEstablishmentKeepsThePhotoOfItsType', () => {
  it('shows a hotel for lodging and a restaurant for gastronomy, as alojamiento.html and gastronomia.html', () => {
    expect(establishmentPhoto('HOTEL')).toBe('/assets/alojamiento-asociado.jpg');
    expect(establishmentPhoto('RESTAURANT')).toBe('/assets/restaurante-asociado.jpg');
  });
});

import { describe, expect, it } from 'vitest';
import { tourPhoto } from '../src/app/shared/tour-photo';

describe('aTourKeepsOnePhotoByItsId', () => {
  it('gives the same tour the same self-hosted photo wherever it is drawn, and no photo without a tour', () => {
    expect(tourPhoto('tour-Suaza')).toBe(tourPhoto('tour-Suaza'));
    expect(tourPhoto('tour-Suaza')).toMatch(/^\/assets\/[\w-]+\.jpg$/);
    expect(tourPhoto(undefined)).toBeNull();
    expect(tourPhoto('')).toBeNull();
  });

  it('shows the Tatacoa desert at sunset, not a waterfall, and the Suaza canoeing by the water', () => {
    expect(tourPhoto('demo-svc-1')).toBe('/assets/mountain-hero.jpg');
    expect(tourPhoto('demo-svc-3')).toBe('/assets/destino-cascadas-de-iraka.jpg');
  });

  it('chooses a tour without a fixed photo by a stable hash of its id, as the reservation summary does', () => {
    const photos = ['/assets/destino-sendero-del-condor.jpg', '/assets/destino-bahia-esmeralda.jpg', '/assets/destino-cascadas-de-iraka.jpg', '/assets/mountain-hero.jpg'];
    let hash = 0;
    for (const char of 'tour-Pitalito') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    expect(tourPhoto('tour-Pitalito')).toBe(photos[hash % photos.length]);
  });
});

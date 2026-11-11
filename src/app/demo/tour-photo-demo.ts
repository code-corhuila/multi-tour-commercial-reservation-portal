import { Provider } from '@angular/core';
import { SITE_PHOTOS, TourImages } from '../shared/tour-photo';

// DEMO: the tours of the demo catalog whose landscape a hashed photo would contradict.
const FIXED: Readonly<Record<string, string>> = {
  'demo-svc-1': '/assets/mountain-hero.jpg', // Desierto de la Tatacoa al atardecer
  'demo-svc-2': '/assets/destino-sendero-del-condor.jpg', // Ruta del café en Pitalito
  'demo-svc-3': '/assets/destino-cascadas-de-iraka.jpg', // Canotaje en el Río Suaza
  'demo-svc-5': '/assets/destino-sendero-del-condor.jpg', // Caminata al Nevado del Huila
};

/** DEMO: the photo of a tour by its id, the same in every card and summary; null when there is no tour. */
export function demoTourPhoto(serviceId: string | undefined): string | null {
  if (!serviceId) return null;
  const fixed = FIXED[serviceId];
  if (fixed) return fixed;
  let hash = 0;
  for (const char of serviceId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SITE_PHOTOS[hash % SITE_PHOTOS.length];
}

export class DemoTourImages extends TourImages {
  override urlOf(serviceId: string | undefined): string | null { return demoTourPhoto(serviceId); }
}

export const tourImagesProviders = (): Provider[] => [{ provide: TourImages, useValue: new DemoTourImages() }];

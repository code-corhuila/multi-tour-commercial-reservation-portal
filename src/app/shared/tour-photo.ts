import { Injectable } from '@angular/core';

/** Self-hosted photos of the multi-tour-front container (same origin, CSP img-src 'self'). */
export const SITE_PHOTOS = ['/assets/destino-sendero-del-condor.jpg', '/assets/destino-bahia-esmeralda.jpg', '/assets/destino-cascadas-de-iraka.jpg', '/assets/mountain-hero.jpg'] as const;

/**
 * The image of a tour (pillar 9): the URL comes from this port, which must stay on the same origin (no blob:, no data:, no other host).
 * Production answers one resource of the container for every tour until the catalog API publishes the image of each one; the demo
 * build assigns a photo to each demo tour (src/app/demo/tour-photo-demo.ts).
 */
@Injectable({ providedIn: 'root', useFactory: () => new ContainerTourImages() })
export abstract class TourImages {
  /** The image of a tour by its id, the same in every card and summary; null when there is no tour. */
  abstract urlOf(serviceId: string | undefined): string | null;
}

class ContainerTourImages extends TourImages {
  override urlOf(serviceId: string | undefined): string | null { return serviceId ? SITE_PHOTOS[3] : null; }
}

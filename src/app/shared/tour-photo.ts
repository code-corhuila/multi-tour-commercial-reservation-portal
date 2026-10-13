/** Self-hosted photos of the multi-tour-front container (same origin, CSP img-src 'self'). */
export const SITE_PHOTOS = ['/assets/destino-sendero-del-condor.jpg', '/assets/destino-bahia-esmeralda.jpg', '/assets/destino-cascadas-de-iraka.jpg', '/assets/mountain-hero.jpg'] as const;

// DEMO: the tours of the demo catalog whose landscape a hashed photo would contradict. Debt: the tour image of the API when it exists.
const FIXED: Readonly<Record<string, string>> = {
  'demo-svc-1': '/assets/mountain-hero.jpg', // Desierto de la Tatacoa al atardecer
  'demo-svc-2': '/assets/destino-sendero-del-condor.jpg', // Ruta del café en Pitalito
  'demo-svc-3': '/assets/destino-cascadas-de-iraka.jpg', // Canotaje en el Río Suaza
  'demo-svc-5': '/assets/destino-sendero-del-condor.jpg', // Caminata al Nevado del Huila
};

/** The photo of a tour by its id, the same in every card and summary; null when there is no tour. */
export function tourPhoto(serviceId: string | undefined): string | null {
  if (!serviceId) return null;
  const fixed = FIXED[serviceId];
  if (fixed) return fixed;
  let hash = 0;
  for (const char of serviceId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SITE_PHOTOS[hash % SITE_PHOTOS.length];
}

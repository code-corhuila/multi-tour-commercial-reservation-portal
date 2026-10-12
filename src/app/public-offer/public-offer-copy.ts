/** Interface texts of the public offer, in one place; the wording follows tours.html, detalle-tour.html, alojamiento.html, gastronomia.html and restaurantes.html. */
export const PUBLIC_OFFER_COPY = {
  back: 'Volver al panel cliente',
  eyebrow: 'Catálogo de experiencias',
  title: 'Tours',
  description: 'Explora los tours disponibles y consulta sus detalles.',
  searchTours: 'Buscar tours por nombre',
  search: 'Buscar',
  date: 'Fecha de consulta',
  availableOn: 'Disponibles el',
  toursList: 'Listado de tours disponibles',
  from: 'Desde',
  before: 'Antes:',
  discountTag: 'Con descuento',
  transportIncluded: 'Transporte incluido',
  detail: 'Ver detalle',
  backToTours: 'Volver a tours',
  detailEyebrow: 'Detalle del tour',
  validityTitle: 'Vigencia y restricciones',
  validity: 'Vigencia',
  availableOnDay: 'Disponible el',
  transport: 'Transporte',
  conditionsTitle: 'Condiciones de reserva',
  conditions: [
    'La modificación o cancelación depende de las condiciones vigentes del tour.',
    'La disponibilidad y los valores se validan antes de registrar la reserva.',
  ],
  summary: 'Resumen comercial',
  agreementEyebrow: 'Información del convenio',
  agreementTitle: 'Coordina directamente con el establecimiento',
  contact: 'Contacto:',
  loadingTours: 'Cargando tours…',
  loadingEstablishments: 'Cargando establecimientos…',
  empty: 'Sin resultados para esta consulta.',
  requestFailed: 'No se pudo cargar la información.',
  retry: 'Reintentar',
  types: { HOTEL: 'Establecimiento asociado', RESTAURANT: 'Restaurante asociado' },
  pages: {
    HOTEL: {
      eyebrow: 'Establecimientos asociados', title: 'Alojamiento', search: '',
      description: 'Consulta datos de contacto de establecimientos asociados al operador.',
      agreement: 'Multitour no genera reservas de habitación, no administra tarifas, disponibilidad ni inventario. La coordinación se realiza directamente con cada establecimiento.',
    },
    RESTAURANT: {
      eyebrow: 'Sabores locales', title: 'Gastronomía', search: 'Buscar restaurantes por nombre',
      description: 'Datos de contacto para coordinar directamente tu visita.',
      agreement: 'Multitour no genera reservas de mesa, no administra tarifas, disponibilidad ni inventario de alimentación.',
    },
  },
} as const;

/** Self-hosted photos of the multi-tour-front container (same origin, CSP img-src 'self'); a card takes one by its position. */
const PHOTOS = ['/assets/destino-sendero-del-condor.jpg', '/assets/destino-bahia-esmeralda.jpg', '/assets/destino-cascadas-de-iraka.jpg', '/assets/mountain-hero.jpg'];
export function photoAt(position: number): string { return PHOTOS[position % PHOTOS.length]; }

/** The search of a client page: a name contains the words typed, ignoring case and accents. */
export function matchesSearch(name: string, query: string): boolean {
  const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  return plain(name).includes(plain(query));
}

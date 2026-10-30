/** Interface texts of the public offer, in one place; the wording follows tours.html, detalle-tour.html, alojamiento.html, gastronomia.html and restaurantes.html. */
export const PUBLIC_OFFER_COPY = {
  back: 'Volver al panel cliente',
  eyebrow: 'Catálogo de experiencias',
  placesEyebrow: 'Establecimientos asociados',
  title: 'Tours',
  searchTours: 'Buscar tours por nombre o destino',
  searchToursHint: 'Buscar tours por nombre o destino...',
  search: 'Buscar',
  date: 'Fecha',
  toursList: 'Listado de tours disponibles',
  from: 'Desde',
  before: 'Antes:',
  discountTag: (pct: number | string) => `${pct}% de descuento`,
  transportIncluded: 'Transporte incluido',
  detail: 'Ver detalle',
  backToTours: 'Volver a tours',
  detailEyebrow: 'Detalle del tour',
  validityTitle: 'Vigencia, capacidad y restricciones',
  validity: 'Vigencia',
  availableOnDay: 'Disponible el',
  capacity: 'Capacidad',
  maxTravelers: (travelers: number) => `Hasta ${travelers} viajeros`,
  transport: 'Transporte',
  conditionsTitle: 'Condiciones de reserva',
  conditions: [
    'La modificación o cancelación depende de las condiciones vigentes del tour.',
    'La disponibilidad y los valores se validan antes de registrar la reserva.',
  ],
  summary: 'Resumen comercial',
  validFrom: 'Vigente del',
  validTo: 'al',
  reserve: 'Elegir salida y reservar',
  departuresTitle: 'Salidas programadas',
  departuresNote: 'Cada reserva corresponde a una única salida. El cupo se controla por salida y se aparta con tu primer pago.',
  noDepartures: 'No hay salidas programadas disponibles para este tour por ahora.',
  departureFull: 'Salida llena: sin cupos disponibles',
  seatsLeft: (seats: number) => `${seats} ${seats === 1 ? 'cupo disponible' : 'cupos disponibles'}`,
  agreementEyebrow: 'Información del convenio',
  agreementTitle: 'Coordina directamente con el establecimiento',
  contact: 'Contacto:',
  seeContact: 'Ver contacto',
  venueTitle: 'Contacto',
  venueCoordinate: 'Coordina directamente con el establecimiento.',
  venueNoBooking: 'La plataforma no crea reservas de habitación ni de mesa, ni gestiona tarifas, disponibilidad o inventario. Las condiciones de reserva, cambio o cancelación se acuerdan entre tú y el establecimiento.',
  venueNoInfo: 'Sin información adicional registrada.',
  loadingTours: 'Cargando tours…',
  loadingEstablishments: 'Cargando establecimientos…',
  empty: 'Sin resultados para esta consulta.',
  requestFailed: 'No se pudo cargar la información.',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento asociado', RESTAURANT: 'Restaurante asociado' },
  pages: {
    HOTEL: {
      title: 'Alojamiento', back: 'Volver a alojamiento', list: 'Alojamientos asociados',
      description: 'Hoteles asociados al operador, con sus datos de contacto para que coordines directamente con ellos.',
      agreement: 'Multitour no genera reservas de habitación ni administra tarifas, disponibilidad o inventario. Las condiciones de reserva, cambio o cancelación se acuerdan directamente entre tú y el hotel.',
      noPlaces: 'No hay alojamientos asociados activos en este momento.',
    },
    RESTAURANT: {
      title: 'Gastronomía', back: 'Volver a gastronomía', list: 'Restaurantes asociados',
      description: 'Restaurantes asociados al operador, con sus datos de contacto para que coordines directamente con ellos.',
      agreement: 'Multitour no genera reservas de mesa ni administra tarifas, disponibilidad o inventario de alimentación. Las condiciones de reserva, cambio o cancelación se acuerdan directamente entre tú y el restaurante.',
      noPlaces: 'No hay restaurantes asociados activos en este momento.',
    },
  },
} as const;

/** The search of a client page: a name contains the words typed, ignoring case and accents. */
const plain = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export function matchesSearch(name: string, query: string): boolean { return plain(name).includes(plain(query)); }

/** Two names are the same tour when they differ only in case or accents (a departure carries the tour name, not its id). */
export function sameName(a: string, b: string): boolean { return plain(a) === plain(b); }

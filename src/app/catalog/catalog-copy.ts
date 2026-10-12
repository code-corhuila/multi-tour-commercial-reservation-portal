import { CatalogItem, CatalogServiceType } from './model/catalog-item';

/** Interface texts of the catalog list, in one place; the wording follows screen 11 (`admin-gestionar-catalogo.html`). */
export const CATALOG_COPY = {
  eyebrow: 'Catálogos',
  title: { all: 'Gestionar catálogo', TOUR: 'Gestionar tours', TRANSPORTATION: 'Gestionar transporte' },
  panelEyebrow: 'Tours y atractivos',
  // The screen says "Oferta, salidas y tarifas base"; departures belong to another story and stay out.
  panelTitle: 'Oferta y tarifas base',
  panelCopy: 'Desactivar evita nuevas reservas; el historial existente se conserva.',
  denied: 'No tienes acceso al catálogo.',
  // The screen's "Vigencia" column has no field in the catalog record, so it is not drawn.
  columns: { service: 'Servicio', rate: 'Tarifa base', status: 'Estado', actions: 'Acción' },
  newItem: 'Nuevo servicio',
  editItem: 'Editar servicio',
  edit: 'Gestionar',
  inactivate: 'Desactivar',
  reactivate: 'Activar',
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { TOUR: 'Tour', TRANSPORTATION: 'Transporte' } satisfies Record<CatalogServiceType, string>,
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<CatalogItem['catalogStatus'], string>,
} as const;

import { CatalogItem } from './model/catalog-item';

/** Interface texts of the tour list and form, in one place; the wording is that of `admin-gestionar-catalogo.html` and `admin-configurar-catalogo.html` (mockup PDR v1.9). */
export const CATALOG_COPY = {
  eyebrow: 'Catálogos',
  title: 'Gestionar catálogo de tours',
  panelEyebrow: 'Tours y atractivos',
  panelTitle: 'Oferta, salidas y tarifas base',
  panelCopy: 'Inactivar evita nuevas reservas; el historial existente se conserva y un tour inactivo puede reactivarse. Solo el Administrador del tenant crea, actualiza, inactiva y reactiva tours.',
  denied: 'No tienes acceso al catálogo.',
  // The list shows tours only: transport capacity and departures belong to operations-cost (spec A.2 row 2).
  columns: { service: 'Tour', rate: 'Tarifa base', validity: 'Vigencia', status: 'Estado', actions: 'Acción' },
  newItem: 'Crear tour',
  editItem: 'Configurar tour',
  backToCatalogs: 'Volver a catálogos',
  // A record the contract returns without validity (gap G-B) is shown as a dash, never with invented dates.
  noValidity: '—',
  edit: 'Gestionar',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  // The container turns the server's 422 BUSINESS_RULE_VIOLATION into a generic English text; this is the reason the person needs (AC-P1.8).
  capacityBelowHeldSeats: 'La capacidad no puede ser menor que los cupos ya retenidos en una salida programada.',
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<CatalogItem['catalogStatus'], string>,
} as const;

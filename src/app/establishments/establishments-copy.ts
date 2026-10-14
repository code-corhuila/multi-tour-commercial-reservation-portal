import { AssociationStatus, EstablishmentType } from './model/associated-establishment';

/**
 * Interface texts of the associated establishments list, in one place; the wording follows screen 11
 * (`admin-gestionar-hospedaje.html`, `admin-gestionar-restaurantes.html`), one screen for both types.
 */
export const ESTABLISHMENTS_COPY = {
  eyebrow: 'Catálogos',
  back: 'Volver a catálogos',
  title: { all: 'Establecimientos asociados', HOTEL: 'Establecimientos de alojamiento', RESTAURANT: 'Restaurantes asociados' },
  accessNote: 'El Colaborador operativo no tiene acceso a esta gestión. Estos registros son convenios informativos y no contienen cupos, tarifas ni inventario reservable.',
  panelEyebrow: 'Directorio asociado',
  panelTitle: 'Activar, inactivar o reactivar',
  denied: 'No tienes acceso a los establecimientos asociados.',
  // The record has no contact field: the screen's "Contacto" is the commercial information, named as on the restaurants screen.
  columns: { name: 'Establecimiento', info: 'Información comercial', status: 'Estado', actions: 'Acción' },
  newEstablishment: 'Agregar establecimiento',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  filters: { type: 'Tipo de establecimiento', status: 'Estado de la asociación', allTypes: 'Todos los tipos', allStatuses: 'Todos los estados', clear: 'Limpiar filtros' },
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento', RESTAURANT: 'Restaurante' } satisfies Record<EstablishmentType, string>,
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<AssociationStatus, string>,
} as const;

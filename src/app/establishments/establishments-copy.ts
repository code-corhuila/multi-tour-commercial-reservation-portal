import { EstablishmentType } from './model/associated-establishment';

/** Interface texts of the associated establishments list, in one place; the wording follows the landing. */
export const ESTABLISHMENTS_COPY = {
  eyebrow: 'Configuración operativa',
  title: { all: 'Establecimientos asociados', HOTEL: 'Alojamiento asociado', RESTAURANT: 'Alimentación asociada' },
  description: 'Gestiona los convenios con alojamientos y restaurantes.',
  accessNote: 'Estos registros son convenios informativos y no contienen cupos, tarifas ni inventario reservable. Las acciones dependen de tu rol.',
  panelTitle: 'Directorio asociado',
  denied: 'No tienes acceso a los establecimientos asociados.',
  columns: { name: 'Nombre comercial', type: 'Tipo', info: 'Descripción y contacto', status: 'Estado', actions: 'Acciones' },
  newEstablishment: 'Nuevo establecimiento',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento', RESTAURANT: 'Restaurante' } satisfies Record<EstablishmentType, string>,
} as const;

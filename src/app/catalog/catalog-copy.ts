import { CatalogServiceType } from './model/catalog-item';

/** Interface texts of the catalog list, in one place; the wording follows the landing. */
export const CATALOG_COPY = {
  eyebrow: 'Configuración operativa',
  title: { all: 'Gestionar catálogo', TOUR: 'Gestionar tours', TRANSPORTATION: 'Gestionar transporte' },
  description: 'Administra los servicios del catálogo y su información comercial.',
  accessNote: 'Las acciones disponibles dependen de tu rol. Solo las personas autorizadas pueden cambiar la información comercial.',
  panelTitle: 'Servicios del catálogo',
  denied: 'No tienes acceso al catálogo.',
  columns: { name: 'Nombre comercial', type: 'Tipo', rate: 'Tarifa base', status: 'Estado', actions: 'Acciones' },
  newItem: 'Nuevo servicio',
  editItem: 'Editar servicio',
  edit: 'Editar',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { TOUR: 'Tour', TRANSPORTATION: 'Transporte' } satisfies Record<CatalogServiceType, string>,
} as const;

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Shows minor units as pesos for reading only; the amount that is typed and sent still goes through money.ts. */
export function formatCop(minorUnits: number): string {
  return COP.format(minorUnits / 100);
}

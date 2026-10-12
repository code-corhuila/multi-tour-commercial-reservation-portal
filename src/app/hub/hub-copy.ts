/** The area of the container that holds the daily dashboard (cash-reporting, HU-CSH-002); Jhon confirms the manifest key. */
export const DASHBOARD_AREA = 'cash-reporting-portal';

/** Change to true when the cash-reporting portal is in the container manifest; until then the Resumen button is shown disabled. */
export const DASHBOARD_AVAILABLE = false;

/** Where another area of the container lives: the container owns the URL, so this is a plain link target. */
export function areaPath(identifier: string | undefined, area: string): string {
  return identifier ? `/t/${encodeURIComponent(identifier)}/areas/${area}` : `/platform/areas/${area}`;
}

/** Interface texts of the catalogs hub, in one place; the wording is the landing's (admin-catalogos). */
export const HUB_COPY = {
  eyebrow: 'Configuración operativa',
  title: 'Catálogos',
  summary: 'Resumen',
  summaryUnavailable: 'Disponible con Caja y reportes',
  accessNote: 'El Colaborador operativo consulta la operación, pero no gestiona establecimientos asociados, tenants ni roles avanzados. El Administrador del tenant gestiona estos convenios.',
  denied: 'No tienes acceso a los catálogos.',
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  back: 'Volver a Catálogos',
  cardsLabel: 'Tipos de catálogo',
  cards: {
    tours: { label: 'TOURS', description: 'La reserva y el cupo corresponden al tour y a una salida concreta.', action: 'Gestionar tours' },
    departures: { label: 'SALIDAS', value: 'Disponible con Operación y costos', description: 'Fechas, horas, vehículos y estados de ejecución.' },
    lodging: { label: 'ALOJAMIENTO ASOCIADO', description: 'Contactos informativos, sin habitaciones, tarifas ni inventario.', action: 'Gestionar establecimientos' },
    food: { label: 'ALIMENTACIÓN ASOCIADA', description: 'Contactos y convenios; la comida puede estar incluida en el paquete del tour.', action: 'Gestionar establecimientos' },
    transport: { label: 'TRANSPORTE', description: 'Capacidad asignada a salidas del tour.', action: 'Gestionar transporte' },
  },
} as const;

export const activeCount = (count: number): string => `${count} ${count === 1 ? 'activo' : 'activos'}`;
export const recordCount = (count: number): string => `${count} ${count === 1 ? 'registro' : 'registros'}`;

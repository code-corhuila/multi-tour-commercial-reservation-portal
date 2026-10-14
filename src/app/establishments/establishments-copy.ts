import { AssociationStatus, EstablishmentType } from './model/associated-establishment';

/**
 * Interface texts of the associated establishments list, in one place; the wording follows screen 11
 * (`admin-gestionar-hospedaje.html`, `admin-gestionar-restaurantes.html`), one screen for both types.
 */
export const ESTABLISHMENTS_COPY = {
  eyebrow: 'Catálogos',
  title: { all: 'Establecimientos asociados', HOTEL: 'Establecimientos de alojamiento', RESTAURANT: 'Restaurantes asociados' },
  accessNote: 'El Colaborador operativo no tiene acceso a esta gestión. Estos registros son convenios informativos y no contienen cupos, tarifas ni inventario reservable.',
  // Opened from a card of the hub with its type, the page speaks as the lodging or the food screen of the mockup (admin-gestionar-hospedaje / -alimentacion).
  eyebrowOf: { HOTEL: 'Alojamiento asociado', RESTAURANT: 'Alimentación asociada' } satisfies Record<EstablishmentType, string>,
  noteOf: {
    HOTEL: 'Los hoteles son establecimientos asociados por convenio, de carácter informativo: el cliente coordina directamente con ellos y la plataforma no reserva habitaciones. Solo el Administrador del tenant gestiona esta información (RF-018); el Colaborador operativo no tiene acceso. Cada establecimiento conserva nombre, descripción, imagen, contacto y estado; nunca cupos, tarifas, habitaciones, platos ni inventario.',
    RESTAURANT: 'Los restaurantes son establecimientos asociados por convenio, de carácter informativo: no se reservan mesas ni se administra inventario. La comida incluida en un paquete forma parte del tour. Solo el Administrador del tenant gestiona esta información (RF-018); el Colaborador operativo no tiene acceso. Cada establecimiento conserva nombre, descripción, imagen, contacto y estado; nunca cupos, tarifas, habitaciones, platos ni inventario.',
  } satisfies Record<EstablishmentType, string>,
  backToCatalogs: 'Volver a catálogos',
  panelEyebrow: 'Directorio asociado',
  panelTitle: 'Activar, inactivar o reactivar',
  denied: 'No tienes acceso a los establecimientos asociados.',
  // The record has no contact field: the screen's "Contacto" is the commercial information, named as on the restaurants screen.
  columns: { name: 'Establecimiento', info: 'Información comercial', status: 'Estado', actions: 'Acción' },
  newEstablishment: 'Agregar establecimiento',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  filters: { type: 'Tipo de establecimiento', status: 'Estado de la asociación', allStatuses: 'Todos los estados', clear: 'Limpiar filtros' },
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento', RESTAURANT: 'Restaurante' } satisfies Record<EstablishmentType, string>,
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<AssociationStatus, string>,
} as const;

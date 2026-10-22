import { formatDate } from '../shared/format';
import { AssociationStatus, EstablishmentChangeKind, EstablishmentType } from './model/associated-establishment';

/** `2026-09-20T10:30:00` as the screen writes it: the day, then the hour of the tenant. */
export const changeWhen = (at: string): string => `${formatDate(at)} · ${at.slice(11, 16)}`;

const CHANGE_LABEL = { REGISTERED: 'Registrado', INACTIVATED: 'Inactivado', REACTIVATED: 'Reactivado', UPDATED: 'Información actualizada' } satisfies Record<EstablishmentChangeKind, string>;

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
  columns: { name: 'Establecimiento', info: 'Información comercial', status: 'Estado y último cambio', actions: 'Acción' },
  newEstablishment: 'Agregar establecimiento',
  inactivate: 'Inactivar',
  reactivate: 'Reactivar',
  filters: { type: 'Tipo de establecimiento', status: 'Estado de la asociación', allTypes: 'Todos los tipos', allStatuses: 'Todos los estados', clear: 'Limpiar filtros' },
  // Gestionar opens the establishment on this same screen (spec 002, AC-PE.12): its bitácora and, where the build can write, its information.
  manage: 'Gestionar',
  managePanel: { title: (name: string) => `Gestionar establecimiento · ${name}`, close: 'Cerrar', name: 'Nombre del establecimiento', info: 'Información comercial', save: 'Guardar cambios',
    nameInvalid: 'Obligatorio: de 1 a 255 caracteres.', saved: 'Información actualizada correctamente.', logTitle: 'Bitácora de cambios', logColumns: ['Fecha', 'Responsable', 'Cambio'], noChanges: 'Sin cambios registrados.' },
  noChange: 'Sin cambios registrados',
  lastChange: (kind: EstablishmentChangeKind, by: string, at: string) => `Último cambio: ${CHANGE_LABEL[kind]} por ${by} · ${changeWhen(at)}`,
  changeLabel: CHANGE_LABEL,
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento', RESTAURANT: 'Restaurante' } satisfies Record<EstablishmentType, string>,
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<AssociationStatus, string>,
} as const;

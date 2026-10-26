import { formatDate } from '../shared/format';
import { ApiError } from '../shell-contract';
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
    nameInvalid: 'Obligatorio: de 1 a 255 caracteres.', saved: 'Información actualizada correctamente.', logTitle: 'Bitácora de cambios', logColumns: ['Fecha', 'Responsable', 'Cambio'], noChanges: 'Sin cambios registrados.', noChangeInfo: 'Sin información de cambios todavía.' },
  noChange: 'Sin cambios registrados',
  lastChange: (kind: EstablishmentChangeKind, by: string, at: string) => `Último cambio: ${CHANGE_LABEL[kind]} por ${by} · ${changeWhen(at)}`,
  changeLabel: CHANGE_LABEL,
  loading: 'Cargando',
  empty: 'Sin resultados',
  requestFailed: 'La solicitud falló.',
  // HU-COM-002 against the real API: the container's message is generic English, so every refusal is mapped here by status, code and field.
  refusals: {
    imageSize: 'La imagen no puede superar 800 KB.', imageType: 'La imagen debe ser PNG, JPEG o WebP.', imageInvalid: 'La imagen no es válida.',
    fields: { establishmentType: 'El tipo de establecimiento no es válido.', commercialName: 'Obligatorio: de 1 a 255 caracteres.', commercialInformation: 'La información comercial no es válida.' },
    forbidden: 'No tienes permiso para esta acción.', notFound: 'El establecimiento ya no existe.', cannotReactivate: 'No se puede reactivar este establecimiento en su estado actual.',
    requestFailed: 'No se pudo completar la solicitud. Intenta de nuevo.',
  },
  noChangeInfo: '—',
  retry: 'Reintentar',
  types: { HOTEL: 'Alojamiento', RESTAURANT: 'Restaurante' } satisfies Record<EstablishmentType, string>,
  statuses: { ACTIVE: 'Activo', INACTIVE: 'Inactivo' } satisfies Record<AssociationStatus, string>,
} as const;


type Refusal = Partial<ApiError> | null | undefined;
export type RegistrationField = 'establishmentType' | 'commercialName' | 'commercialInformation' | 'image';
const TEXT_FIELDS: readonly string[] = ['establishmentType', 'commercialName', 'commercialInformation'];

/** Image detail of the API: by its words a size refusal, a type refusal or, otherwise, a generic one. */
const imageText = (message: string): string => /size|large|big|800|kb|byte/i.test(message) ? ESTABLISHMENTS_COPY.refusals.imageSize : /type|format|content|png|jpe?g|webp/i.test(message) ? ESTABLISHMENTS_COPY.refusals.imageType : ESTABLISHMENTS_COPY.refusals.imageInvalid;

/** The container hides the server's reason behind a generic English text: speak from status, code and field, never from that message. */
export function transitionRefusal(error: Refusal): string {
  switch (error?.status) {
    case 403: return ESTABLISHMENTS_COPY.refusals.forbidden;
    case 404: return ESTABLISHMENTS_COPY.refusals.notFound;
    case 422: return ESTABLISHMENTS_COPY.refusals.cannotReactivate;
    default: return ESTABLISHMENTS_COPY.refusals.requestFailed;
  }
}

/** Registration refusals: a text beside its field when the API names one; otherwise a general notice of the form. */
export function registrationRefusal(error: Refusal): { fields: Partial<Record<RegistrationField, string>>; general: string | null } {
  const fields: Partial<Record<RegistrationField, string>> = {};
  if (error?.status === 413) { return { fields: { image: ESTABLISHMENTS_COPY.refusals.imageSize }, general: null }; }
  if (error?.status === 415) { return { fields: { image: ESTABLISHMENTS_COPY.refusals.imageType }, general: null }; }
  if (error?.status === 400) {
    for (const detail of Array.isArray(error.details) ? error.details : []) {
      if (detail.field === 'image') { fields.image = imageText(detail.message ?? ''); }
      else if (TEXT_FIELDS.includes(detail.field)) { fields[detail.field as keyof typeof ESTABLISHMENTS_COPY.refusals.fields] = ESTABLISHMENTS_COPY.refusals.fields[detail.field as keyof typeof ESTABLISHMENTS_COPY.refusals.fields]; }
    }
    return Object.keys(fields).length ? { fields, general: null } : { fields, general: ESTABLISHMENTS_COPY.refusals.requestFailed };
  }
  return { fields, general: error?.status === 403 ? ESTABLISHMENTS_COPY.refusals.forbidden : ESTABLISHMENTS_COPY.refusals.requestFailed };
}

import { HighRiskField, PersonField } from './model/customer-group';

export const CUSTOMERS_COPY = {
  entry: 'Gestión comercial', title: 'Titular y acompañantes',
  description: 'Registra el cliente titular y los acompañantes que se asociarán a la reserva.',
  banner: 'Datos de demostración en memoria: personas inventadas, sin vínculo de correo con una cuenta y sin auditoría de consultas.',
  loading: 'Cargando las personas…', failed: 'No se pudieron cargar las personas.', retry: 'Reintentar',
  empty: 'Aún no hay grupo: registra su cliente titular.', denied: 'Tu rol no puede abrir esta área.',
  leadEyebrow: '01. Cliente titular', leadTitle: 'Datos para asociar la reserva',
  companionsEyebrow: '03. Acompañantes', companionsTitle: 'Datos individuales requeridos',
  companionsCopy: 'Los documentos no pueden repetirse dentro de la misma reserva.',
  riskEyebrow: 'Requisitos de actividad de riesgo', riskTitle: 'Información obligatoria antes de registrar',
  riskCopy: 'Este servicio requiere consentimiento informado, tipo de sangre, contacto de emergencia y restricciones físicas o movilidad reducida para cada viajero.',
  lead: 'Titular', companion: 'Acompañante', highRisk: 'Actividad de riesgo', restricted: 'Restringido',
  newGroup: 'Nuevo grupo', cancel: 'Cancelar', registerLead: 'Registrar titular', addCompanion: 'Agregar acompañante',
  saving: 'Guardando…', refused: 'No se pudo registrar la persona.',
  activity: 'Tour', chooseActivity: 'Selecciona un tour',
  linked: 'Reserva vinculada al cliente existente',
  searchLabel: 'Buscar cliente existente (nombre, documento o correo)', searchPlaceholder: 'Escribe al menos 2 caracteres',
  searching: 'Buscando clientes…', noMatches: 'Sin coincidencias: se registrará como cliente nuevo.', searchFailed: 'No se pudo buscar clientes.',
  unverified: 'correo sin verificar', noDocument: 'sin documento',
  required: 'Obligatorio.', invalidEmail: 'Escribe un correo válido.', invalidDate: 'Escribe una fecha válida (dd/mm/aaaa).', duplicate: 'Este documento ya está en la reserva.',
  companionsNote: 'La cantidad total de viajeros determina los acompañantes que deben registrarse. Los documentos no pueden repetirse dentro de la misma reserva.',
  noCompanions: 'No requiere acompañantes', companionTitle: 'Acompañante',
  terms: 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.', yes: 'Registrado',
} as const;

/** `1 acompañante requerido`, `3 acompañantes requeridos`: section 03 of 10B. */
export const requiredCompanions = (count: number): string => `${count} acompañante${count === 1 ? ' requerido' : 's requeridos'}`;

/** The placeholders of section 01 and 03 (mockup 10B). */
export const PLACEHOLDERS = { fullName: 'Ej. Laura Gómez', document: 'Ej. 1.234.567.890', email: 'correo@ejemplo.com', phone: 'Ej. 300 000 0000', birthDate: 'dd/mm/aaaa', companionName: 'Nombre completo', companionDocument: 'Documento' } as const;

/** `1 acompañante registrado`, `2 acompañantes registrados`, `Sin acompañantes registrados`. */
export function companionCount(count: number): string {
  return count === 0 ? 'Sin acompañantes registrados' : `${count} acompañante${count === 1 ? ' registrado' : 's registrados'}`;
}

export const PERSON_LABELS: Record<Exclude<PersonField, 'serviceId' | 'acceptedTerms'>, string> = {
  fullName: 'Full name', document: 'Document', contact: 'Contact', birthDate: 'Birth date',
  informedConsent: 'Informed consent', bloodType: 'Blood type', emergencyContact: 'Emergency contact', physicalRestrictions: 'Physical restrictions',
};

export const SENSITIVE_LABELS: readonly [HighRiskField, string][] = (['bloodType', 'physicalRestrictions', 'emergencyContact', 'informedConsent'] as const)
  .map((field) => [field, PERSON_LABELS[field]]);

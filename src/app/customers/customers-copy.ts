import { HighRiskField, PersonField } from './model/customer-group';

/** Texts of screen 10B (`admin-crear-reserva.html`, sections 01, 03 and the high-risk panel). */
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
  terms: 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.', yes: 'Registrado',
} as const;

/** `1 acompañante registrado`, `2 acompañantes registrados`, `Sin acompañantes registrados`. */
export function companionCount(count: number): string {
  return count === 0 ? 'Sin acompañantes registrados' : `${count} acompañante${count === 1 ? ' registrado' : 's registrados'}`;
}

export const PERSON_LABELS: Record<Exclude<PersonField, 'serviceId' | 'acceptedTerms'>, string> = {
  fullName: 'Nombre completo', document: 'Documento de identidad', email: 'Correo electrónico', contact: 'Teléfono de contacto',
  birthDate: 'Fecha de nacimiento', bloodType: 'Tipo de sangre', emergencyContact: 'Contacto de emergencia',
  physicalRestrictions: 'Restricciones físicas o movilidad reducida', informedConsent: 'Consentimiento informado o exoneración registrado.',
};

export const SENSITIVE_LABELS: readonly [HighRiskField, string][] = (['bloodType', 'emergencyContact', 'physicalRestrictions', 'informedConsent'] as const)
  .map((field) => [field, PERSON_LABELS[field]]);

/** Validation messages of the lead and companion forms. */
export const CUSTOMER_MESSAGES = {
  required: 'Obligatorio.', email: 'Escribe un correo válido.', acceptedTerms: 'El cliente debe aceptar las condiciones.',
  duplicateDocument: 'Este documento ya está en la reserva.', highRisk: 'Obligatorio para una actividad de riesgo.',
} as const;

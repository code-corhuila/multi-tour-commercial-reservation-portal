/** Texts of the authorized screen 12 (admin-descuentos, admin-nuevo-descuento, admin-editar-descuento), as the mockup v1.9 writes them. */
export const DISCOUNT_TEXT = {
  eyebrow: 'Reglas comerciales', title: 'Descuentos', newTitle: 'Nuevo descuento', editTitle: 'Editar descuento', back: 'Volver a descuentos',
  heroEyebrow: 'Configuración', heroTitle: 'Descuentos visibles y trazables.',
  heroCopy: 'Define vigencia, prioridad, acumulación, topes y base de cálculo para los tours. Un descuento general se fija en el contexto comercial de cada reserva al crearla: los cambios posteriores no afectan reservas ya creadas.',
  panelEyebrow: 'Vigentes', panelTitle: 'Promociones activas',
  loading: 'Cargando descuentos…', saving: 'Guardando…', empty: 'Aún no hay descuentos configurados.',
  failed: 'No se pudieron cargar los descuentos.', retry: 'Reintentar', denied: 'No tienes acceso a los descuentos.',
  create: 'Crear descuento', edit: 'Editar parámetros', inactivate: 'Inactivar', confirm: 'Confirmar inactivación', cancel: 'Cancelar',
  save: 'Guardar cambios', newLead: 'Configura la promoción', editLead: 'Actualiza la promoción', orderLead: 'Reglas de aplicación',
  pickTour: 'Selecciona un tour',
  toursOnly: 'Los descuentos aplican únicamente a tours; no a transporte ni a establecimientos asociados.',
  newFeedback: 'Completa los parámetros para publicar el descuento.',
  editFeedback: 'Actualiza los parámetros y guarda para aplicar los cambios a este mismo descuento. Las reservas ya creadas conservan los descuentos fijados al crearlas.',
  confirmation: 'Las reservas existentes conservan el descuento que ya tienen. ¿Inactivar este descuento?',
  until: 'Vigente hasta el', base: 'Base de cálculo:', priority: 'Prioridad', stackable: 'acumulable', notStackable: 'no acumulable', cap: 'Tope:',
  baseInline: { ORIGINAL_VALUE: 'valor original', PREVIOUS_SUBTOTAL: 'subtotal resultante del descuento anterior' },
};
type Control = { name: string; label: string; kind?: string; placeholder?: string; options?: readonly { value: string; label: string; explanation: string }[] };
export const DISCOUNT_CONTROLS: readonly Control[] = [
  { name: 'tourId', label: 'Tour', options: [] },
  { name: 'percentage', label: 'Porcentaje de descuento (1 a 100)', kind: 'text' },
  { name: 'calculationBase', label: 'Base de cálculo', options: [
    { value: 'ORIGINAL_VALUE', label: 'Valor original', explanation: 'se calcula sobre el valor original de la reserva.' },
    { value: 'PREVIOUS_SUBTOTAL', label: 'Subtotal resultante del descuento anterior', explanation: 'se calcula sobre el subtotal que deja el descuento previo.' },
  ] },
  { name: 'cap', label: 'Tope del descuento', kind: 'text', placeholder: 'Opcional, ej. $50.000' },
  { name: 'startsOn', label: 'Vigencia desde', kind: 'date' },
  { name: 'endsOn', label: 'Vigencia hasta', kind: 'date' },
  { name: 'priority', label: 'Prioridad (1 se aplica primero)', kind: 'text' },
  { name: 'stackable', label: 'Acumulable', options: [{ value: 'no', label: 'No', explanation: '' }, { value: 'si', label: 'Sí', explanation: '' }] },
];
/** The two numbered panels of the form, in the order of the screen. */
export const DISCOUNT_SECTIONS = [
  { eyebrow: '01. Descuento', fields: ['tourId', 'percentage', 'calculationBase', 'cap'] },
  { eyebrow: '02. Vigencia y prioridad', fields: ['startsOn', 'endsOn', 'priority', 'stackable'] },
] as const;

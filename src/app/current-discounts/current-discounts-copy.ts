/** Texts of admin-aplicar-descuento.html and of the values block of admin-crear-reserva.html (12-ux-ui/authorized-screens.md). */
export const CURRENT_DISCOUNTS_TEXT = {
  eyebrow: 'Descuento adicional', title: 'Aplicar descuento', valuesStep: '01. Descuentos vigentes', valuesTitle: 'Valores por servicio',
  authorizationStep: '02. Descuento adicional', authorizationTitle: 'Autorización', date: 'Fecha de consulta', validOn: 'Vigentes al',
  loading: 'Cargando descuentos vigentes…', empty: 'No hay servicios para calcular en esta fecha.', failed: 'No fue posible cargar los valores.',
  applyFailed: 'No fue posible aplicar el descuento.', retry: 'Reintentar', base: 'Valor proyectado', discounts: 'Descuentos aplicables',
  final: 'Valor final', subtotal: 'Subtotal', additional: 'Descuento adicional', reason: 'Motivo', authorizedBy: 'Autorizado por',
  apply: 'Aplicar descuento', cancel: 'Cancelar', service: 'Servicio', value: 'Descuento adicional (%)', reasonField: 'Motivo (obligatorio)',
  reasonHint: 'Describe el motivo del descuento adicional (por ejemplo, fidelización)',
  note: 'El motivo y el responsable quedan asociados a la reserva.',
  bases: { ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior' },
} as const;

/** Validation messages of the additional discount form. */
export const CURRENT_DISCOUNTS_MESSAGES = {
  value: 'Ingresa un valor positivo entre 1 y 100, con máximo dos decimales.', reason: 'El motivo es obligatorio.',
} as const;

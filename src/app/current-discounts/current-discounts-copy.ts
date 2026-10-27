/** Texts of the entrances to admin-aplicar-descuento.html (admin-descuentos.html and admin-reservas.html?mode=additional-discount), as the mockup v1.9 writes them. */
export const ADDITIONAL_DISCOUNT_ENTRY_COPY = {
  panelEyebrow: 'Decisiones excepcionales', panelTitle: 'Descuento adicional',
  panelCopy: 'Solo el Administrador del tenant puede autorizar descuentos adicionales, y únicamente por alguno de los motivos habilitados. Toda autorización debe registrar el motivo y quedar asociada a la reserva.',
  search: 'Buscar una reserva', apply: 'Aplicar descuento',
} as const;

/** Texts of admin-aplicar-descuento.html (the sub-screen), as the mockup v1.9 writes them. */
export const ADDITIONAL_DISCOUNT_COPY = {
  eyebrow: 'Descuento adicional', title: 'Aplicar descuento', back: 'Volver a reservas', apply: 'Aplicar descuento', cancel: 'Cancelar', retry: 'Reintentar',
  access: 'Solo el Administrador del tenant autoriza descuentos adicionales. Se aplican después del descuento general vigente fijado en la reserva, exigen motivo y responsable, respetan el tope parametrizado y recalculan el valor final. Si el nuevo valor queda por debajo de lo ya pagado, el excedente recibe el tratamiento de una modificación (decisión del Administrador del tenant en 24 horas: devolución del 100 % por defecto o saldo a favor).',
  contextStep: '01. Reserva seleccionada', contextTitle: 'Contexto de la reserva', reservation: 'Reserva', customer: 'Cliente', service: 'Servicio', currentValue: 'Valor actual',
  general: 'Descuento general fijado', generalSet: '(fijado al crear la reserva)', noGeneral: 'Sin descuento general', paid: 'Valores pagados y validados',
  authorizationStep: '02. Descuento adicional', authorizationTitle: 'Autorización', value: 'Descuento adicional (%)', cap: 'Tope parametrizado',
  newValue: 'Nuevo valor calculado', excess: 'Excedente sobre lo pagado', noExcess: '$0 (sin excedente)',
  reasonField: 'Motivo (obligatorio)', reasonHint: 'Describe el motivo del descuento adicional (por ejemplo, fidelización)', note: 'El motivo y el responsable quedan asociados a la reserva.',
  loading: 'Cargando la reserva…', failed: 'No fue posible cargar la reserva.', applyFailed: 'No fue posible aplicar el descuento.', denied: 'No tienes acceso al descuento adicional.',
  notFound: 'No se encontró la reserva seleccionada. Vuelve a Reservas e ingresa nuevamente por Aplicar descuento.',
  applied: 'Descuento adicional aplicado correctamente: el valor final se recalculó y quedaron registrados el motivo y el responsable.',
  capValue: (cap: string) => `${cap} % del valor vigente`,
  closed: (state: string) => `Esta reserva está en estado "${state}" y ya no admite modificaciones: no se puede aplicar un descuento adicional.`,
  alreadyApplied: (percentage: string, date: string, by: string) => `Esta reserva ya tiene un descuento adicional autorizado (${percentage} % el ${date} por ${by}). Solo se autoriza un descuento adicional por reserva.`,
  excessOpened: (amount: string) => `El valor pagado supera el nuevo valor: excedente de ${amount} pendiente de tratamiento (continúa desde el detalle de la reserva con Gestionar devolución).`,
  invalidValue: 'Ingresa un valor positivo entre 1 y 100, con máximo dos decimales.', reasonRequired: 'El motivo es obligatorio.',
  aboveCap: (cap: string) => `El descuento adicional debe estar entre 1 % y el tope parametrizado de ${cap} %.`,
} as const;

/** Texts of the additional discount in admin-detalle-reserva.html (10A): the header button and the block "Descuento adicional aplicado". */
export const ADDITIONAL_DISCOUNT_DETAIL_COPY = {
  action: 'Aplicar descuento adicional', blockEyebrow: 'Decisión excepcional', blockTitle: 'Descuento adicional aplicado',
  percentage: 'Descuento adicional', reason: 'Motivo', previous: 'Valor anterior', amount: 'Valor descontado', final: 'Valor final',
} as const;

/** Texts of the panel "Motivos autorizables" of admin-descuentos.html, as the mockup v1.9 writes them. */
/** Texts of the values block of admin-crear-reserva.html (12-ux-ui/authorized-screens.md). */
export const CURRENT_DISCOUNTS_TEXT = {
  base: 'Valor proyectado', discounts: 'Descuentos aplicables', final: 'Valor final', subtotal: 'Subtotal', additional: 'Descuento adicional',
  reason: 'Motivo', authorizedBy: 'Autorizado por',
  bases: { ORIGINAL_VALUE: 'sobre el valor original', PREVIOUS_SUBTOTAL: 'sobre el subtotal anterior' },
} as const;

export const AUTHORIZABLE_REASONS_COPY = {
  eyebrow: 'Parametrización', title: 'Motivos autorizables', copy: 'Define los motivos por los que se puede autorizar un descuento adicional (por ejemplo, fidelización).',
  field: 'Nuevo motivo', placeholder: 'Ej. Cortesía por referido', add: 'Agregar motivo', remove: 'Quitar', retry: 'Reintentar',
  required: 'Escribe el motivo que se podrá autorizar.', loading: 'Cargando los motivos…', empty: 'Aún no hay motivos habilitados.',
  failed: 'No fue posible cargar los motivos.', changeFailed: 'No fue posible guardar el cambio.',
} as const;

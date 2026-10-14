/** Texts of screens 10A ("Pagos y soportes"), 10C ("Gestionar pago") and 13 (admin-gestion-pago.html), as the mockup writes them. */
export const PAYMENTS_TEXT = {
  manage: 'Gestionar pago', blockEyebrow: 'Pagos y soportes', blockTitle: 'Seguimiento económico',
  columns: ['Tipo', 'Medio', 'Estado del comprobante', 'Situación financiera', 'Valores validados', 'Saldo pendiente'],
  eyebrow: 'Seguimiento de reserva', title: 'Gestión de pago', reservation: 'Reserva',
  infoEyebrow: 'Información de pago', modality: 'Modalidad', proofState: 'Estado del comprobante', financial: 'Situación financiera',
  economyEyebrow: 'Estado económico', final: 'Valor final', balance: 'Saldo pendiente',
  actionEyebrow: 'Acción de pago', actionTitle: 'Registra el pago de esta reserva', actionCopy: 'El comprobante no es ingreso de caja hasta su validación.',
  amount: 'Monto recibido', partialAmount: 'Monto del abono', proof: 'Soporte de transferencia', back: 'Volver a la reserva',
  submit: { transfer: 'Registrar soporte', partial: 'Registrar abono', total: 'Registrar pago' },
  /** Spec 009- section 5: the mockup's transfer answer; its cash answers move the financial situation (RN-PY1) and are not used. */
  registered: { transfer: 'Soporte registrado. El pago queda en validación y la reserva permanece pendiente de pago.',
    cash: 'Pago registrado. Queda pendiente de validación y la reserva permanece pendiente de pago.' },
  noModalityFeedback: 'No hay una modalidad de pago habilitada para esta reserva. Defínela antes de registrar dinero.',
  /** Mockup app.js 6713-6718: the heading and note of a cancelled or settled reservation. */
  closedTitle: { cancelled: 'Reserva cancelada', settled: 'Pago registrado' } as Readonly<Record<string, string>>,
  closedNote: { cancelled: 'Esta reserva está cancelada: no se pueden registrar nuevos pagos ni soportes. Se conserva la trazabilidad existente.',
    settled: 'No existen valores pendientes por registrar para esta reserva.' } as Readonly<Record<string, string>>,
  /** Spec 009- section 5: 13 has no text for En ejecución and Finalizada; the mockup's own sentence for them (app.js 6079). */
  closedState: (status: string) => `Esta reserva está en estado "${status}" y ya no admite modificaciones.`,
  amountRequired: 'Registra un monto mayor a $0.', proofRequired: 'Adjunta el soporte de transferencia para enviarlo a validación.',
  registeredBy: 'Registrado por', noModality: 'Sin modalidad definida', noProof: 'Sin comprobante',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  notFound: 'No se encontró la reserva seleccionada. Vuelve a Reservas u Operación e ingresa nuevamente por Gestionar pago.',
  proofStatus: { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante' } as Readonly<Record<string, string>>,
};

/** Texts of the method block of 21 (finalizar-reserva.html) and of 24 (pago-transferencia.html), as the mockup writes them. */
export const CUSTOMER_PAYMENT_TEXT = {
  blockTitle: 'Método y plazo de pago', typeTitle: 'Tipo de pago', deposit: 'Monto a abonar', depositPlaceholder: 'Ej. 500000',
  typeHint: { TOTAL: 'Completa el valor final de la reserva.', PARTIAL: 'Confirma según el abono mínimo parametrizado y conserva el saldo pendiente.' } as Readonly<Record<string, string>>,
  depositHint: 'El abono mínimo se calcula sobre el valor final después de aplicar descuentos. El saldo pendiente se calcula con base en el valor efectivamente abonado.',
  depositInvalid: 'Ingresa un monto de abono válido (mayor a cero y hasta el valor final).',
  cashOption: 'El pago en efectivo será registrado por el equipo del operador.',
  cashHint: 'El pago en efectivo no confirma la reserva hasta que el dinero sea recibido y registrado por el equipo del operador.',
  transferHint: 'La transferencia queda pendiente de revisión mediante comprobante.', continue: 'Continuar al pago',
  title: 'Pago por transferencia', reservation: 'Reserva',
  alert: 'Realiza la transferencia y sube obligatoriamente la imagen del comprobante. El archivo queda En validación y no es ingreso de caja hasta que el Administrador lo apruebe.',
  bankTitle: 'Datos bancarios', bank: 'Banco', accountType: 'Tipo de cuenta', accountNumber: 'Número de cuenta', holder: 'Titular',
  proofTitle: 'Comprobante obligatorio', reference: 'Código de referencia:', proof: 'Imagen del comprobante (PDF, JPG, JPEG o PNG; máximo 5 MB)',
  proofState: 'Estado del comprobante:', financial: 'Situación financiera:', send: 'Enviar comprobante para validación', panel: 'Volver al panel',
  chooseProof: 'Selecciona un comprobante para continuar.', validProof: 'Archivo válido. El comprobante quedará En validación hasta su revisión.',
  none: 'No hay una reserva pendiente de transferencia. Vuelve a Explorar para crear una reserva.',
};

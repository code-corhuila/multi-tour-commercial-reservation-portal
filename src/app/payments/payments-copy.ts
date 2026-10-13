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
  amountRequired: 'Registra un monto mayor a $0.', proofRequired: 'Adjunta el soporte de transferencia para enviarlo a validación.',
  registeredBy: 'Registrado por', noModality: 'Sin modalidad definida', noProof: 'Sin comprobante',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  notFound: 'No se encontró la reserva seleccionada. Vuelve a Reservas u Operación e ingresa nuevamente por Gestionar pago.',
  proofStatus: { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante' } as Readonly<Record<string, string>>,
};

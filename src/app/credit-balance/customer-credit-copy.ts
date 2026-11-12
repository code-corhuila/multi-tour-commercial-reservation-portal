/** Spanish copy of the credit panel of mis-pagos.html and of the notice of panel-cliente.html (mockup d4646da, app.js 4758 and 9666), HU-COM-017 AC-CB.13. */
export const CUSTOMER_CREDIT_COPY = {
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar',
  empty: 'No tienes saldo a favor. Si una modificación, cancelación o pago validado genera un excedente a tu favor, aparecerá aquí.',
  available: (money: string) => `Saldo a favor disponible: ${money}`, origin: (id: string) => `(origen: reserva ${id}).`,
  note: 'No vence en Fase 1. Puedes aplicarlo total o parcialmente a una reserva nueva del mismo operador desde el paso de pago, o solicitar su devolución.',
  apply: 'Aplicar a una nueva reserva', request: 'Solicitar devolución',
  requestsTitle: 'Solicitudes de devolución de saldo a favor', requestedOn: (date: string) => `(solicitada el ${date})`,
  state: { PENDIENTE_DE_AUTORIZACION: 'Pendiente de autorización', AUTORIZADA: 'Autorizada', RECHAZADA: 'Rechazada' },
  requestsNote: 'El Administrador del tenant tiene 24 horas corridas para autorizar o rechazar de forma justificada; sin decisión, Multitour autoriza la devolución por el monto solicitado.',
  checkoutNew: (money: string) => `Aplicar mi saldo a favor disponible (${money}) como pago de esta reserva. El valor aplicado cuenta como pago validado.`,
  checkoutExisting: (money: string) => `Aplicar mi saldo a favor disponible (${money}) al saldo pendiente de esta reserva. El valor aplicado cuenta como pago validado, sin comprobante.`,
  noticeLead: 'Saldo a favor', notice: (money: string) => `tienes un saldo a favor de ${money}.`, see: 'Consultar saldo a favor',
} as const;

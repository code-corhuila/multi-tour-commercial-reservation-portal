import type { Eligibility } from './data/cancellation-ports';

/** Spanish copy of admin-cancelar-modificar-reserva.html and of the 10A blocks (mockup and app.js), HU-COM-013. */
export const RESERVATION_CHANGES_COPY = {
  eyebrow: 'Gestión de reserva', title: 'Cancelar o modificar reserva', back: 'Volver a la reserva', open: 'Cancelar o modificar reserva',
  accessNote: 'La reserva contiene únicamente un tour asociado a una salida concreta. El cliente no modifica, cancela directamente ni reprograma por autogestión.',
  formTitle: 'Registrar novedad', reservation: 'Reserva', tour: 'Tour', departure: 'Salida', type: 'Tipo', cause: 'Causal', cancellationType: 'Cancelación',
  refundTitle: 'Devolución',
  refundNote: 'El tratamiento económico queda pendiente según la causa. Si lo solicita el cliente, se calcula el monto reembolsable aplicando la penalidad vigente.',
  potential: 'Valor potencial a devolver', pendingPolicy: 'Pendiente de parametrización comercial', noPayments: 'No aplica: no hay pagos registrados en esta reserva.',
  cancel: 'Cancelar', submit: 'Registrar novedad', causeRequired: 'Completa el tipo y la causal de la cancelación o modificación.',
  registeredPendingRefund: 'Cancelación registrada. El valor a devolver queda pendiente de cálculo según la condición comercial parametrizada; podrás gestionarlo desde el detalle de la reserva.',
  registeredNoPayments: 'Cancelación registrada: no hay pagos registrados, no se genera solicitud de devolución.',
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la reserva seleccionada.',
  historyEyebrow: 'Historial', historyTitle: 'Cancelación registrada', registeredAt: 'Fecha de registro',
  decisionEyebrow: 'Cancelación o modificación registrada', decisionTitle: 'Devolución pendiente de gestionar',
} as const;

/** Why the form is closed; null when it is open. The rescheduling text is PROPUESTO (spec section 5, AC5). */
export function refusalOf(eligibility: Eligibility, statusLabel: string): string | null {
  switch (eligibility) {
    case 'allowed': return null;
    case 'rescheduling-pending': return 'Esta reserva tiene una propuesta de reprogramación pendiente de respuesta: el cliente debe rechazarla.';
    default: return `Esta reserva está en estado "${statusLabel}" y ya no admite cancelación o modificación.`;
  }
}

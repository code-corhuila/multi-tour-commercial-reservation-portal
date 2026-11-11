/** Keys of the customer screens 22 (pago-exitoso.html) and 23 (pago-fallido.html), PROPUESTO in spec 009-: sub-screens without menu. */
export const PAYMENT_RESULT_AREA = Object.freeze({ received: 'payment-received', rejected: 'payment-rejected' } as const);

/** Texts of pago-exitoso.html ("Comprobante recibido") and pago-fallido.html ("Comprobante rechazado"), as the mockup writes them. */
export const PAYMENT_RESULT_TEXT = {
  loading: 'Cargando…', failed: 'No pudimos cargar esta información.', retry: 'Reintentar',
  reservation: 'Reserva:', seeReservations: 'Ver mis reservas', backToPanel: 'Volver al panel',
  received: {
    title: 'Comprobante recibido',
    message: 'Recibimos tu comprobante y quedó En validación. Esto no confirma tu reserva: un usuario del operador con el permiso Validar comprobantes lo revisará en un plazo máximo de 24 horas corridas. La reserva se confirma solo cuando el pago sea validado.',
    proof: 'Estado del comprobante:', status: 'Estado de la reserva:', financial: 'Situación financiera:', noFinancial: 'No aplica',
    deadline: (when: string) => `Plazo de pago vigente hasta ${when}. Si presentaste el comprobante dentro del plazo, la reserva no se cancela mientras esté En validación.`,
    deadlineDefault: 'El comprobante se revisa en un plazo máximo de 24 horas corridas.',
    missingTitle: 'No encontramos la reserva', missing: 'Entra desde Mis reservas para consultar el estado de tus comprobantes.',
  },
  rejected: {
    title: 'Comprobante rechazado',
    message: 'Tu comprobante fue rechazado por el operador. Tu reserva conserva sus pagos ya validados y, mientras el plazo de pago original siga vigente, puedes presentar un nuevo comprobante sobre esta misma reserva.',
    state: 'Estado:', proof: 'Comprobante Rechazado', reservation: 'Reserva', reason: 'Motivo del rechazo:', noReason: 'Sin motivo registrado.', balance: 'Saldo pendiente:',
    deadline: (when: string) => `El plazo de pago original sigue vigente hasta ${when}. El rechazo no genera un plazo adicional: presenta un nuevo comprobante sobre esta misma reserva dentro del tiempo restante.`,
    deadlineDefault: 'Presenta un nuevo comprobante sobre esta misma reserva mientras el plazo de pago siga vigente.',
    expired: 'El plazo de pago original ya venció: la reserva se cancela automáticamente y el cupo se libera. Ningún usuario puede reactivarla.',
    present: 'Presentar nuevo comprobante',
    noneTitle: 'Sin comprobantes rechazados', none: 'No tienes comprobantes rechazados pendientes de subsanar. Consulta el estado de tus comprobantes en Mis pagos.', toPayments: 'Ir a mis pagos',
  },
} as const;

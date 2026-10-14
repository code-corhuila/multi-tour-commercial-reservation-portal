/** HU-COM-012: the option label is the mockup's; the policy answers are PROPUESTO (the mockup has no text for them, spec section 5). */
export const TRAVELLERS_MODIFICATION_COPY = {
  label: 'Modificación de viajeros',
  allowed: 'La política del tour admite la modificación de viajeros en esta reserva.',
  refused: {
    'not-allowed': 'La política del tour no admite la modificación de viajeros en esta reserva.',
    'not-before-execution': 'La modificación de viajeros solo se admite antes de la ejecución de la reserva.',
  },
  loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar', notFound: 'No se encontró la reserva seleccionada.',
} as const;

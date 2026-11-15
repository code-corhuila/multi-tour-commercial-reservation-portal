/** Texts of the customer screens 21 (the "Viajeros" card of `finalizar-reserva.html`) and 25 (`acompanantes.html`), HU-COM-005 amendment. */
export const CUSTOMER_COMPANIONS_COPY = {
  title: 'Datos de acompañantes', back: 'Volver a mis reservas', activeTitle: 'Reserva activa',
  none: 'Sin reserva activa', noneCopy: 'Crea una reserva para habilitar este formulario.',
  loading: 'Cargando…', failed: 'No pudimos cargar esta información.', retry: 'Reintentar',
  summary: (code: string, count: number): string => (count > 0 ? `Reserva ${code}. Completa los datos de ${count} acompañante${count === 1 ? '' : 's'}.` : `Reserva ${code}. Esta reserva no requiere acompañantes adicionales.`),
  noCompanionsTitle: 'Sin acompañantes por registrar', singleTraveler: 'Esta reserva fue creada para un solo viajero.',
  save: 'Guardar acompañantes', backToReservations: 'Volver a reservas', saved: 'Acompañantes guardados.', refused: 'No se pudieron guardar los acompañantes. Inténtalo de nuevo.',
  missing: (n: number): string => `Completa nombre, documento, fecha de nacimiento y contacto de emergencia del acompañante ${n}.`,
  future: (n: number): string => `La fecha de nacimiento del acompañante ${n} no puede ser futura.`,
  repeated: 'Hay un documento repetido: el documento del titular y de cada acompañante debe ser único dentro de la reserva.',
  repeatedBeside: 'Este documento ya está en la reserva.',
  companion: 'Acompañante', fullName: 'Nombre completo', document: 'Documento de identidad', birthDate: 'Fecha de nacimiento', phone: 'Teléfono (opcional)', emergency: 'Contacto de emergencia',
  years: (age: number): string => `${age} ${age === 1 ? 'año' : 'años'}`,
  /** The placeholders follow the mockup page that draws the fields: 21 (checkout) or 25 (standalone). */
  placeholders: {
    checkout: { fullName: 'Nombre completo', document: 'Documento', phone: 'Teléfono', emergency: 'Nombre y teléfono' },
    standalone: { fullName: 'Ej. María Pérez', document: 'Ej. 1023456789', phone: 'Ej. 300 000 0000', emergency: 'Nombre y teléfono' },
  },
} as const;

/** Texts of admin-pagos.html and admin-validar-soporte.html (13), and of 10, 10A, 13 and 24, as the mockup writes them (spec 010- section 5). */
export const PROOF_REVIEW_TEXT = {
  eyebrow: 'Control de cobro', title: 'Pagos y devoluciones', reservations: 'Ver reservas',
  heroEyebrow: 'Validación', heroTitle: 'Confirma pagos sin perder trazabilidad.', heroCopy: 'Valida o rechaza soportes, registra abonos y autoriza devoluciones cuando corresponda.',
  listEyebrow: 'Soportes por revisar', listTitle: 'Pagos pendientes', pending: (n: number) => `${n} pendientes`,
  columns: ['Reserva', 'Cliente', 'Modalidad', 'Valor pendiente', 'Estado', 'Acción'], overdueMark: 'Revisión vencida',
  overdue: (n: number) => `Hay ${n} soporte(s) con revisión vencida. La marca no cambia el estado ni libera cupos.`,
  /** PROPUESTO: the mockup draws no empty table. */
  empty: 'No hay soportes por revisar.',
  validate: 'Validar soporte', view: 'Ver soporte', reject: 'Rechazar soporte', approve: 'Aprobar soporte', back: 'Volver a pagos',
  /** The mockup's note with the portal's Spanish role labels (Gerente, Contador, Analista) instead of Manager, Accountant, Analyst. */
  accessNote: 'Acción disponible para el Administrador del tenant y para cualquier Colaborador operativo al que el Administrador haya asignado el permiso Validar comprobantes. Gerente, Contador y Analista no pueden recibir este permiso.',
  proofEyebrow: 'Soporte de pago', heading: 'Revisa el comprobante antes de decidir', readOnlyHeading: 'Consulta del comprobante de pago',
  reservation: 'Reserva', customer: 'Cliente', modality: 'Modalidad', amount: 'Valor recibido', status: 'Estado actual', proof: 'Soporte de pago',
  reason: 'Motivo (obligatorio)', reasonPlaceholder: 'Describe el motivo de la aprobación o el rechazo',
  hint: 'Registra el motivo y decide si apruebas o rechazas el soporte.', reasonRequired: 'Registra el motivo obligatorio antes de aprobar o rechazar el soporte.',
  approved: 'Soporte aprobado. La reserva y su situación financiera fueron recalculadas.', rejected: 'Soporte rechazado. La reserva conserva su estado y saldo pendiente.',
  decided: (approved: boolean) => `Este soporte ya fue ${approved ? 'validado' : 'rechazado'}. No se puede volver a decidir sobre el mismo intento.`,
  /** PROPUESTO: the mockup's "Consulta de solo lectura: el Colaborador operativo no tiene permiso…" for every role without the permission. */
  readOnly: 'Consulta de solo lectura: tu rol no tiene permiso para validar este soporte.',
  notFound: 'No se encontró el soporte de pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Validar soporte.',
  history: 'Historial:', reviewLimit: 'Plazo máximo de revisión: 24 horas.',
};

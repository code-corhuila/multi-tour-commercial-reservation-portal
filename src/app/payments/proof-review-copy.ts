/** Texts of admin-pagos.html and admin-validar-soporte.html (13), and of 10, 10A, 13 and 24, as the current mockup (PDR v1.9) writes them. */
export const PROOF_REVIEW_TEXT = {
  eyebrow: 'Control de cobro', title: 'Pagos y devoluciones', reservations: 'Ver reservas', parameters: 'Parámetros de pago',
  heroEyebrow: 'Validación', heroTitle: 'Confirma pagos sin perder trazabilidad.',
  heroCopy: 'Valida o rechaza comprobantes, registra seguimientos y autoriza devoluciones cuando corresponda. La revisión de cada comprobante tiene un máximo de 24 horas corridas.',
  listEyebrow: 'Comprobantes y seguimiento', listTitle: 'Pagos pendientes', pending: (n: number) => `${n} pendiente${n === 1 ? '' : 's'}`,
  columns: ['Reserva', 'Cliente', 'Tipo y medio de pago', 'Valor', 'Estado', 'Acción'], overdueMark: 'Revisión vencida', noAction: 'Sin acción pendiente',
  overdue: (n: number) => `Hay ${n} comprobante(s) con revisión vencida (más de 24 horas corridas En validación). La marca no cambia el estado, no cancela la reserva ni libera cupos.`,
  /** PROPUESTO: the mockup draws no empty table. */
  empty: 'No hay comprobantes por revisar.',
  validate: 'Validar comprobante', view: 'Ver comprobante', reject: 'Rechazar comprobante', approve: 'Aprobar comprobante', back: 'Volver a pagos',
  /** The mockup's note with the portal's Spanish role labels (Gerente, Contador, Analista) instead of Manager, Accountant, Analyst. */
  accessNote: 'Acción disponible para el Administrador del tenant y para cualquier Colaborador operativo al que el Administrador haya asignado el permiso Validar comprobantes. Gerente, Contador y Analista no pueden recibir este permiso. El comprobante se revisa dentro de 24 horas corridas; pasado ese plazo queda marcado como revisión vencida, sin cancelar la reserva ni liberar el cupo.',
  proofEyebrow: 'Comprobante de pago', heading: 'Revisa el comprobante antes de decidir', readOnlyHeading: 'Consulta del comprobante de pago',
  reservation: 'Reserva', customer: 'Cliente', modality: 'Tipo y medio de pago', declared: 'Valor declarado', amount: 'Monto verificado', status: 'Estado del comprobante', proof: 'Comprobante de pago',
  file: (name: string | null) => (name ? `Archivo: ${name}` : 'Sin comprobante adjunto'),
  reason: 'Motivo (obligatorio al rechazar o si el monto verificado difiere del declarado)', reasonPlaceholder: 'Describe el motivo de la decisión o de la diferencia',
  recognized: 'El monto reconocido es el valor verificado en la evidencia. Si supera el valor pendiente de la reserva, solo se aplica lo necesario y el excedente se registra como saldo a favor del cliente dentro del tenant.',
  hint: 'Verifica el monto y decide si apruebas o rechazas el comprobante.',
  reasonRequired: 'Registra el motivo obligatorio del rechazo.', differenceRequired: 'El monto verificado es distinto al declarado en el comprobante: registra el motivo de la diferencia.',
  amountRequired: 'Registra el monto verificado (mayor a $0).',
  overdueNotice: 'Revisión vencida: este comprobante lleva más de 24 horas corridas En validación. Decide cuanto antes.',
  confirmed: 'La reserva quedó Confirmada.', surplus: (amount: string) => `El excedente de ${amount} se registró como saldo a favor del cliente.`,
  untreated: (amount: string) => `La reserva estaba Cancelada: ${amount} pasan a tratamiento pendiente.`,
  approved: (applied: string, situation: string, extra: readonly string[]) => `Comprobante aprobado por ${applied} aplicados. Situación financiera: ${situation}. ${extra.join(' ')}`.trim(),
  rejected: 'Comprobante rechazado. La reserva conserva su estado, sus pagos validados y su saldo pendiente.',
  decided: (approved: boolean, by?: string) => `Este comprobante ya fue ${approved ? 'aprobado' : 'rechazado'}${by ? ` por ${by}` : ''}. No se puede volver a decidir sobre el mismo comprobante.`,
  /** The mockup's "Consulta de solo lectura…" for every role without the permission. */
  readOnly: 'Consulta de solo lectura: tu usuario no tiene el permiso Validar comprobantes.',
  notFound: 'No se encontró el comprobante seleccionado. Vuelve a Pagos e ingresa nuevamente por Validar comprobante.',
  history: 'Historial:', reviewLimit: 'Plazo máximo de revisión: 24 horas.',
};

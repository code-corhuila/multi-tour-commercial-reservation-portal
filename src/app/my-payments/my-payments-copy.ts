import { SIGN_IN_AS_CUSTOMER_NOTICE } from '../self-service-reservation/data/customer-context';

/** Texts of mis-pagos.html, of the economic lines of mis-reservas.html and of 17 (panel-cliente.html), as the mockup v1.9 writes them. */
export const MY_PAYMENTS_TEXT = {
  eyebrow: 'Portal cliente', title: 'Mis pagos',
  desc: 'Consulta el tipo y medio de pago, el estado de cada comprobante, la situación financiera, el saldo pendiente, los valores devueltos y tu saldo a favor. Esta consulta no permite validar ni rechazar comprobantes.',
  section: 'Estado económico de mis reservas y saldo a favor', empty: 'Todavía no tienes pagos ni reservas registradas.',
  notCustomer: SIGN_IN_AS_CUSTOMER_NOTICE,
  loading: 'Cargando…', failed: 'No pudimos cargar esta información.', retry: 'Reintentar',
  status: 'Estado de la reserva', type: 'Tipo de pago', method: 'Medio de pago', proof: 'Estado del comprobante', financial: 'Situación financiera',
  final: 'Valor final', validated: 'Valores validados', balance: 'Saldo pendiente', refunded: 'Valores devueltos', credit: 'Saldo a favor',
  treatment: 'En tratamiento pendiente', departure: 'Salida', travelers: 'Viajeros', deadline: 'Plazo', lineBalance: 'Saldo',
  receipts: 'Comprobantes', noReceipts: 'Sin comprobantes registrados.', reason: 'motivo', detail: 'Ver detalle de la reserva',
  noCredit: 'No tienes saldo a favor. Si una modificación, cancelación o pago validado genera un excedente a tu favor, aparecerá aquí.',
  creditAvailable: 'Saldo a favor disponible', creditOrigin: 'origen: reserva', creditNote: 'No vence en Fase 1.',
  notApplicable: 'No aplica por reserva cancelada', unknown: 'Por definir',
  payAction: 'Continuar pago', presentAction: 'Presentar nuevo comprobante', seePayments: 'Ver pagos y comprobantes', seeCredit: 'Consultar saldo a favor',
  continuePay: { icon: 'CP', title: 'Continuar pago', copy: 'Continúa el pago pendiente de una de tus reservas.' },
  myPayments: { icon: 'MP', title: 'Mis pagos', copy: 'Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.' },
  noticeLead: 'Reserva',
  noticeReview: 'comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.',
  noticeRejected: 'comprobante Rechazado. Puedes presentar un nuevo comprobante sobre la misma reserva mientras el plazo de pago siga vigente.',
  noticeTreatment: (amount: string) => `Los valores abonados (${amount}) quedaron en tratamiento pendiente.`,
  noticeConfirmed: (amount: string) => `Confirmada con saldo pendiente de ${amount}.`, noticePending: 'Pendiente de pago.',
  noticeCredit: (amount: string) => `tienes un saldo a favor de ${amount}.`,
  frozen: 'Tus plazos económicos están congelados mientras esperas tu respuesta de reprogramación.',
  inReview: 'Comprobante presentado dentro del plazo: la reserva no se cancela mientras se revisa (hasta 24 horas corridas).',
  payDeadline: (when: string) => `Plazo de pago vigente hasta ${when} (una única ampliación posible; nunca después de la hora de inicio de la salida).`,
  payDeadlineDefault: 'Plazo de pago: según la configuración del operador, sin superar la hora de inicio de la salida.',
  balanceDeadline: (when: string) => `Plazo para completar el saldo: hasta ${when} (antes de la hora de inicio de la salida).`,
  balanceDeadlineDefault: 'Debes completar el saldo antes de la hora de inicio de la salida.',
} as const;

const LABELS: Readonly<Record<'status' | 'type' | 'method' | 'proof' | 'financial', Readonly<Record<string, string>>>> = {
  status: { PENDING_PAYMENT: 'Pendiente de pago', CONFIRMED: 'Confirmada', IN_EXECUTION: 'En ejecución', FINALIZED: 'Finalizada', CANCELLED: 'Cancelada' },
  type: { TOTAL: 'Pago total', PARTIAL: 'Abono' },
  method: { BANK_TRANSFER: 'Transferencia', CASH_AT_OFFICE: 'Efectivo' },
  proof: { EN_VALIDACION: 'En validación', SIN_COMPROBANTE: 'Sin comprobante', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado' },
  financial: { SIN_PAGO: 'Sin pago', PARCIAL: 'Parcial', ABONO_RECIBIDO: 'Abono recibido', PAGO_COMPLETO: 'Pago completo', SALDO_PENDIENTE: 'Saldo pendiente' },
};

/** The Spanish label of a code of the port; an unknown or missing code is never shown (authorized screens P4). */
export function labelOf(kind: keyof typeof LABELS, code: string | null | undefined): string {
  if (kind === 'financial' && code === null) return MY_PAYMENTS_TEXT.notApplicable;
  return LABELS[kind][code ?? ''] ?? MY_PAYMENTS_TEXT.unknown;
}

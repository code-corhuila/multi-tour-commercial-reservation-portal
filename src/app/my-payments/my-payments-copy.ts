import { SIGN_IN_AS_CUSTOMER_NOTICE } from '../self-service-reservation/data/customer-context';

/** Texts of mis-pagos.html, of the economic lines of mis-reservas.html and of 17 (panel-cliente.html), as the mockup writes them. */
export const MY_PAYMENTS_TEXT = {
  eyebrow: 'Portal cliente', title: 'Mis pagos',
  desc: 'Consulta pagos, abonos, saldos y soportes de tus reservas propias. Esta consulta no permite validar ni rechazar soportes.',
  section: 'Estado económico de mis reservas', empty: 'Todavía no tienes pagos ni reservas registradas.',
  notCustomer: SIGN_IN_AS_CUSTOMER_NOTICE,
  loading: 'Cargando…', failed: 'No pudimos cargar esta información.', retry: 'Reintentar',
  type: 'Tipo', method: 'Medio', proof: 'Comprobante', financial: 'Situación financiera', validated: 'Valores validados', balance: 'Saldo pendiente',
  lineType: 'Tipo de pago', lineMethod: 'Medio de pago', lineProof: 'Estado del comprobante', lineBalance: 'Saldo',
  notApplicable: 'No aplica por reserva cancelada', unknown: 'Por definir',
  continuePay: { icon: 'CP', title: 'Continuar pago', copy: 'Continúa el pago pendiente de una de tus reservas.' },
  myPayments: { icon: 'MP', title: 'Mis pagos', copy: 'Consulta pagos, abonos, saldos y soportes de tus reservas.' },
  noticeLead: 'Reserva', noticeProof: 'comprobante', noticeReview: 'La revisión puede tardar hasta 24 horas.',
} as const;

const LABELS: Readonly<Record<'type' | 'method' | 'proof' | 'financial', Readonly<Record<string, string>>>> = {
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

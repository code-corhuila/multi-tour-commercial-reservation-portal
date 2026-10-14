import { departureLine, formatCop } from '../shared/format';
import { CustomerPaymentSummary, PaymentNotice } from './data/my-payments-source';
import { MY_PAYMENTS_TEXT as T, labelOf } from './my-payments-copy';

/** What the three mockup screens write of one reservation, from the same fields of the one port (RN-MP1). Pure: no source, no navigation. */
export type Row = readonly [label: string, value: string];
type Economic = Pick<CustomerPaymentSummary, 'reservationStatus' | 'proofStatus' | 'balanceCents' | 'deadlineAt' | 'reschedulingPending'>;

/** describeClientReservationDeadline (app.js 4470): the dated deadline only when the service gives it; otherwise the rule in words. */
export function deadlineText(r: Economic): string {
  if (r.reservationStatus === 'CANCELLED') return '';
  if (r.reschedulingPending) return T.frozen;
  if (r.reservationStatus === 'PENDING_PAYMENT') {
    if (r.proofStatus === 'EN_VALIDACION') return T.inReview;
    return r.deadlineAt ? T.payDeadline(departureLine(r.deadlineAt)) : T.payDeadlineDefault;
  }
  if (r.balanceCents > 0) return r.deadlineAt ? T.balanceDeadline(departureLine(r.deadlineAt)) : T.balanceDeadlineDefault;
  return '';
}

const money = (label: string, cents: number | undefined): Row[] => (cents === undefined ? [] : [[label, formatCop(cents)]]);
const core = (r: CustomerPaymentSummary, financial: string): Row[] => [
  [T.type, labelOf('type', r.paymentType)], [T.method, labelOf('method', r.paymentMethod)], [T.status, labelOf('status', r.reservationStatus)],
  [T.proof, labelOf('proof', r.proofStatus)], [T.financial, financial],
  ...money(T.final, r.finalValueCents), [T.validated, formatCop(r.validatedCents)], [T.balance, formatCop(r.balanceCents)],
];

/** The grid of a mis-pagos.html card: a cancelled reservation has no financial situation, whatever the service holds. */
export function gridRows(r: CustomerPaymentSummary): Row[] {
  const rows = core(r, r.reservationStatus === 'CANCELLED' ? T.notApplicable : labelOf('financial', r.financialStatus));
  return [[T.status, labelOf('status', r.reservationStatus)], ...rows.filter(([label]) => label !== T.status),
    ...money(T.refunded, r.refundedCents), ...money(T.credit, r.creditBalanceCents),
    ...(r.pendingTreatmentCents ? money(T.treatment, r.pendingTreatmentCents) : [])];
}

/** "Ver detalle de la reserva" of mis-reservas.html: the zero returned, credit and treatment values stay out, as in the mockup. */
export function detailRows(r: CustomerPaymentSummary): Row[] {
  const plazo = deadlineText(r);
  return [[T.departure, departureLine(r.departureAt)], ...(r.people === undefined ? [] : [[T.travelers, String(r.people)] as Row]), ...core(r, labelOf('financial', r.financialStatus)),
    ...(r.refundedCents ? money(T.refunded, r.refundedCents) : []), ...(r.creditBalanceCents ? money(T.credit, r.creditBalanceCents) : []),
    ...(r.pendingTreatmentCents ? money(T.treatment, r.pendingTreatmentCents) : []), ...(plazo ? [[T.deadline, plazo] as Row] : [])];
}

/** The payment action of a card (app.js 4510): a rejected proof presents a new one; a balance to pay continues the payment. */
export function paymentAction(r: Pick<CustomerPaymentSummary, 'reservationStatus' | 'proofStatus' | 'balanceCents' | 'paymentMethod' | 'reschedulingPending'>): 'present' | 'pay' | null {
  if (r.paymentMethod !== 'BANK_TRANSFER' || r.reservationStatus === 'CANCELLED') return null;
  if (r.proofStatus === 'RECHAZADO') return 'present';
  const open = r.reservationStatus === 'PENDING_PAYMENT' || r.reservationStatus === 'CONFIRMED';
  return open && r.balanceCents > 0 && r.proofStatus !== 'EN_VALIDACION' && !r.reschedulingPending ? 'pay' : null;
}

export interface NoticeLine { readonly text: string; readonly action?: 'pay' | 'present' | 'credit' }

/** What setupDashboardNotifications (app.js 4758) writes of one reservation; nothing for a reservation in rescheduling (HU-COM-018 has its own). */
export function noticeLines(n: PaymentNotice): NoticeLine[] {
  const lines: NoticeLine[] = [];
  const cop = (cents: number | undefined) => formatCop(cents ?? 0);
  const deadline = deadlineText({ reservationStatus: n.reservationStatus ?? '', proofStatus: n.proofStatus, balanceCents: n.balanceCents ?? 0, deadlineAt: n.deadlineAt, reschedulingPending: n.reschedulingPending });
  const owes = (n.balanceCents ?? 0) > 0;
  if (n.reschedulingPending) return lines;
  if (n.reservationStatus === 'CANCELLED') {
    if (n.cancellationCause) lines.push({ text: `${n.cancellationCause}.${n.pendingTreatmentCents ? ` ${T.noticeTreatment(cop(n.pendingTreatmentCents))}` : ''}` });
  } else if (n.proofStatus === 'EN_VALIDACION') lines.push({ text: T.noticeReview });
  else if (n.proofStatus === 'RECHAZADO') lines.push({ text: T.noticeRejected, action: 'present' });
  else if (n.reservationStatus === 'CONFIRMED' && owes) lines.push({ text: `${T.noticeConfirmed(cop(n.balanceCents))} ${deadline}`.trim(), action: 'pay' });
  else if (n.reservationStatus === 'PENDING_PAYMENT' && owes) lines.push({ text: `${T.noticePending} ${deadline}`.trim(), action: 'pay' });
  if ((n.creditBalanceCents ?? 0) > 0) lines.push({ text: T.noticeCredit(cop(n.creditBalanceCents)), action: 'credit' });
  return lines;
}

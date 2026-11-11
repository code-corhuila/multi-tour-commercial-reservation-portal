import type { Reservation } from '../../reservations/data/reservations-source';

/** RN-PY3 (AC2): PDF, JPG, JPEG or PNG, at most 5 MB; checked by the form and again by the writer (D-04). */
const PROOF_TYPES = /\.(pdf|jpe?g|png)$/i;
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_RULE = 'El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.';

export function proofProblem(file: File): string | null {
  return PROOF_TYPES.test(file.name) && file.size <= PROOF_MAX_BYTES ? null : PROOF_RULE;
}

/**
 * What 13 offers for a reservation (mockup app.js 6700-6744): cancelled and settled close the form with their note, executed and
 * finished too (spec 009- section 5), and a transfer proof En validación locks it. The demo writer refuses the closed ones.
 */
export type PaymentEntry = 'open' | 'in-validation' | 'cancelled' | 'closed' | 'settled';
export function paymentEntryOf(r: Reservation): PaymentEntry {
  if (r.status === 'CANCELADA') return 'cancelled';
  if (r.status === 'EN_EJECUCION' || r.status === 'FINALIZADA') return 'closed';
  if (r.balanceCents === 0) return 'settled';
  return r.paymentMethod === 'BANK_TRANSFER' && r.payments?.at(-1)?.proofStatus === 'EN_VALIDACION' ? 'in-validation' : 'open';
}

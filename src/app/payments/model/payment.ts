/** RN-PY3 (AC2): PDF, JPG, JPEG or PNG, at most 5 MB; checked by the form and again by the writer (D-04). */
const PROOF_TYPES = /\.(pdf|jpe?g|png)$/i;
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_RULE = 'El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.';

export function proofProblem(file: File): string | null {
  return PROOF_TYPES.test(file.name) && file.size <= PROOF_MAX_BYTES ? null : PROOF_RULE;
}

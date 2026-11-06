import { Observable } from 'rxjs';

/**
 * HU-COM-010: the file of a payment proof, as the reviewer opens it. The service never serves it by a public address: it answers the
 * bytes of GET /payment-proofs/{paymentId}/file (no-store, nosniff; PDF, JPEG or PNG) to a caller who may review. The answer is a Blob held in memory.
 */
export abstract class ProofFileSource { abstract read(paymentId: string): Observable<Blob>; }

import { Observable } from 'rxjs';
import { ProofFileSource } from '../payments/data/proof-file-source';
import { PortalApiClient } from '../shell-contract';
import { call } from './api-paths';
import { paymentProofsPath } from './proof-review-api-sources';

/** GET /payment-proofs/{id}/file through the container client, which adds the session and returns the answer as a Blob (`responseType: 'blob'`). The path holds only the payment id. */
export class ProofFileApiSource extends ProofFileSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override read(paymentId: string): Observable<Blob> {
    return call<Blob>(this.client, paymentProofsPath(paymentId, 'file'), { responseType: 'blob' });
  }
}

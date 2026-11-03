import { Observable } from 'rxjs';
import { AssociatedEstablishmentsSource } from '../establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter, RegisterEstablishmentCommand } from '../establishments/data/associated-establishments-writer';
import { AssociatedEstablishment, EstablishmentFilters } from '../establishments/model/associated-establishment';
import { PortalApiClient } from '../shell-contract';
import { call, establishmentsPath, listAll } from './api-paths';

/** Associated establishments over the container client (openapi.yaml: /associated-establishments). */
export class EstablishmentsApiSource extends AssociatedEstablishmentsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(filters: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]> {
    return listAll<AssociatedEstablishment>(this.client, establishmentsPath(), { establishmentType: filters.establishmentType, associationStatus: filters.associationStatus });
  }
  get(associationId: string): Observable<AssociatedEstablishment> { return call(this.client, establishmentsPath(associationId)); }
}

export class EstablishmentsApiWriter extends AssociatedEstablishmentsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  /**
   * The contract is multipart/form-data with the image. The container client sends a FormData as is (front
   * 0762145d, spec DD-13), so the body is built here and never faked with fetch: the credential lives only in
   * the container client.
   */
  override register(command: RegisterEstablishmentCommand, idempotencyKey: string): Observable<AssociatedEstablishment> {
    const body = new FormData();
    body.set('establishmentType', command.establishmentType);
    body.set('commercialName', command.commercialName);
    body.set('commercialInformation', command.commercialInformation);
    body.set('image', command.image);
    return call(this.client, establishmentsPath(), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }
  override inactivate(associationId: string): Observable<AssociatedEstablishment> { return call(this.client, establishmentsPath(associationId, 'inactivate'), { method: 'POST' }); }
  override reactivate(associationId: string): Observable<AssociatedEstablishment> { return call(this.client, establishmentsPath(associationId, 'reactivate'), { method: 'POST' }); }
}

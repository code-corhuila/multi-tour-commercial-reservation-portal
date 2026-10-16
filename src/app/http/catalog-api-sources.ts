import { Observable } from 'rxjs';
import { CatalogItemsSource, CatalogItemsWriter } from '../catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand, UpdateDescriptionCommand } from '../catalog/model/catalog-item';
import { PortalApiClient } from '../shell-contract';
import { call, catalogPath, listAll } from './api-paths';

/** Catalog over the container client (openapi.yaml: /catalog/services). Inactive items are included by the contract.
 *  The validity dates are not in the contract yet (gap G-B): the writer drops them so the request stays valid. */
export class CatalogApiSource extends CatalogItemsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly CatalogItem[]> { return listAll<CatalogItem>(this.client, catalogPath()); }
}

export class CatalogApiWriter extends CatalogItemsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem> {
    const { validFrom: _from, validTo: _to, operationalRestrictions: _restrictions, route: _route, ...body } = command;
    return call(this.client, catalogPath(), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }
  override update(serviceId: string, command: UpdateCatalogItemCommand | UpdateDescriptionCommand): Observable<CatalogItem> {
    const { validFrom: _from, validTo: _to, ...body } = command as UpdateCatalogItemCommand;
    return call(this.client, catalogPath(serviceId), { method: 'PATCH', body });
  }
  override inactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'inactivate'), { method: 'POST' }); }
  override reactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'reactivate'), { method: 'POST' }); }
}

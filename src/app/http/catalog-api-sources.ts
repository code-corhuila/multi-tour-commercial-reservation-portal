import { Observable } from 'rxjs';
import { CatalogItemsSource, CatalogItemsWriter } from '../catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand, UpdateDescriptionCommand } from '../catalog/model/catalog-item';
import { PortalApiClient } from '../shell-contract';
import { call, catalogPath, listAll } from './api-paths';

/** Catalog over the container client (openapi.yaml: /catalog/services). Inactive items are included by the contract. */
export class CatalogApiSource extends CatalogItemsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly CatalogItem[]> { return listAll<CatalogItem>(this.client, catalogPath()); }
}

export class CatalogApiWriter extends CatalogItemsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem> {
    return call(this.client, catalogPath(), { method: 'POST', body: command, headers: { 'Idempotency-Key': idempotencyKey } });
  }
  override update(serviceId: string, command: UpdateCatalogItemCommand | UpdateDescriptionCommand): Observable<CatalogItem> {
    return call(this.client, catalogPath(serviceId), { method: 'PATCH', body: command });
  }
  override inactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'inactivate'), { method: 'POST' }); }
  override reactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'reactivate'), { method: 'POST' }); }
}

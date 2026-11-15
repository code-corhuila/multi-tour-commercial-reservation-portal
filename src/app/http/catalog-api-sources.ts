import { Observable } from 'rxjs';
import { CatalogItemsSource, CatalogItemsWriter } from '../catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand, UpdateDescriptionCommand } from '../catalog/model/catalog-item';
import { PortalApiClient } from '../shell-contract';
import { call, catalogPath, listAll } from './api-paths';

/** Catalog over the container client (openapi.yaml: /catalog/services). Inactive items are included by the contract.
 *  The validity dates are not in the contract yet (gap G-B): the writer drops them so the request stays valid.
 *  The contract wants an empty optional field omitted, never null (it answers 400): the body carries no null or undefined. */
export class CatalogApiSource extends CatalogItemsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(): Observable<readonly CatalogItem[]> { return listAll<CatalogItem>(this.client, catalogPath()); }
}

/** The request body without the properties that are null or undefined (the contract says: omit the field). */
function withoutEmpty(body: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null && value !== undefined));
}

export class CatalogApiWriter extends CatalogItemsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem> {
    const { validFrom: _from, validTo: _to, operationalRestrictions: _restrictions, route: _route, ...body } = command;
    return call(this.client, catalogPath(), { method: 'POST', body: withoutEmpty(body), headers: { 'Idempotency-Key': idempotencyKey } });
  }
  override update(serviceId: string, command: UpdateCatalogItemCommand | UpdateDescriptionCommand): Observable<CatalogItem> {
    const { validFrom: _from, validTo: _to, ...body } = command as UpdateCatalogItemCommand;
    return call(this.client, catalogPath(serviceId), { method: 'PATCH', body: withoutEmpty(body) });
  }
  override inactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'inactivate'), { method: 'POST' }); }
  override reactivate(serviceId: string): Observable<CatalogItem> { return call(this.client, catalogPath(serviceId, 'reactivate'), { method: 'POST' }); }
}

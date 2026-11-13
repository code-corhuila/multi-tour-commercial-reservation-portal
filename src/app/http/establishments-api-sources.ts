import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AssociatedEstablishmentsSource } from '../establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter, RegisterEstablishmentCommand } from '../establishments/data/associated-establishments-writer';
import { AssociatedEstablishment, EstablishmentChange, EstablishmentChangeKind, EstablishmentFilters } from '../establishments/model/associated-establishment';
import { tenantWallTime } from '../shared/clock';
import { PortalApiClient } from '../shell-contract';
import { call, establishmentsPath, listAll } from './api-paths';

/** One entry of `GET /associated-establishments/changes` (PROPOSED, HU-COM-002 AC-PE.14); the service gives the person as an identifier (DP-002-V19-3). */
interface ChangeDto { readonly associationId: string; readonly eventType: EstablishmentChangeKind; readonly reason?: string | null; readonly actorId: string; readonly occurredAt: string }
const toChange = (dto: ChangeDto): EstablishmentChange => ({ kind: dto.eventType, at: tenantWallTime(dto.occurredAt).slice(0, 19), by: dto.actorId, ...(dto.reason ? { reason: dto.reason } : {}) });

/** Associated establishments over the container client (openapi.yaml: /associated-establishments). */
export class EstablishmentsApiSource extends AssociatedEstablishmentsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  override list(filters: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]> {
    const items = listAll<AssociatedEstablishment>(this.client, establishmentsPath(), { establishmentType: filters.establishmentType, associationStatus: filters.associationStatus });
    // The log is newest first; each establishment keeps its own entries oldest first. When it cannot be read the changes stay absent, not empty.
    const log = listAll<ChangeDto>(this.client, `${establishmentsPath()}/changes`, { establishmentType: filters.establishmentType }).pipe(catchError(() => of(null)));
    return forkJoin([items, log]).pipe(map(([rows, entries]) => entries === null ? rows
      : rows.map((row) => ({ ...row, changes: entries.filter((entry) => entry.associationId === row.associationId).reverse().map(toChange) }))));
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
    for (const [name, value] of [['contactEmail', command.contactEmail], ['contactPhone', command.contactPhone], ['contactAddress', command.contactAddress]] as const) { if (value) { body.set(name, value); } }
    body.set('image', command.image);
    return call(this.client, establishmentsPath(), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }
  override inactivate(associationId: string, reason: string): Observable<AssociatedEstablishment> { return call(this.client, establishmentsPath(associationId, 'inactivate'), { method: 'POST', body: { reason } }); }
  override reactivate(associationId: string, reason: string): Observable<AssociatedEstablishment> { return call(this.client, establishmentsPath(associationId, 'reactivate'), { method: 'POST', body: { reason } }); }
}

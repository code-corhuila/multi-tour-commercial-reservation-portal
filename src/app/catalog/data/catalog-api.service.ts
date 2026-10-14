import { Observable } from 'rxjs';
import {
  CatalogItem,
  CreateCatalogItemCommand,
  UpdateCatalogItemCommand,
  UpdateDescriptionCommand,
} from '../model/catalog-item';

/** The catalog record other stories read through this port (amendment 2026-10-13, plan H-D2). */
export type { CatalogItem } from '../model/catalog-item';

/**
 * What the pages need from the catalog service. Abstract on purpose: the implementation over the
 * container HttpClient is tasks T-05 and T-06, and this portal never creates a client of its own
 * (portalDeclaresNoHttpClientOfItsOwn). Pages inject this class, so tests give them a controllable source.
 */
export abstract class CatalogItemsSource {
  abstract list(): Observable<readonly CatalogItem[]>;
}

/**
 * What the form needs to save an item. Abstract for the same reason as the source: the
 * implementation over the container HttpClient comes with the container (T-09). A refusal reaches
 * the form as an ApiError of shell-contract.ts.
 *
 * Only creation takes the Idempotency-Key (api plan D-06). An update and the two status actions are
 * idempotent by nature: inactivating twice leaves the same state, so they carry no key.
 */
export abstract class CatalogItemsWriter {
  abstract create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem>;
  abstract update(serviceId: string, command: UpdateCatalogItemCommand | UpdateDescriptionCommand): Observable<CatalogItem>;
  /** The item stays readable and listed; only its commercial eligibility changes. */
  abstract inactivate(serviceId: string): Observable<CatalogItem>;
  abstract reactivate(serviceId: string): Observable<CatalogItem>;
}

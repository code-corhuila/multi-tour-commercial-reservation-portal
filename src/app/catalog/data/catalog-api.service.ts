import { Observable } from 'rxjs';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand } from '../model/catalog-item';

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
 * implementation over the container HttpClient comes with the container (T-09), and the
 * Idempotency-Key is T-06. A refusal reaches the form as an ApiError of shell-contract.ts.
 */
export abstract class CatalogItemsWriter {
  abstract create(command: CreateCatalogItemCommand): Observable<CatalogItem>;
  abstract update(serviceId: string, command: UpdateCatalogItemCommand): Observable<CatalogItem>;
}

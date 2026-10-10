import { Injectable } from '@angular/core';
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
 * implementation over the container HttpClient comes with the container (T-09). A refusal reaches
 * the form as an ApiError of shell-contract.ts.
 *
 * Only creation takes the Idempotency-Key (api plan D-06): an update is idempotent by nature.
 */
export abstract class CatalogItemsWriter {
  abstract create(command: CreateCatalogItemCommand, idempotencyKey: string): Observable<CatalogItem>;
  abstract update(serviceId: string, command: UpdateCatalogItemCommand): Observable<CatalogItem>;
}

/**
 * Makes the Idempotency-Key of a create intention (RN-P6, D-07). Abstract so a test can tell which
 * key travelled with which request; the factory below is what the portal runs with.
 */
@Injectable({ providedIn: 'root', useFactory: () => new RandomIdempotencyKeys() })
export abstract class IdempotencyKeys {
  abstract generate(): string;
}

/** A UUID is 36 characters, inside the 8 to 128 the draft contract accepts for the header. */
class RandomIdempotencyKeys extends IdempotencyKeys {
  override generate(): string {
    return crypto.randomUUID();
  }
}

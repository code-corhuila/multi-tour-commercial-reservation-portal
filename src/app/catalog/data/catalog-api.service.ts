import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActorRole,
  CatalogItem,
  CreateCatalogItemCommand,
  UpdateCatalogItemCommand,
  UpdateDescriptionCommand,
} from '../model/catalog-item';

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

/**
 * Who is acting and what the tenant allows, as the container reports it. The portal keeps no
 * session and reads no token (norm 5.4.1); the real implementation arrives with the container (T-09).
 * Until then the factory below fails closed: with no actor provided the portal is READ_ONLY and offers
 * no register, edit or status action. Acting as the Administrator has to be provided explicitly
 * (app.config.ts does it for standalone development). The screen is convenience only (D-09): the
 * service refuses what the actor may not do, whatever the screen shows.
 *
 * DP-PT-06 is open: an account with several roles has no defined way to choose which it acts as, so
 * this reports ONE internal role and the screens assume it.
 */
@Injectable({ providedIn: 'root', useFactory: () => new ReadOnlyActor() })
export abstract class ActorContext {
  abstract readonly role: ActorRole;
  /** Whether the tenant enabled the Collaborator to change descriptive information. False unless declared. */
  readonly collaboratorMayEditDescription: boolean = false;
}

/** The default actor: reads and changes nothing. collaboratorMayEditDescription stays false. */
class ReadOnlyActor extends ActorContext {
  override readonly role = 'READ_ONLY' as const;
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

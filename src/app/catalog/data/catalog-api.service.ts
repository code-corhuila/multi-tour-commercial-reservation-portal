import { Observable } from 'rxjs';
import { CatalogItem } from '../model/catalog-item';

/**
 * What the pages need from the catalog service. Abstract on purpose: the implementation over the
 * container HttpClient is tasks T-05 and T-06, and this portal never creates a client of its own
 * (portalDeclaresNoHttpClientOfItsOwn). Pages inject this class, so tests give them a controllable source.
 */
export abstract class CatalogItemsSource {
  abstract list(): Observable<readonly CatalogItem[]>;
}

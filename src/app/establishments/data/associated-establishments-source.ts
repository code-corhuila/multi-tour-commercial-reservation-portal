import { Observable } from 'rxjs';
import { AssociatedEstablishment, EstablishmentFilters } from '../model/associated-establishment';

/** The container supplies the implementation; tests supply a controllable double. */
export abstract class AssociatedEstablishmentsSource {
  abstract list(filters: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]>;
}

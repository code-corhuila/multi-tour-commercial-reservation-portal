import { Observable } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
import { capabilitiesOf } from '../../catalog/model/catalog-item';
import { AssociatedEstablishment, EstablishmentFilters } from '../model/associated-establishment';

/** The container supplies the implementation; tests supply a controllable double. */
export abstract class AssociatedEstablishmentsSource {
  abstract list(filters: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]>;
}

/** RF-018 excludes the Collaborator even when the catalog permits descriptive edits. */
export function canReadEstablishments(actor: ActorContext): boolean {
  return actor.role !== 'OPERATIONAL_COLLABORATOR'
    && capabilitiesOf(actor.role, actor.collaboratorMayEditDescription).canRead;
}

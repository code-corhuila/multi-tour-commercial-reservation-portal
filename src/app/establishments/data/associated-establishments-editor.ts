import { Observable } from 'rxjs';
import { AssociatedEstablishment } from '../model/associated-establishment';

/** What "Guardar cambios" sends: the two descriptive fields of the record; the type, the image and the status are not edited here. */
export interface UpdateEstablishmentCommand {
  readonly commercialName: string;
  readonly commercialInformation: string;
}

/** PROPOSED (gap G-B): the container supplies the adapter. Optional like the writer: without it the panel shows the bitácora and no fields. */
export abstract class AssociatedEstablishmentsEditor {
  abstract update(associationId: string, command: UpdateEstablishmentCommand): Observable<AssociatedEstablishment>;
}

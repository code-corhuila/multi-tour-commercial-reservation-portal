import { Observable } from 'rxjs';
import { AssociatedEstablishment, EstablishmentType } from '../model/associated-establishment';

/** PROPOSED registration contract: the file and promotional fields are one intention. */
export interface RegisterEstablishmentCommand {
  readonly establishmentType: EstablishmentType;
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly image: File;
}
/** The container supplies the adapter and ApiError failures; transitions carry no key. */
export abstract class AssociatedEstablishmentsWriter {
  abstract register(command: RegisterEstablishmentCommand, idempotencyKey: string): Observable<AssociatedEstablishment>;
  abstract inactivate(associationId: string): Observable<AssociatedEstablishment>;
  abstract reactivate(associationId: string): Observable<AssociatedEstablishment>;
}

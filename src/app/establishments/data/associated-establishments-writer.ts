import { Observable } from 'rxjs';
import { AssociatedEstablishment, EstablishmentType } from '../model/associated-establishment';

/** Registration of the published contract (multipart): the file and promotional fields are one intention. */
export interface RegisterEstablishmentCommand {
  readonly establishmentType: EstablishmentType;
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly image: File;
  /** At least one of the email and the phone is required (AC-PE.15); what was not typed is left out. */
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly contactAddress?: string;
}
/** The container supplies the adapter and ApiError failures; transitions carry no key but a mandatory reason (AC-PE.13). */
export abstract class AssociatedEstablishmentsWriter {
  abstract register(command: RegisterEstablishmentCommand, idempotencyKey: string): Observable<AssociatedEstablishment>;
  abstract inactivate(associationId: string, reason: string): Observable<AssociatedEstablishment>;
  abstract reactivate(associationId: string, reason: string): Observable<AssociatedEstablishment>;
}

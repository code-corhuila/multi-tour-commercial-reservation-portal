import { Observable, Subject } from 'rxjs';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishment, EstablishmentFilters, EstablishmentType } from '../src/app/establishments/model/associated-establishment';

export class ControllableEstablishmentsSource extends AssociatedEstablishmentsSource {
  readonly requests: Array<{
    filters: EstablishmentFilters;
    reply: (items: readonly AssociatedEstablishment[]) => void;
    fail: () => void;
    isOpen: () => boolean;
  }> = [];

  override list(filters: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]> {
    return new Observable((subscriber) => {
      const answers = new Subject<readonly AssociatedEstablishment[]>();
      const subscription = answers.subscribe(subscriber);
      this.requests.push({
        filters: { ...filters },
        reply: (items) => { answers.next(items); answers.complete(); },
        fail: () => answers.error(new Error('service down')),
        isOpen: () => !subscription.closed,
      });
      return () => subscription.unsubscribe();
    });
  }
}

export function establishmentNamed(commercialName: string, establishmentType: EstablishmentType = 'HOTEL'): AssociatedEstablishment {
  return {
    associationId: commercialName,
    establishmentType,
    commercialName,
    commercialInformation: 'Contact the establishment directly.',
    imageReference: '/public/example.webp',
    associationStatus: 'ACTIVE',
  };
}

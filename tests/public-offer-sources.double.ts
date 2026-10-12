import { Observable, Subject } from 'rxjs';
import { PublicEstablishmentsSource, PublicOfferSource } from '../src/app/public-offer/data/public-offer-sources';
import { PublicEstablishment, PublicTour } from '../src/app/public-offer/model/public-offer';

/** One request the page made, answered or failed when the test decides. */
export interface PendingRead<T> {
  readonly date: string | undefined;
  readonly reply: (items: readonly T[]) => void;
  readonly fail: () => void;
  readonly isOpen: () => boolean;
}

function controllable<T>(requests: PendingRead<T>[], date?: string): Observable<readonly T[]> {
  return new Observable<readonly T[]>((subscriber) => {
    const answers = new Subject<readonly T[]>();
    const inner = answers.subscribe(subscriber);
    let open = true;
    requests.push({
      date,
      reply: (items) => { answers.next(items); answers.complete(); },
      fail: () => answers.error(new Error('service down')),
      isOpen: () => open,
    });
    return () => { open = false; inner.unsubscribe(); };
  });
}

/** A tours port for tests only: it never answers on its own. */
export class ControllablePublicOfferSource extends PublicOfferSource {
  readonly requests: PendingRead<PublicTour>[] = [];
  override listAvailable(date: string): Observable<readonly PublicTour[]> { return controllable(this.requests, date); }
}

/** An establishments port for tests only: it never answers on its own. */
export class ControllablePublicEstablishmentsSource extends PublicEstablishmentsSource {
  readonly requests: PendingRead<PublicEstablishment>[] = [];
  override listActive(): Observable<readonly PublicEstablishment[]> { return controllable(this.requests); }
}

export function tourNamed(commercialName: string, overrides: Partial<PublicTour> = {}): PublicTour {
  return { serviceId: `tour-${commercialName}`, commercialName, baseRateCents: 1_800_000, transportIncluded: false, available: true, ...overrides };
}

export function placeNamed(commercialName: string, overrides: Partial<PublicEstablishment> = {}): PublicEstablishment {
  return {
    establishmentId: `place-${commercialName}`, establishmentType: 'HOTEL', commercialName,
    commercialInformation: `Contacto de ${commercialName}: 300 000 0000`, imageReference: 'demo://image.jpg', active: true, ...overrides,
  };
}

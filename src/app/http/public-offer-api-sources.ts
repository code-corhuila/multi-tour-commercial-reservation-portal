import { Observable, map, throwError } from 'rxjs';
import { PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from '../public-offer/data/public-offer-sources';
import { PublicEstablishment, PublicTour, TourValue } from '../public-offer/model/public-offer';
import { PUBLIC_OFFER_COPY } from '../public-offer/public-offer-copy';
import { ApiError, PortalApiClient } from '../shell-contract';
import { listAll, publicOfferPath } from './api-paths';

/** PublicTour of the contract (PROPOSED). `maxTravelers` and every other field the portal does not show are left out on purpose (RN-PO6). */
interface PublicTourDto {
  readonly serviceId: string; readonly commercialName: string; readonly transportIncluded: boolean; readonly baseValueCents: number;
  readonly finalValueCents: number; readonly discountPercentageBp: number | null;
}

/** PublicEstablishment of the contract (PROPOSED): the contact travels inside the commercial information (DP-PO3). */
interface PublicEstablishmentDto {
  readonly associationId: string; readonly establishmentType: PublicEstablishment['establishmentType'];
  readonly commercialName: string; readonly commercialInformation: string; readonly imageUrl: string;
}

/** The channel was mounted without a tenant identifier: nothing is asked, and the page shows its error state. */
const noTenant = (): Observable<never> => throwError((): ApiError => ({
  status: 0, code: 'NO_TENANT_IDENTIFIER', message: 'The channel has no tenant identifier.', details: [], traceId: '',
  userMessage: 'No se pudo identificar el canal del operador.',
}));

/**
 * The offered tours over the public route of the contract. The service decides what is offered, so every tour it
 * returns is available. DEBT (G-SAL): the contract has no date parameter, so the date of the page is not sent.
 */
export class PublicOfferApiSource extends PublicOfferSource {
  constructor(private readonly client: PortalApiClient, private readonly identifier: () => string | null) { super(); }
  override listAvailable(_date: string): Observable<readonly PublicTour[]> {
    const tenant = this.identifier();
    if (!tenant) { return noTenant(); }
    return listAll<PublicTourDto>(this.client, publicOfferPath(tenant, 'tours')).pipe(map((tours) => tours.map((tour): PublicTour => ({
      serviceId: tour.serviceId, commercialName: tour.commercialName, baseRateCents: tour.baseValueCents,
      transportIncluded: tour.transportIncluded, available: true,
      finalValueCents: tour.finalValueCents, discountPercentageBp: tour.discountPercentageBp,
    }))));
  }
}

/** The active establishments over the public route of the contract; inactive ones are never returned by it (RN-ASO-001). */
export class PublicEstablishmentsApiSource extends PublicEstablishmentsSource {
  constructor(private readonly client: PortalApiClient, private readonly identifier: () => string | null) { super(); }
  override listActive(): Observable<readonly PublicEstablishment[]> {
    const tenant = this.identifier();
    if (!tenant) { return noTenant(); }
    return listAll<PublicEstablishmentDto>(this.client, publicOfferPath(tenant, 'associated-establishments')).pipe(map((places) => places.map((place): PublicEstablishment => ({
      establishmentId: place.associationId, establishmentType: place.establishmentType, commercialName: place.commercialName,
      commercialInformation: place.commercialInformation, imageReference: place.imageUrl, active: true,
    }))));
  }
}

/** Basis points as the tag writes them, in integers: 1000 is "10", 1250 is "12,5", 1 is "0,01". */
const percentOf = (bp: number): string => {
  const hundredths = String(bp % 100).padStart(2, '0').replace(/0$/, '');
  return `${Math.floor(bp / 100)}${bp % 100 ? ',' + hundredths : ''}`;
};

/** The value of a tour is the one the service calculated and sent with it; the portal copies the percentage and derives no money (RN-PO4, plan D-06). */
export class PublicTourValueSource extends TourValueSource {
  override valueOf(tour: PublicTour, _date: string): TourValue {
    const current = tour.finalValueCents ?? tour.baseRateCents;
    const bp = tour.discountPercentageBp ?? 0;
    return current < tour.baseRateCents && bp > 0
      ? { baseRateCents: tour.baseRateCents, currentValueCents: current, discountLabel: PUBLIC_OFFER_COPY.discountTag(percentOf(bp)) }
      : { baseRateCents: tour.baseRateCents, currentValueCents: current };
  }
}

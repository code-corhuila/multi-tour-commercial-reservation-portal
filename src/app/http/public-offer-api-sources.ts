import { Observable, map, throwError } from 'rxjs';
import { PublicEstablishmentsSource, PublicOfferSource } from '../public-offer/data/public-offer-sources';
import { PublicEstablishment, PublicTour } from '../public-offer/model/public-offer';
import { ApiError, PortalApiClient } from '../shell-contract';
import { listAll, publicOfferPath } from './api-paths';

/** PublicTour of the contract (PROPOSED). `maxTravelers` and every other field the portal does not show are left out on purpose (RN-PO6). */
interface PublicTourDto { readonly serviceId: string; readonly commercialName: string; readonly transportIncluded: boolean; readonly baseValueCents: number }

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

import { Observable, map } from 'rxjs';
import { PublicEstablishmentsSource, PublicOfferSource } from '../public-offer/data/public-offer-sources';
import { PublicEstablishment, PublicTour } from '../public-offer/model/public-offer';
import { DemoCatalogStore, DemoEstablishmentsStore } from './demo-sources';

// DEMO (plan D-05): the public offer reads the same in-memory stores as the management screens; no data is duplicated.
// Debt: the public endpoints of the -api replace these adapters (spec G-API); enablement per date is G-SAL.

const TRANSPORT_TOUR_ID = 'demo-svc-6';

/** Appends, once, one invented tour with transport to the catalog store, so AC-PO.3 has demo evidence. */
export function seedTransportTour(store: DemoCatalogStore): void {
  if (store.find(TRANSPORT_TOUR_ID)) { return; }
  store.add({
    serviceId: TRANSPORT_TOUR_ID, serviceType: 'TOUR', commercialName: 'San Agustín con traslado incluido', catalogStatus: 'ACTIVE',
    baseRateCents: 26_000_000, baseOperationalCostCents: 15_600_000, configuredCapacity: 14, transportRequired: true, highRisk: false,
    createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z',
  });
}

/** In the demo a tour is available on any date while it is active in the catalog (spec section 7). */
export class DemoPublicOfferSource extends PublicOfferSource {
  constructor(private readonly store: DemoCatalogStore) { super(); }
  override listAvailable(_date: string): Observable<readonly PublicTour[]> {
    return this.store.list().pipe(map((items) => items
      .filter((item) => item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE')
      .map((item): PublicTour => ({
        serviceId: item.serviceId, commercialName: item.commercialName, baseRateCents: item.baseRateCents,
        transportIncluded: item.transportRequired, available: true,
      }))));
  }
}

/** The active associations of the establishments store, projected without their status. */
export class DemoPublicEstablishmentsSource extends PublicEstablishmentsSource {
  constructor(private readonly store: DemoEstablishmentsStore) { super(); }
  override listActive(): Observable<readonly PublicEstablishment[]> {
    return this.store.list({ associationStatus: 'ACTIVE' }).pipe(map((items) => items.map((item): PublicEstablishment => ({
      establishmentId: item.associationId, establishmentType: item.establishmentType, commercialName: item.commercialName,
      commercialInformation: item.commercialInformation, imageReference: item.imageReference, active: true,
    }))));
  }
}

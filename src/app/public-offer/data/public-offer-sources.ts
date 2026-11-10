import { Observable } from 'rxjs';
import { PublicEstablishment, PublicTour, TourValue } from '../model/public-offer';
import type { Departure } from '../../reservations/data/departures-source';

/** The tours the service declares available on a date (plan D-04). The container supplies it; the demo reads the catalog store. */
export abstract class PublicOfferSource {
  abstract listAvailable(date: string): Observable<readonly PublicTour[]>;
}

/** The active associated establishments of the tenant of the channel (plan D-04). */
export abstract class PublicEstablishmentsSource {
  abstract listActive(): Observable<readonly PublicEstablishment[]>;
}

/**
 * The current value of a tour on a date (plan D-06). TODO(HU-COM-004): implemented by the pure function
 * of `current-discounts` once it is in develop; until then no provider exists and the base value is shown.
 */
export abstract class TourValueSource {
  abstract valueOf(tour: PublicTour, date: string): TourValue;
}

/**
 * The open departures a visitor can see, read from the public tour detail (HU-COM-006 portal spec A.6b, decision of 2026-11-03).
 * Optional: where the container provides none, the page falls back to the departures port of HU-COM-007.
 */
export abstract class PublicDeparturesSource {
  abstract list(): Observable<readonly Departure[]>;
}

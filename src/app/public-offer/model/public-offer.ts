/**
 * The public projection of a tour (plan D-03): no cost, capacity or catalog status ever reaches it.
 * `available` is the answer of the service for the date asked; the page drops anything not available.
 */
export interface PublicTour {
  readonly serviceId: string;
  readonly commercialName: string;
  readonly baseRateCents: number;
  readonly transportIncluded: boolean;
  readonly available: boolean;
}

/** The public projection of an associated establishment; the contact travels in the commercial information (DP-PO3). */
export interface PublicEstablishment {
  readonly establishmentId: string;
  readonly establishmentType: 'HOTEL' | 'RESTAURANT';
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly imageReference: string;
  readonly active: boolean;
}

/** The value of a tour on a date, in cents, as HU-COM-004's rule calculates it. */
export interface TourValue {
  readonly baseRateCents: number;
  readonly currentValueCents: number;
}

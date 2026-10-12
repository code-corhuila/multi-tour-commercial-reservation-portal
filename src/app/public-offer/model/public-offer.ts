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
  /** The validity of the offer, when the service declares it (G-SAL); without it the detail shows the consulted date. */
  readonly validity?: { readonly from: string; readonly to: string };
}

/** The public projection of an associated establishment; the contact travels in the commercial information (DP-PO3). */
export interface PublicEstablishment {
  readonly establishmentId: string;
  readonly establishmentType: 'HOTEL' | 'RESTAURANT';
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly imageReference: string;
  readonly active: boolean;
  readonly region?: string;
  /** Contact fields, drawn only when the data has them (DP-PO3); the commercial information is never shown as contact. */
  readonly contact?: { readonly email?: string; readonly phone?: string; readonly address?: string };
}

/** The value of a tour on a date, in cents, as HU-COM-004's rule calculates it. */
export interface TourValue {
  readonly baseRateCents: number;
  readonly currentValueCents: number;
  /** The tag of the discount applied, e.g. "20% de descuento", written by HU-COM-004; the view never derives it. */
  readonly discountLabel?: string;
}

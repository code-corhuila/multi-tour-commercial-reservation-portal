/**
 * A catalog item as the PROPOSED contract describes it (`CatalogServiceResponse` of the draft
 * commercial-reservation.yaml). It stays proposed until the contract is published (T-00); reconcile
 * names and types then. Money is in minor units, dates are RFC 3339 strings.
 */
export interface CatalogItem {
  readonly serviceId: string;
  readonly serviceType: 'TOUR' | 'TRANSPORTATION';
  readonly commercialName: string;
  readonly catalogStatus: 'ACTIVE' | 'INACTIVE';
  readonly baseRateCents: number;
  readonly baseOperationalCostCents: number;
  /** Null for an item that does not use capacity control. */
  readonly configuredCapacity: number | null;
  readonly transportRequired: boolean;
  readonly highRisk: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

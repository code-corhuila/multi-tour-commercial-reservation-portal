/** The kinds of item the draft contract allows (`CatalogServiceType`); proposed like the rest of this file. */
export const CATALOG_SERVICE_TYPES = ['TOUR', 'TRANSPORTATION'] as const;
export type CatalogServiceType = (typeof CATALOG_SERVICE_TYPES)[number];

/**
 * A catalog item as the PROPOSED contract describes it (`CatalogServiceResponse` of the draft
 * commercial-reservation.yaml). It stays proposed until the contract is published (T-00); reconcile
 * names and types then. Money is in minor units, dates are RFC 3339 strings.
 */
export interface CatalogItem {
  readonly serviceId: string;
  readonly serviceType: CatalogServiceType;
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

/**
 * What the form sends to register an item (the draft CreateCatalogServiceRequest). Money is in
 * minor units, never a float.
 */
export interface CreateCatalogItemCommand {
  readonly serviceType: CatalogServiceType;
  readonly commercialName: string;
  readonly baseRateCents: number;
  readonly baseOperationalCostCents: number;
  readonly configuredCapacity: number | null;
  readonly transportRequired: boolean;
  readonly highRisk: boolean;
}

/**
 * What the form sends to change an item (the draft UpdateCatalogServiceRequest). It has no
 * serviceType because the contract refuses it (additionalProperties: false): the type is fixed at creation.
 */
export type UpdateCatalogItemCommand = Omit<CreateCatalogItemCommand, 'serviceType'>;

/**
 * What the Collaborator sends when the tenant lets them change descriptive information only
 * (AC-P1.6): the commercial name and no rate, cost, capacity or condition.
 */
export type UpdateDescriptionCommand = Pick<UpdateCatalogItemCommand, 'commercialName'>;

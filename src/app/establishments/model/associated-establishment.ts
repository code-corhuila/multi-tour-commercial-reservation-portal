/** PROPOSED response shape; reconcile with the published contract in T-01. */
export const ESTABLISHMENT_TYPES = ['HOTEL', 'RESTAURANT'] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];
export const ASSOCIATION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type AssociationStatus = (typeof ASSOCIATION_STATUSES)[number];

export interface AssociatedEstablishment {
  readonly associationId: string;
  readonly establishmentType: EstablishmentType;
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly imageReference: string;
  readonly associationStatus: AssociationStatus;
}

/** An absent filter includes both values, so inactive associations stay visible by default. */
export interface EstablishmentFilters {
  readonly establishmentType?: EstablishmentType;
  readonly associationStatus?: AssociationStatus;
}

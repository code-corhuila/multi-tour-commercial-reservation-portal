/** PROPOSED response shape; reconcile with the published contract in T-01. */
export const ESTABLISHMENT_TYPES = ['HOTEL', 'RESTAURANT'] as const;
export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];
export const ASSOCIATION_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type AssociationStatus = (typeof ASSOCIATION_STATUSES)[number];

export const ESTABLISHMENT_CHANGE_KINDS = ['REGISTERED', 'INACTIVATED', 'REACTIVATED', 'UPDATED'] as const;
export type EstablishmentChangeKind = (typeof ESTABLISHMENT_CHANGE_KINDS)[number];
/** A line of the bitácora de cambios (RF-018: every inactivation and reactivation is traced); `at` is the tenant's wall clock. PROPOSED, resolved by the service. */
export interface EstablishmentChange {
  readonly kind: EstablishmentChangeKind;
  readonly at: string;
  readonly by: string;
}

export interface AssociatedEstablishment {
  readonly associationId: string;
  readonly establishmentType: EstablishmentType;
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly imageReference: string;
  readonly associationStatus: AssociationStatus;
  /** Oldest first; absent while the service sends none. */
  readonly changes?: readonly EstablishmentChange[];
}

/** An absent filter includes both values, so inactive associations stay visible by default. */
export interface EstablishmentFilters {
  readonly establishmentType?: EstablishmentType;
  readonly associationStatus?: AssociationStatus;
}

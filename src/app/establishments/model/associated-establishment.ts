/** Response shape of `AssociatedEstablishmentResponse` in the published contract (commercial-reservation.yaml). */
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
  /** Why the state changed; absent for a registration (AC-PE.13). */
  readonly reason?: string;
}

export interface AssociatedEstablishment {
  readonly associationId: string;
  readonly establishmentType: EstablishmentType;
  readonly commercialName: string;
  readonly commercialInformation: string;
  readonly imageReference: string;
  readonly associationStatus: AssociationStatus;
  /** How the customer reaches the establishment (AC-PE.15): any of them may be absent on an association registered before the service stored them. */
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly contactAddress?: string;
  /** Oldest first; absent while the service sends none. */
  readonly changes?: readonly EstablishmentChange[];
}

/** An absent filter includes both values, so inactive associations stay visible by default. */
export interface EstablishmentFilters {
  readonly establishmentType?: EstablishmentType;
  readonly associationStatus?: AssociationStatus;
}

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

/**
 * The internal roles of the Catalog row of the RBAC matrix (`07-api/authentication.md`), plus
 * READ_ONLY: the explicit default when no actor is provided, so the portal fails closed. It is not a
 * role of the matrix; it reads like the Manager and the Analyst and nothing more. The Final
 * Customer is not here: it never opens this management screen.
 */
export type ActorRole = 'READ_ONLY' | 'TENANT_ADMINISTRATOR' | 'OPERATIONAL_COLLABORATOR' | 'MANAGER' | 'ANALYST' | 'ACCOUNTANT';

/** What the screen offers an actor, derived in one place (RN-P8). The service refuses regardless (D-09). */
export interface ActorCapabilities {
  readonly canRegister: boolean;
  /** Rate, cost, capacity, type, transport and risk. */
  readonly canEditCommercialFields: boolean;
  /** The commercial name, the descriptive information. */
  readonly canEditDescription: boolean;
  readonly canChangeStatus: boolean;
  readonly canRead: boolean;
  readonly isDenied: boolean;
}

const READ_ONLY: ActorCapabilities = {
  canRegister: false,
  canEditCommercialFields: false,
  canEditDescription: false,
  canChangeStatus: false,
  canRead: true,
  isDenied: false,
};

/**
 * Administrator: everything. Collaborator: reads, and changes descriptive information only when the
 * tenant enables it. Manager and Analyst: read. Accountant: denied. A role not listed gets nothing.
 */
export function capabilitiesOf(role: ActorRole, collaboratorMayEditDescription: boolean): ActorCapabilities {
  switch (role) {
    case 'TENANT_ADMINISTRATOR':
      return { ...READ_ONLY, canRegister: true, canEditCommercialFields: true, canEditDescription: true, canChangeStatus: true };
    case 'OPERATIONAL_COLLABORATOR':
      return { ...READ_ONLY, canEditDescription: collaboratorMayEditDescription };
    case 'READ_ONLY':
    case 'MANAGER':
    case 'ANALYST':
      return READ_ONLY;
    case 'ACCOUNTANT':
      return { ...READ_ONLY, canRead: false, isDenied: true };
    default:
      return { ...READ_ONLY, canRead: false, isDenied: true };
  }
}

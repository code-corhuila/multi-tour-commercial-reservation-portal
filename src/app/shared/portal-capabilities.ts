import { Injectable, inject } from '@angular/core';
import { ActorContext } from './actor-context';

/**
 * The only place of the portal where a role name appears (amendment 2026-10-13, HC-2, plan H-D2).
 * One table, one row per internal role of the RBAC matrix (`07-api/authentication.md`), answers every
 * decision the screens of 001- to 008- take; a screen asks a capability, never compares a role.
 * READ_ONLY is not a role of the matrix: it is the fail-closed default when no actor is provided, and
 * any role the table does not know reads like it. The service refuses regardless (D-09).
 */
export type ActorRole = 'READ_ONLY' | 'TENANT_ADMINISTRATOR' | 'OPERATIONAL_COLLABORATOR' | 'MANAGER' | 'ANALYST' | 'ACCOUNTANT';

/** The actor with no provided role: reads and changes nothing. */
export const FAIL_CLOSED_ROLE = 'READ_ONLY' satisfies ActorRole;

/** Standalone development acts as the Administrator (app.config.ts); never inside the container. */
export const DEVELOPMENT_ROLE = 'TENANT_ADMINISTRATOR' satisfies ActorRole;

/** What the catalog screen offers (RN-P8). */
export interface CatalogCapabilities {
  readonly canRegister: boolean;
  /** Rate, cost, capacity, type, transport and risk. */
  readonly canEditCommercialFields: boolean;
  /** The commercial name, the descriptive information. */
  readonly canEditDescription: boolean;
  readonly canChangeStatus: boolean;
  readonly canRead: boolean;
  readonly isDenied: boolean;
}

/** What the customers screen offers (HU-COM-005 plan D-07). */
export interface CustomersCapabilities { readonly canRead: boolean; readonly canRegister: boolean; readonly isDenied: boolean; }

/** DP-RS2: who is looking, as far as the customer areas care. Anything not a final customer is OTHER (fails closed). */
export type CustomerStanding = 'FINAL_CUSTOMER' | 'NO_SESSION' | 'OTHER';

type Catalog = 'all' | 'read' | 'description-if-enabled' | 'denied';
type Customers = 'register' | 'read' | 'denied';

interface Row {
  readonly label: string;
  readonly operator: boolean;
  readonly catalog: Catalog;
  readonly customers: Customers;
  /** HU-COM-005 D-06: the permission, never the profile; with the grant only these rows see the data. */
  readonly sensitiveData: boolean;
  readonly manageDiscounts: boolean;
  readonly authorizeAdditionalDiscount: boolean;
  readonly createReservations: boolean;
  /** HU-COM-009: RBAC row Register a payment. */
  readonly registerPayment: boolean;
  /** HU-COM-013: RBAC row Create, modify or cancel a reservation; register a change from 10A. */
  readonly changeReservation: boolean;
  /** HU-COM-010: RBAC row Validate or reject a transfer proof; the Collaborator only with Validar comprobantes (HU-SEC-006, G-PERM). */
  readonly decideProof: 'always' | 'if-granted' | 'never';
  /** HU-COM-018 D-07: propose a new departure or cancel with 100 % refund (story actor line; DP-RP1, DP-RP2 open). */
  readonly proposeRescheduling: boolean;
  /** HU-COM-016: RBAC row Authorize a refund (the Administrator); executing an authorized one also falls to the Collaborator (AC2, DP-RF5). */
  readonly refund: 'authorize' | 'execute' | 'never';
  /** RF-018 excludes the Collaborator even when the catalog permits descriptive edits. */
  readonly readEstablishments: boolean;
}

const NONE = { sensitiveData: false, manageDiscounts: false, authorizeAdditionalDiscount: false, createReservations: false, registerPayment: false, changeReservation: false, decideProof: 'never', refund: 'never',
  proposeRescheduling: false } as const;
const READER: Row = { ...NONE, label: 'Solo lectura', operator: true, catalog: 'read', customers: 'read', readEstablishments: true };

/** Today's nine matrices, moved row by row; no decision changed in the move. */
const TABLE: Readonly<Record<ActorRole, Row>> = Object.freeze({
  TENANT_ADMINISTRATOR: { label: 'Administrador del tenant', operator: true, catalog: 'all', customers: 'register', sensitiveData: true,
    manageDiscounts: true, authorizeAdditionalDiscount: true, createReservations: true, registerPayment: true, changeReservation: true, decideProof: 'always', refund: 'authorize', readEstablishments: true,
    proposeRescheduling: true },
  OPERATIONAL_COLLABORATOR: { ...NONE, label: 'Colaborador operativo', operator: true, catalog: 'description-if-enabled', customers: 'register',
    sensitiveData: true, createReservations: true, registerPayment: true, changeReservation: true, decideProof: 'if-granted', refund: 'execute', readEstablishments: false, proposeRescheduling: true },
  MANAGER: { ...READER, label: 'Gerente' },
  ANALYST: { ...READER, label: 'Analista' },
  ACCOUNTANT: { ...NONE, label: 'Contador', operator: true, catalog: 'denied', customers: 'denied', readEstablishments: false },
  READ_ONLY: { ...READER, operator: false },
});

const CATALOG_READ: CatalogCapabilities = {
  canRegister: false, canEditCommercialFields: false, canEditDescription: false, canChangeStatus: false, canRead: true, isDenied: false,
};

const isKnown = (role: string): role is ActorRole => Object.prototype.hasOwnProperty.call(TABLE, role);

/** What an actor may do, read from the table; injected from the actor the container reported. */
@Injectable({ providedIn: 'root', useFactory: () => PortalCapabilities.of(inject(ActorContext)) })
export class PortalCapabilities {
  private readonly row: Row;

  private constructor(role: string, private readonly collaboratorMayEditDescription: boolean, private readonly collaboratorMayValidateProofs: boolean) {
    this.row = TABLE[isKnown(role) ? role : FAIL_CLOSED_ROLE];
  }

  /** A role the table does not know reads only. */
  static for(role: string, collaboratorMayEditDescription = false, collaboratorMayValidateProofs = false): PortalCapabilities {
    return new PortalCapabilities(role, collaboratorMayEditDescription, collaboratorMayValidateProofs);
  }

  static of(actor: ActorContext): PortalCapabilities {
    return PortalCapabilities.for(actor.role, actor.collaboratorMayEditDescription, actor.collaboratorMayValidateProofs);
  }

  catalog(): CatalogCapabilities {
    switch (this.row.catalog) {
      case 'all': return { ...CATALOG_READ, canRegister: true, canEditCommercialFields: true, canEditDescription: true, canChangeStatus: true };
      case 'description-if-enabled': return { ...CATALOG_READ, canEditDescription: this.collaboratorMayEditDescription };
      case 'read': return CATALOG_READ;
      case 'denied': return { ...CATALOG_READ, canRead: false, isDenied: true };
    }
  }

  customers(): CustomersCapabilities {
    const canRegister = this.row.customers === 'register';
    const canRead = canRegister || this.row.customers === 'read';
    return { canRead, canRegister, isDenied: !canRead };
  }

  canViewSensitiveData(granted: boolean): boolean { return granted && this.row.sensitiveData; }
  canManageDiscounts(): boolean { return this.row.manageDiscounts; }
  canAuthorizeAdditionalDiscount(): boolean { return this.row.authorizeAdditionalDiscount; }
  canCreateReservations(): boolean { return this.row.createReservations; }
  canRegisterPayment(): boolean { return this.row.registerPayment; }
  canRegisterChange(): boolean { return this.row.changeReservation; }
  canAuthorizeRefund(): boolean { return this.row.refund === 'authorize'; }
  canExecuteRefund(): boolean { return this.row.refund !== 'never'; }
  canDecideProof(): boolean { return this.row.decideProof === 'always' || (this.row.decideProof === 'if-granted' && this.collaboratorMayValidateProofs); }
  canProposeRescheduling(): boolean { return this.row.proposeRescheduling; }
  canReadEstablishments(): boolean { return this.row.readEstablishments && this.catalog().canRead; }
  canRegisterEstablishments(): boolean { return this.catalog().canRegister; }
  /** The operator layout; otherwise the customer layout (a final customer or a visitor). */
  isOperator(): boolean { return this.row.operator; }
  /** The role line under the brand. */
  roleLabel(): string { return this.row.label; }
}

const MATRIX_ROLES = Object.keys(TABLE).filter((role) => role !== FAIL_CLOSED_ROLE);

/** DP-PT-06: one role is assumed, the first known one; anything else fails closed to READ_ONLY. */
export function roleOf(roles: readonly string[]): ActorRole {
  return (roles.find((role) => MATRIX_ROLES.includes(role)) as ActorRole | undefined) ?? FAIL_CLOSED_ROLE;
}

/** PROVISIONAL, demo only: the real role string is NO DEFINIDO until HU-SEC-002 (DP-RS2). */
const FINAL_CUSTOMER_ROLE = 'FINAL_CUSTOMER';

export function customerStandingOf(roles: readonly string[]): CustomerStanding {
  if (roles.includes(FINAL_CUSTOMER_ROLE)) return 'FINAL_CUSTOMER';
  return roles.length === 0 ? 'NO_SESSION' : 'OTHER';
}

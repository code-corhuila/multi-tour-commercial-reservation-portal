import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PortalCapabilities, customerStandingOf, roleOf } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { listSourceFiles, withoutComments } from './source-files';
import { ActorContext } from '../src/app/shared/actor-context';

// Amendment 2026-10-13, HC-2 and plan H-D2: one table answers what an actor may do; screens ask it.

/** Every decision the screens of 001- to 008- take today, read from one capabilities object. */
function answers(c: PortalCapabilities, granted = true) {
  return {
    catalog: c.catalog(), customers: c.customers(), sensitiveData: c.canViewSensitiveData(granted),
    manageDiscounts: c.canManageDiscounts(), authorizeAdditionalDiscount: c.canAuthorizeAdditionalDiscount(),
    createReservations: c.canCreateReservations(), readEstablishments: c.canReadEstablishments(),
    registerEstablishments: c.canRegisterEstablishments(), operator: c.isOperator(), label: c.roleLabel(),
  };
}

const CATALOG_NONE = { canRegister: false, canEditCommercialFields: false, canEditDescription: false, canChangeStatus: false, canRead: false, isDenied: false };
const CATALOG_READ = { ...CATALOG_NONE, canRead: true };
const CATALOG_DENIED = { ...CATALOG_NONE, isDenied: true };
const CATALOG_ALL = { canRegister: true, canEditCommercialFields: true, canEditDescription: true, canChangeStatus: true, canRead: true, isDenied: false };
const CUSTOMERS_READ = { canRead: true, canRegister: false, isDenied: false };
const CUSTOMERS_REGISTER = { canRead: true, canRegister: true, isDenied: false };
const CUSTOMERS_DENIED = { canRead: false, canRegister: false, isDenied: true };
const NOTHING = { sensitiveData: false, manageDiscounts: false, authorizeAdditionalDiscount: false, createReservations: false, registerEstablishments: false };
const READ_ONLY_ANSWERS = { ...NOTHING, catalog: CATALOG_READ, customers: CUSTOMERS_READ, readEstablishments: true, operator: false, label: 'Solo lectura' };

/** Today's nine matrices, one row per role: catalog, customers, sensitive data, discounts, additional discount, reservations, establishments, audience, label. */
const TODAY: ReadonlyArray<readonly [string, ReturnType<typeof answers>]> = [
  ['TENANT_ADMINISTRATOR', { catalog: CATALOG_ALL, customers: CUSTOMERS_REGISTER, sensitiveData: true, manageDiscounts: true, authorizeAdditionalDiscount: true,
    createReservations: true, readEstablishments: true, registerEstablishments: true, operator: true, label: 'Administrador del tenant' }],
  ['OPERATIONAL_COLLABORATOR', { ...NOTHING, catalog: CATALOG_READ, customers: CUSTOMERS_REGISTER, sensitiveData: true, createReservations: true,
    readEstablishments: false, operator: true, label: 'Colaborador operativo' }],
  ['MANAGER', { ...READ_ONLY_ANSWERS, operator: true, label: 'Gerente' }],
  ['ANALYST', { ...READ_ONLY_ANSWERS, operator: true, label: 'Analista' }],
  ['ACCOUNTANT', { ...NOTHING, catalog: CATALOG_DENIED, customers: CUSTOMERS_DENIED, readEstablishments: false, operator: true, label: 'Contador' }],
  ['READ_ONLY', READ_ONLY_ANSWERS],
];

describe('capabilitiesReproduceTodaysMatrixRowByRow', () => {
  it.each(TODAY)('answers for %s what the screens decided before the move', (role, expected) => {
    expect(answers(PortalCapabilities.for(role))).toEqual(expected);
  });

  it('lets the collaborator edit the description only when the tenant enables it', () => {
    expect(PortalCapabilities.for('OPERATIONAL_COLLABORATOR', true).catalog()).toEqual({ ...CATALOG_READ, canEditDescription: true });
    expect(PortalCapabilities.for('MANAGER', true).catalog()).toEqual(CATALOG_READ);
  });

  it('shows sensitive data only with the grant, and only to the administrator and the collaborator', () => {
    expect(TODAY.map(([role]) => PortalCapabilities.for(role).canViewSensitiveData(false))).toEqual(TODAY.map(() => false));
  });

  it('assumes the first known role of the session and fails closed to read only (DP-PT-06)', () => {
    expect(roleOf(['SOMETHING_ELSE', 'MANAGER', 'TENANT_ADMINISTRATOR'])).toBe('MANAGER');
    expect(roleOf(['FINAL_CUSTOMER'])).toBe('READ_ONLY');
    expect(roleOf([])).toBe('READ_ONLY');
  });

  it('tells the final customer, the visitor without a session and anyone else apart (DP-RS2)', () => {
    expect(customerStandingOf(['FINAL_CUSTOMER'])).toBe('FINAL_CUSTOMER');
    expect(customerStandingOf([])).toBe('NO_SESSION');
    expect(customerStandingOf(['TENANT_ADMINISTRATOR'])).toBe('OTHER');
  });

  it('is what the portal injects, derived from the actor the container reported', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('OPERATIONAL_COLLABORATOR', true) }] });
    expect(answers(TestBed.inject(PortalCapabilities))).toEqual({ ...TODAY[1][1], catalog: { ...CATALOG_READ, canEditDescription: true } });
  });
});

describe('anUnknownRoleGetsReadOnlyCapabilities', () => {
  it.each(['SOMETHING_ELSE', '', 'FINAL_CUSTOMER', 'tenant_administrator'])('reads only as %j', (role) => {
    expect(answers(PortalCapabilities.for(role, true))).toEqual(READ_ONLY_ANSWERS);
  });

  it('reads only when no actor is provided', () => {
    TestBed.configureTestingModule({});
    expect(answers(TestBed.inject(PortalCapabilities))).toEqual(READ_ONLY_ANSWERS);
  });
});

describe('noRoleNameOutsideThePortalCapabilities', () => {
  const ROLE_NAME = /\b(TENANT_ADMINISTRATOR|OPERATIONAL_COLLABORATOR|MANAGER|ANALYST|ACCOUNTANT|READ_ONLY)\b|FINAL_CUSTOMER_ROLE|includes\(\s*['"`]FINAL_CUSTOMER|[=!]==?\s*['"`](FINAL_CUSTOMER|NO_SESSION)['"`]|['"`](FINAL_CUSTOMER|NO_SESSION)['"`]\s*[=!]==?/;

  it('finds a role name only in src/app/shared/portal-capabilities.ts', () => {
    const files = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(files).toContain('src/app/shared/portal-capabilities.ts');
    const offenders = files
      .filter((file) => file !== 'src/app/shared/portal-capabilities.ts')
      .filter((file) => ROLE_NAME.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

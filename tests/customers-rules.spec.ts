import { describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { canViewSensitiveData, customersCapabilitiesOf, duplicateDocument, missingHighRiskData, validatePerson } from '../src/app/customers/model/customer-group';
import { DemoCustomersStore, DemoCustomersWriter, demoSensitiveDataAccess } from '../src/app/demo/customers-demo';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { groupWith, personNamed } from './customers.double';

const complete = { informedConsent: 'true', bloodType: 'O+', emergencyContact: 'Contacto Ficticio 301', physicalRestrictions: 'Ninguna' };

describe('highRiskActivityRefusesTheLeadWithoutTheExtraData', () => {
  it('names every missing extra field of a high-risk activity', () => {
    expect(missingHighRiskData({}, true)).toEqual(['informedConsent', 'bloodType', 'emergencyContact', 'physicalRestrictions']);
    expect(missingHighRiskData({ ...complete, bloodType: ' ' }, true)).toEqual(['bloodType']);
    expect(missingHighRiskData({ ...complete, informedConsent: '' }, true)).toEqual(['informedConsent']);
    expect(missingHighRiskData(complete, true)).toEqual([]);
  });
  it('asks for nothing extra when the activity is not high risk', () => {
    expect(missingHighRiskData({}, false)).toEqual([]);
  });
  it('refuses a lead without the terms and without the extra data', () => {
    const draft = { serviceId: 'svc-1', fullName: 'Lider Ficticio', document: 'X1', email: 'x@example.test', contact: '300 000 0001', birthDate: '1990-01-01', acceptedTerms: '' };
    const messages = validatePerson(draft, 'lead', true, null);
    expect(Object.keys(messages).sort()).toEqual(['acceptedTerms', 'bloodType', 'emergencyContact', 'informedConsent', 'physicalRestrictions']);
    expect(validatePerson({ ...draft, ...complete, acceptedTerms: 'true' }, 'lead', true, null)).toEqual({});
  });
  it('asks the lead for a valid e-mail and says why in Spanish', () => {
    const draft = { serviceId: 'svc-1', fullName: 'Lider Ficticio', document: 'X1', contact: '300', birthDate: '1990-01-01', acceptedTerms: 'true' };
    expect(validatePerson(draft, 'lead', false, null)).toEqual({ email: 'Obligatorio.' });
    expect(validatePerson({ ...draft, email: 'sin-arroba' }, 'lead', false, null)).toEqual({ email: 'Escribe un correo válido.' });
    expect(validatePerson({ ...draft, email: 'a@b.co' }, 'lead', true, null).bloodType).toBe('Obligatorio para una actividad de riesgo.');
  });
});

describe('aDocumentAlreadyInTheGroupIsRefused', () => {
  const group = groupWith(false, [personNamed('Acompanante Ficticio', 'DOC-2002', false)]);
  it('finds the lead and the companions, ignoring spaces and case', () => {
    expect(duplicateDocument(group, 'DOC 1001')).toBe(true);
    expect(duplicateDocument(group, ' doc1001 ')).toBe(true);
    expect(duplicateDocument(group, 'doc-2002')).toBe(true);
    expect(duplicateDocument(group, 'DOC 3003')).toBe(false);
    expect(duplicateDocument(null, 'DOC 1001')).toBe(false);
  });
  it('puts the refusal beside the document field', () => {
    const draft = { fullName: 'Otra Persona', document: 'doc 1001', contact: 'o@example.test', birthDate: '2000-01-01' };
    expect(validatePerson(draft, 'companion', false, group)).toEqual({ document: expect.any(String) });
  });
});

describe('highRiskActivityRefusesACompanionWithoutTheExtraData', () => {
  it('requires the same extra data for a companion of a high-risk group', () => {
    const draft = { fullName: 'Otra Persona', document: 'DOC 4004', contact: 'o@example.test', birthDate: '2000-01-01' };
    expect(Object.keys(validatePerson(draft, 'companion', true, groupWith(true))).sort()).toEqual(['bloodType', 'emergencyContact', 'informedConsent', 'physicalRestrictions']);
    expect(validatePerson({ ...draft, ...complete }, 'companion', true, groupWith(true))).toEqual({});
  });
});

describe('sensitive data and roles are decided in one place', () => {
  it('shows sensitive data only to an administrator or a collaborator holding the permission', () => {
    expect(canViewSensitiveData('TENANT_ADMINISTRATOR', true)).toBe(true);
    expect(canViewSensitiveData('OPERATIONAL_COLLABORATOR', true)).toBe(true);
    for (const role of ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'] as const) expect(canViewSensitiveData(role, false)).toBe(false);
    for (const role of ['MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY'] as const) expect(canViewSensitiveData(role, true)).toBe(false);
  });
  it('lets the administrator and the collaborator register, others read, the accountant nothing', () => {
    expect(customersCapabilitiesOf('OPERATIONAL_COLLABORATOR')).toEqual({ canRead: true, canRegister: true, isDenied: false });
    expect(customersCapabilitiesOf('MANAGER')).toEqual({ canRead: true, canRegister: false, isDenied: false });
    expect(customersCapabilitiesOf('READ_ONLY')).toEqual({ canRead: true, canRegister: false, isDenied: false });
    expect(customersCapabilitiesOf('ACCOUNTANT')).toEqual({ canRead: false, canRegister: false, isDenied: true });
  });
});

describe('customers demo store', () => {
  it('replays the same group for a repeated key and holds only invented people', async () => {
    const store = new DemoCustomersStore();
    const writer = new DemoCustomersWriter(store, new DemoCatalogStore() as CatalogItemsSource);
    const command = { serviceId: 'demo-svc-3', fullName: 'Persona Inventada', document: 'DEMO-9', contact: 'p@example.test', birthDate: '1999-09-09', acceptedTerms: true };
    const first = await firstValueFrom(writer.registerLead(command, 'k-1'));
    const again = await firstValueFrom(writer.registerLead(command, 'k-1'));
    expect(again).toBe(first);
    expect(first.highRisk).toBe(true);
    const withCompanion = await firstValueFrom(writer.addCompanion(first.groupId, { fullName: 'Otra Inventada', document: 'DEMO-10', contact: 'o@example.test', birthDate: '2001-01-01' }, 'k-2'));
    expect(withCompanion.companions).toHaveLength(1);
    expect(await firstValueFrom(store.current())).toEqual(withCompanion);
    expect(demoSensitiveDataAccess(['TENANT_ADMINISTRATOR']).granted).toBe(false);
  });
});

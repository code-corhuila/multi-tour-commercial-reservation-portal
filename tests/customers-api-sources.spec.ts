import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CustomersSource } from '../src/app/customers/data/customers-source';
import { CustomersWriter } from '../src/app/customers/data/customers-writer';
import { LeadCommand } from '../src/app/customers/model/customer-group';
import { API_BASE } from '../src/app/http/api-paths';
import { CustomersApiSource, CustomersApiWriter } from '../src/app/http/customers-api-sources';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';

interface Call { path: string; method?: string; body?: unknown; headers?: Record<string, string> }
function fakeClient(...replies: Array<{ ok: unknown } | { fail: unknown }>) {
  const calls: Call[] = [];
  const client: PortalApiClient = {
    request: ((path: string, init?: Omit<Call, 'path'>) => {
      calls.push({ path, ...init });
      const reply = replies.shift() ?? { ok: {} };
      return 'fail' in reply ? Promise.reject(reply.fail) : Promise.resolve(reply.ok);
    }) as PortalApiClient['request'],
  };
  return { client, calls };
}
const response = { customerId: 'c-1', fullName: 'Persona Ficticia Uno', documentNumber: 'DOC-0000', birthDate: '1990-05-01', contact: { email: 'persona.uno@example.invalid', phone: '3000000000' },
  termsAccepted: true, highRisk: false, createdAt: '2026-10-01T00:00:00Z' };
const lead: LeadCommand = { serviceId: 's-1', acceptedTerms: true, fullName: ' Persona Ficticia Uno ', document: 'DOC-0000', email: 'persona.uno@example.invalid', contact: '3000000000', birthDate: '1990-05-01' };
const risk = { informedConsent: true, bloodType: 'X+', emergencyContact: 'Contacto Ficticio 3000000001', physicalRestrictions: 'Ninguna' };

describe('customersOverTheApiClient', () => {
  it('registers the lead with the Idempotency-Key and the fields of the contract', async () => {
    const { client, calls } = fakeClient({ ok: response });
    await firstValueFrom(new CustomersApiWriter(client).registerLead(lead, 'key-12345678'));
    expect(calls).toEqual([{ path: `${API_BASE}/customers`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { fullName: ' Persona Ficticia Uno ', documentNumber: 'DOC-0000', birthDate: '1990-05-01', contact: { email: 'persona.uno@example.invalid', phone: '3000000000' }, termsAccepted: true, serviceId: 's-1' } }]);
  });

  it('sends the extra data only for a high-risk activity, as the emergency info of the contract', async () => {
    const { client, calls } = fakeClient({ ok: { ...response, highRisk: true } });
    await firstValueFrom(new CustomersApiWriter(client).registerLead({ ...lead, highRisk: risk }, 'key-12345678'));
    expect(calls[0].body).toMatchObject({ informedConsentSigned: true, emergencyInfo: { bloodType: 'X+', emergencyContact: 'Contacto Ficticio 3000000001', mobilityRestrictions: 'Ninguna' } });
  });

  it('answers the group with the customer as lead, and never carries sensitive data back', async () => {
    const { client } = fakeClient({ ok: { ...response, highRisk: true } });
    const group = await firstValueFrom(new CustomersApiWriter(client).registerLead({ ...lead, highRisk: risk }, 'key-12345678'));
    expect(group).toMatchObject({ groupId: 'c-1', serviceId: 's-1', highRisk: true, companions: [],
      lead: { personId: 'c-1', fullName: 'Persona Ficticia Uno', document: 'DOC-0000', email: 'persona.uno@example.invalid', contact: '3000000000', birthDate: '1990-05-01' } });
    expect(JSON.stringify(group)).not.toContain('Contacto Ficticio');
  });

  it('shows the refusal of the service as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } });
    const error = await firstValueFrom(new CustomersApiWriter(client).registerLead(lead, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', userMessage: 'Sin permiso.' });
  });

  it('sends the same key again when the screen retries the same registration', async () => {
    const { client, calls } = fakeClient({ ok: response }, { ok: response });
    const writer = new CustomersApiWriter(client);
    await firstValueFrom(writer.registerLead(lead, 'key-12345678'));
    await firstValueFrom(writer.registerLead(lead, 'key-12345678'));
    expect(calls.map((c) => c.headers?.['Idempotency-Key'])).toEqual(['key-12345678', 'key-12345678']);
  });

  it('builds no companion call: companions belong to the reservation (HU-COM-007)', async () => {
    const { client, calls } = fakeClient();
    const error = await firstValueFrom(new CustomersApiWriter(client).addCompanion('c-1', lead, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
  });

  it('answers the draft group and the search with a declared error because the contract has neither', async () => {
    const { client, calls } = fakeClient();
    const source = new CustomersApiSource(client);
    expect(await firstValueFrom(source.current()).catch((e) => e)).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(await firstValueFrom(source.search('per')).catch((e) => e)).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
  });

  it('is provided by the default sources', () => {
    const { client } = fakeClient();
    const providers = sourceProviders(client) as Array<{ provide: unknown; useValue: unknown }>;
    expect(providers.find((p) => p.provide === CustomersSource)?.useValue).toBeInstanceOf(CustomersApiSource);
    expect(providers.find((p) => p.provide === CustomersWriter)?.useValue).toBeInstanceOf(CustomersApiWriter);
  });
});

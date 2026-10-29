import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { DiscountRulesApiSource, DiscountRulesApiWriter } from '../src/app/http/discount-rules-api-sources';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';

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
const response = { discountRuleId: 'r1', name: 'Descuento tour-1', validFrom: '2026-01-01', validTo: '2026-12-31', priority: 2,
  calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 1250, serviceCoverage: 'SELECTED', serviceIds: ['tour-1'], capCents: 5_000_000, ruleStatus: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const command = { tourId: 'tour-1', percentageBasisPoints: 1250, calculationBase: 'PREVIOUS_SUBTOTAL', startsOn: '2026-01-01', endsOn: '2026-12-31', priority: 2, stackable: true, capCents: 5_000_000 } as const;

describe('discountRulesSourcesOverTheApiClient', () => {
  it('creates with the contract fields and the Idempotency-Key, and maps the answer to the portal rule', async () => {
    const { client, calls } = fakeClient({ ok: response });
    const rule = await firstValueFrom(new DiscountRulesApiWriter(client).create(command, 'key-12345678'));
    expect(calls).toEqual([{ path: `${API_BASE}/discount-rules`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { name: 'Descuento tour-1', validFrom: '2026-01-01', validTo: '2026-12-31', priority: 2, calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 1250,
        serviceCoverage: 'SELECTED', serviceIds: ['tour-1'], capCents: 5_000_000 } }]);
    expect(rule).toMatchObject({ id: 'r1', tourId: 'tour-1', capCents: 5_000_000, startsOn: '2026-01-01', endsOn: '2026-12-31', priority: 2, percentageBasisPoints: 1250, calculationBase: 'PREVIOUS_SUBTOTAL', status: 'ACTIVE', stackable: false });
  });

  it('sends the same key again when the form retries the same creation', async () => {
    const { client, calls } = fakeClient({ fail: { status: 500, code: 'X', message: 'down', traceId: 't' } }, { ok: response });
    const writer = new DiscountRulesApiWriter(client);
    await firstValueFrom(writer.create(command, 'same-key-1')).catch(() => undefined);
    await firstValueFrom(writer.create(command, 'same-key-1'));
    expect(calls.map((c) => c.headers?.['Idempotency-Key'])).toEqual(['same-key-1', 'same-key-1']);
  });

  it('reads one rule by id and inactivates it with POST', async () => {
    const { client, calls } = fakeClient({ ok: response }, { ok: { ...response, ruleStatus: 'INACTIVE' } });
    const source = new DiscountRulesApiSource(client), writer = new DiscountRulesApiWriter(client);
    expect((await firstValueFrom(source.get('r1'))).id).toBe('r1');
    const inactive = await firstValueFrom(writer.inactivate('r1', 'k-inactivate-1'));
    expect(inactive).toMatchObject({ status: 'INACTIVE', validity: { label: 'Inactivo', inForce: false } });
    expect(calls.map((c) => [c.method ?? 'GET', c.path])).toEqual([['GET', `${API_BASE}/discount-rules/r1`], ['POST', `${API_BASE}/discount-rules/r1/inactivate`]]);
  });

  it('never calls PATCH: the update is not published and answers a declared error', async () => {
    const { client, calls } = fakeClient();
    const error = await firstValueFrom(new DiscountRulesApiWriter(client).update('r1', command, 'k-update-1')).catch((e) => e);
    expect(error).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
  });

  it('reads a rule that covers all services without inventing a tour', async () => {
    const { client } = fakeClient({ ok: { ...response, serviceCoverage: 'ALL', serviceIds: [], capCents: undefined } });
    expect(await firstValueFrom(new DiscountRulesApiSource(client).get('r1'))).toMatchObject({ tourId: '', capCents: undefined });
  });

  it('never calls a reactivation route and keeps an amount rule readable', async () => {
    const { client, calls } = fakeClient({ ok: { ...response, percentageBasisPoints: undefined, amountCents: 900_000 } });
    const error = await firstValueFrom(new DiscountRulesApiWriter(client).reactivate('r1', 'k-reactivate-1')).catch((e) => e);
    expect(error).toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
    expect(await firstValueFrom(new DiscountRulesApiSource(client).get('r1'))).toMatchObject({ percentageBasisPoints: 0 });
  });

  it('hands a refusal to the page with userMessage and details', async () => {
    const details = [{ field: 'validTo', message: 'bad' }];
    const { client } = fakeClient({ fail: { status: 400, code: 'E', message: 'refused', details, traceId: 'tr' } });
    const error = await firstValueFrom(new DiscountRulesApiWriter(client).create(command, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ status: 400, userMessage: 'refused', details, traceId: 'tr' });
  });

  it('lists every page of GET /discount-rules and maps each rule', async () => {
    const { client, calls } = fakeClient({ ok: { data: [response], meta: { page: 1, totalPages: 2 } } }, { ok: { data: [{ ...response, discountRuleId: 'r2' }], meta: { page: 2, totalPages: 2 } } });
    const rules = await firstValueFrom(new DiscountRulesApiSource(client).list());
    expect(rules.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(rules[0]).toMatchObject({ tourId: 'tour-1', startsOn: '2026-01-01', endsOn: '2026-12-31' });
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/discount-rules?page=1&limit=100`, `${API_BASE}/discount-rules?page=2&limit=100`]);
  });

  it('is provided by the real build of the sources', () => {
    const { client } = fakeClient();
    const providers = sourceProviders(client) as Array<{ provide: unknown; useValue: unknown }>;
    expect(providers.find((p) => p.provide === DiscountRulesSource)?.useValue).toBeInstanceOf(DiscountRulesApiSource);
    expect(providers.find((p) => p.provide === DiscountRulesWriter)?.useValue).toBeInstanceOf(DiscountRulesApiWriter);
  });
});

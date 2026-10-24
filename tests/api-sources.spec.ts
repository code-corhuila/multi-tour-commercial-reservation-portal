import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { CatalogApiSource, CatalogApiWriter } from '../src/app/http/catalog-api-sources';
import { EstablishmentsApiSource, EstablishmentsApiWriter } from '../src/app/http/establishments-api-sources';
import { API_BASE } from '../src/app/http/api-paths';
import { PortalApiClient } from '../src/app/shell-contract';

interface Call { path: string; method?: string; body?: unknown; headers?: Record<string, string> }

/** A fake container client: records every request and answers with the next queued reply or rejection. */
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
const meta = (page: number, totalPages: number) => ({ page, limit: 100, total: 2, totalPages });
const command = { serviceType: 'TOUR', commercialName: 'Tour', baseRateCents: 1, baseOperationalCostCents: 1, configuredCapacity: 5, transportRequired: false, highRisk: false } as const;

describe('catalogSourcesOverTheApiClient', () => {
  it('lists every page of the catalog from the catalog path', async () => {
    const { client, calls } = fakeClient({ ok: { data: [{ serviceId: 'a' }], meta: meta(1, 2) } }, { ok: { data: [{ serviceId: 'b' }], meta: meta(2, 2) } });
    const items = await firstValueFrom(new CatalogApiSource(client).list());
    expect(items.map((i) => i.serviceId)).toEqual(['a', 'b']);
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/catalog/services?page=1&limit=100`, `${API_BASE}/catalog/services?page=2&limit=100`]);
  });

  it('uses the right method, path, body and key for each write', async () => {
    const { client, calls } = fakeClient();
    const writer = new CatalogApiWriter(client);
    await firstValueFrom(writer.create(command, 'key-12345678'));
    await firstValueFrom(writer.update('s1', { commercialName: 'New' }));
    await firstValueFrom(writer.inactivate('s1'));
    await firstValueFrom(writer.reactivate('s1'));
    expect(calls).toEqual([
      { path: `${API_BASE}/catalog/services`, method: 'POST', body: command, headers: { 'Idempotency-Key': 'key-12345678' } },
      { path: `${API_BASE}/catalog/services/s1`, method: 'PATCH', body: { commercialName: 'New' } },
      { path: `${API_BASE}/catalog/services/s1/inactivate`, method: 'POST' },
      { path: `${API_BASE}/catalog/services/s1/reactivate`, method: 'POST' },
    ]);
  });

  it('sends the same key again when the form retries the same creation', async () => {
    const { client, calls } = fakeClient({ fail: { status: 500, code: 'X', message: 'down', traceId: 't' } });
    const writer = new CatalogApiWriter(client);
    await firstValueFrom(writer.create(command, 'same-key-1')).catch(() => undefined);
    await firstValueFrom(writer.create(command, 'same-key-1'));
    expect(calls.map((c) => c.headers?.['Idempotency-Key'])).toEqual(['same-key-1', 'same-key-1']);
  });

  it.each([400, 401, 403, 404, 422])('hands a %i to the page with userMessage and details', async (status) => {
    const details = [{ field: 'baseRateCents', message: 'bad' }];
    const { client } = fakeClient({ fail: { status, code: 'E', message: `refused ${status}`, details, traceId: 'tr' } });
    const error = await firstValueFrom(new CatalogApiWriter(client).inactivate('s1')).catch((e) => e);
    expect(error).toMatchObject({ status, userMessage: `refused ${status}`, message: `refused ${status}`, details, traceId: 'tr' });
  });

  it('turns a failure without the envelope into a generic error the page can show', async () => {
    const { client } = fakeClient({ fail: new TypeError('network') });
    const error = await firstValueFrom(new CatalogApiSource(client).list()).catch((e) => e);
    expect(error).toMatchObject({ userMessage: 'La solicitud falló.', details: [] });
  });
});

describe('establishmentsSourcesOverTheApiClient', () => {
  it('lists with the filters, and reads one by id', async () => {
    const { client, calls } = fakeClient({ ok: { data: [{ associationId: 'e1' }], meta: meta(1, 1) } });
    const source = new EstablishmentsApiSource(client);
    await firstValueFrom(source.list({ establishmentType: 'HOTEL', associationStatus: 'INACTIVE' }));
    await firstValueFrom(source.get('e1'));
    expect(calls.map((c) => c.path)).toEqual([
      `${API_BASE}/associated-establishments?page=1&limit=100&establishmentType=HOTEL&associationStatus=INACTIVE`,
      `${API_BASE}/associated-establishments/e1`,
    ]);
  });

  it('posts the status transitions without a key', async () => {
    const { client, calls } = fakeClient();
    const writer = new EstablishmentsApiWriter(client);
    await firstValueFrom(writer.inactivate('e1'));
    await firstValueFrom(writer.reactivate('e1'));
    expect(calls).toEqual([
      { path: `${API_BASE}/associated-establishments/e1/inactivate`, method: 'POST' },
      { path: `${API_BASE}/associated-establishments/e1/reactivate`, method: 'POST' },
    ]);
  });

  it('hands a refusal of a transition to the page with its message', async () => {
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'not allowed', traceId: 't' } });
    const error = await firstValueFrom(new EstablishmentsApiWriter(client).inactivate('e1')).catch((e) => e);
    expect(error).toMatchObject({ status: 403, userMessage: 'not allowed' });
  });

  it('registers with a multipart FormData body (never a JSON-serialized one) and only the Idempotency-Key header', async () => {
    const { client, calls } = fakeClient();
    const image = new File(['x'], 'a.png', { type: 'image/png' });
    await firstValueFrom(new EstablishmentsApiWriter(client).register({ establishmentType: 'RESTAURANT', commercialName: 'R', commercialInformation: 'Info', image }, 'k-987654321'));
    const body = calls[0].body;
    expect(body).toBeInstanceOf(FormData); expect(typeof body).not.toBe('string');
    const form = body as FormData;
    expect(['commercialInformation', 'commercialName', 'establishmentType', 'image'].every((name) => form.has(name))).toBe(true);
    expect(form.get('establishmentType')).toBe('RESTAURANT'); expect(form.get('image')).toBeInstanceOf(File);
    expect(calls[0].headers).toEqual({ 'Idempotency-Key': 'k-987654321' });
  });

  it('builds the registration as FormData with the Idempotency-Key header (container support pending)', async () => {
    const { client, calls } = fakeClient();
    const image = new File(['x'], 'a.png', { type: 'image/png' });
    await firstValueFrom(new EstablishmentsApiWriter(client).register({ establishmentType: 'HOTEL', commercialName: 'H', commercialInformation: 'I', image }, 'k-123456789'));
    const call = calls[0];
    expect(call).toMatchObject({ path: `${API_BASE}/associated-establishments`, method: 'POST', headers: { 'Idempotency-Key': 'k-123456789' } });
    const form = call.body as FormData;
    expect([form.get('establishmentType'), form.get('commercialName'), form.get('commercialInformation')]).toEqual(['HOTEL', 'H', 'I']);
    expect((form.get('image') as File).name).toBe('a.png');
  });
});


describe('catalogWriterBodyMatchesTheApiContract', () => {
  const absent = ['validFrom', 'validTo', 'operationalRestrictions', 'route'];
  const noNulls = (body: unknown) => Object.values(body as Record<string, unknown>).every((value) => value !== null && value !== undefined);

  it('creates without null keys and without the fields the API does not know', async () => {
    const { client, calls } = fakeClient();
    const withExtras = { ...command, configuredCapacity: null, validFrom: '2026-09-01', validTo: '2026-09-30', operationalRestrictions: 'x', route: 'A-B' };
    await firstValueFrom(new CatalogApiWriter(client).create(withExtras as never, 'key-12345678'));
    const body = calls[0].body as Record<string, unknown>;
    expect(noNulls(body)).toBe(true);
    expect(Object.keys(body)).not.toContain('configuredCapacity');
    for (const key of absent) { expect(Object.keys(body)).not.toContain(key); }
  });

  it('does not send configuredCapacity for a transport created without capacity', async () => {
    const { client, calls } = fakeClient();
    const { configuredCapacity: _capacity, ...transport } = { ...command, serviceType: 'TRANSPORTATION' as const };
    await firstValueFrom(new CatalogApiWriter(client).create(transport, 'key-12345678'));
    expect(calls[0].body).toEqual(transport);
    expect(Object.keys(calls[0].body as object)).not.toContain('configuredCapacity');
  });

  it('updates without null keys and without the validity', async () => {
    const { client, calls } = fakeClient();
    const { serviceType: _type, ...update } = command;
    await firstValueFrom(new CatalogApiWriter(client).update('s1', { ...update, configuredCapacity: null, validFrom: '2026-09-01', validTo: '2026-09-30' } as never));
    const body = calls[0].body as Record<string, unknown>;
    expect(noNulls(body)).toBe(true);
    expect(Object.keys(body)).not.toContain('configuredCapacity');
    expect(Object.keys(body)).not.toContain('validFrom');
    expect(Object.keys(body)).not.toContain('validTo');
  });
});

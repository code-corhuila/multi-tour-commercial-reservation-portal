import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { EstablishmentsApiSource, EstablishmentsApiWriter } from '../src/app/http/establishments-api-sources';
import { PortalApiClient } from '../src/app/shell-contract';
import { DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';

// HU-COM-002 against the published contract: the contact travels with the registration, the reason with the transition, and the
// change log of the service becomes the bitácora of each establishment (oldest first, as the page expects).
interface Call { path: string; method?: string; body?: unknown; headers?: Record<string, string> }
function fakeClient(...replies: unknown[]) {
  const calls: Call[] = [];
  const client: PortalApiClient = { request: ((path: string, init?: Omit<Call, 'path'>) => { calls.push({ path, ...init }); return Promise.resolve(replies.shift() ?? {}); }) as PortalApiClient['request'] };
  return { client, calls };
}
const page = (...data: unknown[]) => ({ data, meta: { page: 1, totalPages: 1 } });
const alpha = { associationId: 'a-1', establishmentType: 'HOTEL', commercialName: 'Alpha', commercialInformation: 'Info', imageReference: 'img', associationStatus: 'INACTIVE', contactEmail: 'info@alpha.co' };
const entry = (eventType: string, occurredAt: string, reason: string | null, associationId = 'a-1') => ({ changeId: `c-${occurredAt}`, associationId, commercialName: 'Alpha', eventType, reason, actorId: 'u-1', occurredAt });

describe('theEstablishmentsSourceJoinsTheChangeLog', () => {
  it('asks for the log of the same type and gives each establishment its changes oldest first, with the reason and the tenant wall time', async () => {
    const { client, calls } = fakeClient(page(alpha), page(entry('INACTIVATED', '2026-09-20T15:30:00Z', 'Cerrado por obras'), entry('REGISTERED', '2026-09-01T13:00:00Z', null)));
    const items = await firstValueFrom(new EstablishmentsApiSource(client).list({ establishmentType: 'HOTEL' }));
    expect(calls.map((call) => call.path)).toEqual([`${API_BASE}/associated-establishments?page=1&limit=100&establishmentType=HOTEL`, `${API_BASE}/associated-establishments/changes?page=1&limit=100&establishmentType=HOTEL`]);
    expect(items[0].contactEmail).toBe('info@alpha.co');
    expect(items[0].changes).toEqual([
      { kind: 'REGISTERED', at: '2026-09-01T08:00:00', by: 'u-1' },
      { kind: 'INACTIVATED', at: '2026-09-20T10:30:00', by: 'u-1', reason: 'Cerrado por obras' }]);
  });

  it('leaves the changes absent, not empty, when the log cannot be read', async () => {
    const calls: string[] = [];
    const client: PortalApiClient = { request: ((path: string) => { calls.push(path); return path.includes('/changes') ? Promise.reject({ status: 500, code: 'X', message: 'down' }) : Promise.resolve(page(alpha)); }) as PortalApiClient['request'] };
    const items = await firstValueFrom(new EstablishmentsApiSource(client).list({}));
    expect(items[0].changes).toBeUndefined();
  });
});

describe('theEstablishmentsWriterSendsTheContactAndTheReason', () => {
  it('adds the contact fields that were typed to the multipart registration', async () => {
    const { client, calls } = fakeClient(alpha);
    await firstValueFrom(new EstablishmentsApiWriter(client).register({ establishmentType: 'HOTEL', commercialName: 'Alpha', commercialInformation: 'Info', image: new File(['x'], 'a.png', { type: 'image/png' }), contactEmail: 'info@alpha.co', contactAddress: 'Calle 1' }, 'key-12345678'));
    const body = calls[0].body as FormData;
    expect(body.get('contactEmail')).toBe('info@alpha.co');
    expect(body.get('contactAddress')).toBe('Calle 1');
    expect(body.has('contactPhone')).toBe(false);
  });

  it('posts the reason as a JSON body on inactivate and on reactivate', async () => {
    const { client, calls } = fakeClient(alpha, alpha);
    const writer = new EstablishmentsApiWriter(client);
    await firstValueFrom(writer.inactivate('a-1', 'Cerrado por obras'));
    await firstValueFrom(writer.reactivate('a-1', 'Obras terminadas'));
    expect(calls).toEqual([
      { path: `${API_BASE}/associated-establishments/a-1/inactivate`, method: 'POST', body: { reason: 'Cerrado por obras' } },
      { path: `${API_BASE}/associated-establishments/a-1/reactivate`, method: 'POST', body: { reason: 'Obras terminadas' } }]);
  });
});

describe('theDemoBuildKeepsItsSeedsAndRecordsTheReason', () => {
  it('seeds a contact on every establishment and records the reason of a change in its bitácora', async () => {
    const store = new DemoEstablishmentsStore();
    const writer = new DemoEstablishmentsWriter(store, { now: () => Date.parse('2026-10-01T15:00:00Z'), actor: () => 'Administrador Demo' });
    const seeded = await firstValueFrom(store.list({}));
    expect(seeded.every((item) => !!item.contactEmail || !!item.contactPhone)).toBe(true);
    const changed = await firstValueFrom(writer.inactivate(seeded[0].associationId, 'Cerrado por obras'));
    expect(changed.changes!.at(-1)).toMatchObject({ kind: 'INACTIVATED', by: 'Administrador Demo', reason: 'Cerrado por obras' });
    expect(seeded.some((item) => item.changes?.some((change) => !!change.reason))).toBe(true);
  });
});

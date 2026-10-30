import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AdditionalDiscountContexts } from '../src/app/current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountWriter } from '../src/app/current-discounts/data/additional-discount-writer';
import { AuthorizableReasons } from '../src/app/current-discounts/data/authorizable-reasons';
import { API_BASE } from '../src/app/http/api-paths';
import { AdditionalDiscountApiContexts, AdditionalDiscountApiWriter, AuthorizableReasonsApi } from '../src/app/http/additional-discount-api-sources';
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
const reason = (id: string, text: string, reasonStatus: 'ENABLED' | 'DISABLED' = 'ENABLED') => ({ reasonId: id, text, reasonStatus, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' });
const page = (...data: unknown[]) => ({ ok: { data, meta: { page: 1, totalPages: 1 } } });
const breakdown = { baseCents: 10_000_000, finalValueCents: 8_100_000, lines: [
  { order: 1, kind: 'RULE', name: 'Temporada', calculationBase: 'ORIGINAL_VALUE', baseCents: 10_000_000, amountCents: 1_000_000, subtotalCents: 9_000_000 },
  { order: 2, kind: 'ADDITIONAL', name: 'Fidelización', calculationBase: 'PREVIOUS_SUBTOTAL', baseCents: 9_000_000, amountCents: 900_000, subtotalCents: 8_100_000 }] };
const command = { reservationId: 'res-1', percentageBasisPoints: 1000, reason: 'Fidelización' };

describe('additionalDiscountSourcesOverTheApiClient', () => {
  it('previews with the percentage in basis points and maps the new value and the excess', async () => {
    const { client, calls } = fakeClient({ ok: { breakdown, previousFinalValueCents: 9_000_000, newFinalValueCents: 8_100_000, excessCents: 300_000 } });
    const preview = await firstValueFrom(new AdditionalDiscountApiContexts(client).preview('res-1', 1000));
    expect(calls).toEqual([{ path: `${API_BASE}/reservations/res-1/additional-discount/preview?basisPoints=1000` }]);
    expect(preview).toEqual({ newValueCents: 8_100_000, excessCents: 300_000 });
  });

  const detail = { reservationId: 'res-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 2, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'PARTIAL',
    tourLine: { amountCents: 10_000_000 }, projectedValueCents: 10_000_000, discounts: [{ order: 1, name: 'Temporada', calculationBase: 'ORIGINAL_VALUE', baseCents: 10_000_000, amountCents: 1_000_000, subtotalCents: 9_000_000 }],
    finalValueCents: 9_000_000, pendingBalanceCents: 5_000_000, validatedValueCents: 4_000_000, seatHeld: true, createdAt: '2026-10-30T10:00:00Z' };
  const row = { reservationId: 'res-1', customerName: 'Camila Ortega', tourName: 'Ruta Andina', departureStartsAt: '2026-11-07T06:30:00Z', reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'PARTIAL', pendingBalanceCents: 5_000_000 };

  it('reads the reservation of the contract and the names of its row to build the context of the screen', async () => {
    const { client, calls } = fakeClient({ ok: detail }, page(row));
    const context = await firstValueFrom(new AdditionalDiscountApiContexts(client).of('res-1'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations/res-1` });
    expect(calls[1].path).toBe(`${API_BASE}/reservations?page=1&limit=100&scope=all`);
    expect(context).toMatchObject({ reservationId: 'res-1', customerName: 'Camila Ortega', serviceName: 'Ruta Andina', currentValueCents: 9_000_000, generalDiscountCents: 1_000_000,
      paidCents: 4_000_000, eligible: true, stateLabel: 'Pendiente de pago' });
  });

  it('marks a reservation that is not pending or confirmed as not eligible, and a missing validated value as nothing paid', async () => {
    const { client } = fakeClient({ ok: { ...detail, reservationStatus: 'CANCELLED', validatedValueCents: undefined } }, page({ ...row, reservationStatus: 'CANCELLED' }));
    const context = await firstValueFrom(new AdditionalDiscountApiContexts(client).of('res-1'));
    expect(context).toMatchObject({ eligible: false, paidCents: 0, stateLabel: 'Cancelada' });
  });

  it('answers null when the service says the reservation does not exist', async () => {
    const { client, calls } = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'not found', traceId: 't' } });
    expect(await firstValueFrom(new AdditionalDiscountApiContexts(client).of('res-9'))).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('hands any other failure of the read to the page', async () => {
    const { client } = fakeClient({ fail: { status: 500, code: 'X', message: 'down', traceId: 't' } });
    const error = await firstValueFrom(new AdditionalDiscountApiContexts(client).of('res-1')).catch((e) => e);
    expect(error).toMatchObject({ status: 500, userMessage: 'down' });
  });

  it('registers with the enabled reason id and the Idempotency-Key, and reads the additional line of the breakdown', async () => {
    const { client, calls } = fakeClient(page(reason('r-1', 'Convenio comercial'), reason('r-2', 'Fidelización')), { ok: breakdown });
    const applied = await firstValueFrom(new AdditionalDiscountApiWriter(client).register(command, 'key-12345678'));
    expect(calls[1]).toEqual({ path: `${API_BASE}/reservations/res-1/additional-discount`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' }, body: { basisPoints: 1000, reasonId: 'r-2' } });
    expect(applied).toMatchObject({ reservationId: 'res-1', percentageBasisPoints: 1000, reason: 'Fidelización', previousValueCents: 9_000_000, amountCents: 900_000, newValueCents: 8_100_000 });
  });

  it('refuses a reason that is not enabled without sending the registration', async () => {
    const { client, calls } = fakeClient(page(reason('r-1', 'Fidelización', 'DISABLED')));
    const error = await firstValueFrom(new AdditionalDiscountApiWriter(client).register(command, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ status: 422, userMessage: expect.any(String) });
    expect(calls).toHaveLength(1);
  });

  it('sends the same key again when the screen retries the same application', async () => {
    const list = page(reason('r-2', 'Fidelización'));
    const { client, calls } = fakeClient(list, { fail: { status: 500, code: 'X', message: 'down', traceId: 't' } }, list, { ok: breakdown });
    const writer = new AdditionalDiscountApiWriter(client);
    await firstValueFrom(writer.register(command, 'same-key-1')).catch(() => undefined);
    await firstValueFrom(writer.register(command, 'same-key-1'));
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.headers?.['Idempotency-Key'])).toEqual(['same-key-1', 'same-key-1']);
  });

  it('hands a refusal to the page with userMessage and details', async () => {
    const details = [{ field: 'basisPoints', message: 'low' }];
    const { client } = fakeClient(page(reason('r-2', 'Fidelización')), { fail: { status: 400, code: 'E', message: 'refused', details, traceId: 'tr' } });
    const error = await firstValueFrom(new AdditionalDiscountApiWriter(client).register({ ...command, percentageBasisPoints: 50 }, 'key-12345678')).catch((e) => e);
    expect(error).toMatchObject({ status: 400, userMessage: 'refused', details, traceId: 'tr' });
  });

  it('lists only the enabled reasons and marks none as removable when one is left', async () => {
    const { client, calls } = fakeClient(page(reason('r-1', 'Convenio comercial', 'DISABLED'), reason('r-2', 'Fidelización')));
    const reasons = await firstValueFrom(new AuthorizableReasonsApi(client).list());
    expect(calls[0].path).toBe(`${API_BASE}/additional-discount-reasons?page=1&limit=100`);
    expect(reasons).toEqual([{ reason: 'Fidelización', removable: false }]);
  });

  it('adds a reason with the Idempotency-Key and answers the whole enabled list', async () => {
    const { client, calls } = fakeClient({ ok: reason('r-3', 'Referido') }, page(reason('r-2', 'Fidelización'), reason('r-3', 'Referido')));
    const reasons = await firstValueFrom(new AuthorizableReasonsApi(client).add('Referido', 'key-reason-1'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/additional-discount-reasons`, method: 'POST', headers: { 'Idempotency-Key': 'key-reason-1' }, body: { text: 'Referido' } });
    expect(reasons.map((r) => r.reason)).toEqual(['Fidelización', 'Referido']);
    expect(reasons.every((r) => r.removable)).toBe(true);
  });

  it('disables a reason by its id with POST and no key, and answers the list that is left', async () => {
    const { client, calls } = fakeClient(page(reason('r-2', 'Fidelización'), reason('r-3', 'Referido')), { ok: reason('r-3', 'Referido', 'DISABLED') }, page(reason('r-2', 'Fidelización')));
    const reasons = await firstValueFrom(new AuthorizableReasonsApi(client).remove('Referido', 'key-reason-2'));
    expect(calls[1]).toEqual({ path: `${API_BASE}/additional-discount-reasons/r-3/disable`, method: 'POST' });
    expect(reasons).toEqual([{ reason: 'Fidelización', removable: false }]);
  });

  it('is provided by the real build of the sources', () => {
    const { client } = fakeClient();
    const providers = sourceProviders(client) as Array<{ provide: unknown; useValue: unknown }>;
    expect(providers.find((p) => p.provide === AdditionalDiscountContexts)?.useValue).toBeInstanceOf(AdditionalDiscountApiContexts);
    expect(providers.find((p) => p.provide === AdditionalDiscountWriter)?.useValue).toBeInstanceOf(AdditionalDiscountApiWriter);
    expect(providers.find((p) => p.provide === AuthorizableReasons)?.useValue).toBeInstanceOf(AuthorizableReasonsApi);
  });
});

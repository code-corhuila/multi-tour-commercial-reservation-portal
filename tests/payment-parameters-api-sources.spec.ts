import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { PaymentParametersApiSource, PaymentParametersApiWriter } from '../src/app/http/payment-parameters-api-sources';
import { PaymentParametersSource, PaymentParametersWriter } from '../src/app/payment-parameters/data/payment-parameters-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-009 payment parameters over the contract (PROPOSED): one row per payment type and, optionally, per service; the last change only
// (no audit list, DP-04); no penalty field (DP-09); the author and the time are the token's and the clock's.
const full = { paymentType: 'FULL_PAYMENT', initialWaitHours: 72, additionalWaitHours: 24, transferEnabled: true, cashEnabled: false, changedBy: 'u-1', changeReason: 'Inicial', changedAt: '2026-10-01T00:00:00Z' };
const deposit = { paymentType: 'DEPOSIT', initialWaitHours: 48, additionalWaitHours: 24, minimumDepositBp: 3000, balanceDeadlineAdvanceHours: 12, transferEnabled: true, cashEnabled: true, changedBy: 'u-2', changeReason: 'Ajuste', changedAt: '2026-10-05T00:00:00Z' };
const serviceRow = { ...deposit, serviceId: 't-1', initialWaitHours: 36, changedAt: '2026-10-03T00:00:00Z' };
const tenantPolicy = { penaltyBasisPoints: 5000, changedBy: 'u-3', changeReason: 'Temporada', changedAt: '2026-10-06T00:00:00Z' };
const servicePolicy = { serviceId: 't-1', penaltyBasisPoints: 2000, changedBy: 'u-3', changeReason: 'Tour', changedAt: '2026-10-04T00:00:00Z' };
const catalog = page([{ serviceId: 't-1', commercialName: 'Desierto de la Tatacoa' }]);
const NAME = 'Desierto de la Tatacoa';
const save = (extra: object) => ({ tenant: {}, services: {}, reason: 'Motivo', ...extra });

describe('paymentParametersSourceOverTheApiClient', () => {
  it('reads the rows and draws the tenant row and one row per tour: what each defines itself and what applies, with no audit list (not served)', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit, serviceRow]) }, { ok: catalog }, { ok: page([]) });
    const view = await firstValueFrom(new PaymentParametersApiSource(client).read([NAME]));
    expect(calls[0]).toEqual({ path: `${API_BASE}/payment-parameters?page=1&limit=100` });
    expect(view.rows[0]).toMatchObject({ scope: 'tenant', own: { initialHoursTotal: 72, initialHoursDeposit: 48, minDepositPercent: 30, extensionHours: 24, balanceHoursBefore: 12 } });
    expect(view.rows[0].applied.cancellationPenaltyPercent).toBeNull();
    expect(view.rows[1]).toMatchObject({ scope: 'service', service: NAME, own: { initialHoursDeposit: 36, minDepositPercent: 30 }, applied: { initialHoursTotal: 72, initialHoursDeposit: 36 } });
    expect(view.audit).toEqual([]);
    expect(view.lastChange).toEqual({ at: '2026-10-05T00:00:00Z', actor: 'u-2' });
  });

  it('reads the cancellation penalty of the tenant and of each tour from /cancellation-policies, in basis points, and the last change counts its rows too (HU-COM-013 DP-02)', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit, serviceRow]) }, { ok: catalog }, { ok: page([tenantPolicy, servicePolicy]) });
    const view = await firstValueFrom(new PaymentParametersApiSource(client).read([NAME]));
    expect(calls[2]).toEqual({ path: `${API_BASE}/cancellation-policies?page=1&limit=100` });
    expect(view.rows[0]).toMatchObject({ scope: 'tenant', own: { cancellationPenaltyPercent: 50 }, applied: { cancellationPenaltyPercent: 50 } });
    expect(view.rows[1]).toMatchObject({ scope: 'service', service: NAME, own: { cancellationPenaltyPercent: 20 }, applied: { cancellationPenaltyPercent: 20 } });
    expect(view.lastChange).toEqual({ at: '2026-10-06T00:00:00Z', actor: 'u-3' });
  });

  it('a tour with no policy row of its own inherits the one of the tenant, and a tour row of zero means no penalty', async () => {
    const { client } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: page([tenantPolicy]) });
    const inherited = await firstValueFrom(new PaymentParametersApiSource(client).read([NAME]));
    expect(inherited.rows[1]).toMatchObject({ own: {}, applied: { cancellationPenaltyPercent: 50 } });
    const zero = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: page([tenantPolicy, { ...servicePolicy, penaltyBasisPoints: 0 }]) });
    const free = await firstValueFrom(new PaymentParametersApiSource(zero.client).read([NAME]));
    expect(free.rows[1]).toMatchObject({ own: { cancellationPenaltyPercent: 0 }, applied: { cancellationPenaltyPercent: 0 } });
  });

  it('draws the defaults and no last change while the tenant has no row', async () => {
    const { client } = fakeClient({ ok: page([]) }, { ok: catalog }, { ok: page([]) });
    const view = await firstValueFrom(new PaymentParametersApiSource(client).read([NAME]));
    expect(view.rows[0].own).toEqual({});
    expect(view.lastChange).toBeNull();
  });

  it('asks the minimum deposit of a reservation to its payment quote, which the service calculates in cents', async () => {
    const { client, calls } = fakeClient({ ok: { enabledTypes: ['DEPOSIT'], enabledMethods: ['TRANSFER'], paymentType: 'DEPOSIT', minimumDepositCents: 100000, pendingBalanceCents: 300000 } });
    const cents = await firstValueFrom(new PaymentParametersApiSource(client).minimumDepositCents({ id: 'r-1', tourName: NAME, quote: { finalCents: 300000 } }));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations/r-1/payment-quote?type=DEPOSIT` });
    expect(cents).toBe(100000);
  });

  it('shows the refusal of the service as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } }, { ok: catalog });
    expect(await firstValueFrom(new PaymentParametersApiSource(client).read([NAME])).catch((e) => e)).toMatchObject({ status: 403, userMessage: 'Sin permiso.' });
  });
});

describe('paymentParametersWriterOverTheApiClient', () => {
  it('changes a tenant value: PUT of the rows touched, whole, with the reason, under the key, and no author, time or penalty', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: { data: [full, deposit] } }, { ok: page([full, deposit]) }, { ok: catalog }, { ok: page([]) });
    await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ tenant: { initialHoursTotal: 60 } }), 'key-12345678'));
    expect(calls[2]).toEqual({ path: `${API_BASE}/payment-parameters`, method: 'PUT', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { reason: 'Motivo', parameters: [{ paymentType: 'FULL_PAYMENT', initialWaitHours: 60, additionalWaitHours: 24, transferEnabled: true, cashEnabled: false }] } });
  });

  it('writes the minimum deposit as basis points and the extension on both types, keeping the flags of the row', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: { data: [] } }, { ok: page([full, deposit]) }, { ok: catalog }, { ok: page([]) });
    await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ tenant: { minDepositPercent: 100 / 3, extensionHours: 12 } }), 'key-12345678'));
    expect((calls[2].body as { parameters: unknown[] }).parameters).toEqual([
      { paymentType: 'FULL_PAYMENT', initialWaitHours: 72, additionalWaitHours: 12, transferEnabled: true, cashEnabled: false },
      { paymentType: 'DEPOSIT', initialWaitHours: 48, additionalWaitHours: 12, minimumDepositBp: 3333, balanceDeadlineAdvanceHours: 12, transferEnabled: true, cashEnabled: true }]);
  });

  it('changes a tour value with the serviceId of that tour, inheriting from the tenant row what the tour does not define', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: { data: [] } }, { ok: page([full, deposit]) }, { ok: catalog }, { ok: page([]) });
    await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ services: { [NAME]: { initialHoursDeposit: 36 } } }), 'key-12345678'));
    expect((calls[2].body as { parameters: unknown[] }).parameters).toEqual([
      { paymentType: 'DEPOSIT', serviceId: 't-1', initialWaitHours: 36, additionalWaitHours: 24, minimumDepositBp: 3000, balanceDeadlineAdvanceHours: 12, transferEnabled: true, cashEnabled: true }]);
  });

  it('builds no call for what the contract cannot express: clearing a value back to the inherited one, penalty included', async () => {
    for (const command of [save({ tenant: { initialHoursTotal: null } }), save({ tenant: { cancellationPenaltyPercent: null } })]) {
      const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: page([]) });
      expect(await firstValueFrom(new PaymentParametersApiWriter(client).save(command, 'key-12345678')).catch((e) => e)).toMatchObject({ code: 'NOT_IN_CONTRACT' });
      expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    }
  });

  it('writes the penalty of the tenant to PUT /cancellation-policies in basis points, with the reason and the key, and sends nothing to /payment-parameters (HU-COM-013 DP-02)', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: { data: [tenantPolicy] } }, { ok: page([full, deposit]) }, { ok: catalog }, { ok: page([tenantPolicy]) });
    const view = await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ tenant: { cancellationPenaltyPercent: 50 } }), 'key-12345678'));
    expect(calls[2]).toEqual({ path: `${API_BASE}/cancellation-policies`, method: 'PUT', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { reason: 'Motivo', policies: [{ penaltyBasisPoints: 5000 }] } });
    expect(calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/payment-parameters'))).toEqual([]);
    expect(view.rows[0].applied.cancellationPenaltyPercent).toBe(50);
  });

  it('writes the penalty of a tour with its serviceId, zero included, and a mixed change makes two writes under two keys', async () => {
    const { client, calls } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { ok: { data: [] } }, { ok: { data: [servicePolicy] } }, { ok: page([full, deposit]) }, { ok: catalog }, { ok: page([]) });
    await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ services: { [NAME]: { initialHoursDeposit: 36, cancellationPenaltyPercent: 0 } } }), 'key-12345678'));
    expect(calls[2]).toMatchObject({ path: `${API_BASE}/payment-parameters`, method: 'PUT', headers: { 'Idempotency-Key': 'key-12345678' } });
    expect(calls[3]).toEqual({ path: `${API_BASE}/cancellation-policies`, method: 'PUT', headers: { 'Idempotency-Key': 'key-12345678:penalty' },
      body: { reason: 'Motivo', policies: [{ serviceId: 't-1', penaltyBasisPoints: 0 }] } });
  });

  it('shows the refusal of the service, such as a value out of bounds, as the page error', async () => {
    const { client } = fakeClient({ ok: page([full, deposit]) }, { ok: catalog }, { fail: { status: 400, code: 'VALIDATION_ERROR', message: 'Some of the data is not valid. Review it and try again.', traceId: 't-1' } });
    expect(await firstValueFrom(new PaymentParametersApiWriter(client).save(save({ tenant: { initialHoursTotal: 60 } }), 'key-12345678')).catch((e) => e)).toMatchObject({ status: 400 });
  });
});

describe('sourceProvidersOfThePaymentParameters', () => {
  it('provides the parameters source and writer over the container client', () => {
    const injector = Injector.create({ providers: sourceProviders(fakeClient().client) });
    expect(injector.get(PaymentParametersSource)).toBeInstanceOf(PaymentParametersApiSource);
    expect(injector.get(PaymentParametersWriter)).toBeInstanceOf(PaymentParametersApiWriter);
  });
});

import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { RefundsApiSource, RefundsApiWriter } from '../src/app/http/refunds-api-sources';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { PortalApiClient } from '../src/app/shell-contract';
import { fakeClient, page } from './api-client.double';

// HU-COM-016 (AC-RF.4, DD-2): "Ejecutar" over the real service starts the saga execute-refund (HU-WFL-003) and follows it to its end. The tenant and the
// executor are the token's, so the body carries neither. The cash routes behind the saga are not the portal's concern: it only reads how the saga ended.
const NOW = Date.parse('2026-11-10T12:00:00Z');
class Stored extends ReservationsSource {
  override list(): Observable<readonly Reservation[]> { return of([{ id: 'r-1', leadCustomerName: 'Laura Gómez (demo)' } as Reservation]); }
}
const SAGA = '/api/v1/sagas/execute-refund';
const refund = (over: object = {}) => ({ refundAuthorizationId: 'f-1', reservationId: 'r-1', financialDecisionId: 'd-1', origin: 'CUSTOMER_CANCELLATION', authorizedAmountCents: 80000,
  reason: 'Cancelación a tiempo', authorizedAt: '2026-11-10T08:00:00Z', executionDueAt: '2026-11-17T08:00:00Z', overdue: false, executionState: 'AUTHORIZED', ...over });
const decision = { financialDecisionId: 'd-1', reservationId: 'r-1', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 80000, recognizedAt: '2026-11-10T06:00:00Z',
  decisionDueAt: '2026-11-11T06:00:00Z', frozen: false, outcome: 'REFUND_FULL', decidedAt: '2026-11-10T07:00:00Z' };
const saga = (status: string, over: object = {}) => ({ id: 's-1', status, completedSteps: [], createdAt: '2026-11-10T12:00:00Z', updatedAt: '2026-11-10T12:00:01Z', ...over });
const after = (refunds: object[]) => [{ ok: page([decision]) }, { ok: page(refunds) }] as const;
const writerOver = (client: PortalApiClient) =>
  new RefundsApiWriter(client, new RefundsApiSource(client, new Stored(), () => NOW), () => NOW, 0);

describe('executeRefundOverTheSaga', () => {
  it('starts the saga with the key of the intention and the body of the contract only, follows it and answers the executed refund', async () => {
    const { client, calls } = fakeClient({ ok: page([refund()]) }, { ok: saga('RUNNING', { completedSteps: ['START_EXECUTION'] }) }, { ok: saga('COMPLETED') },
      ...after([refund({ executionState: 'EXECUTED', outflowMethod: 'CASH', cashMovementId: 'm-1', executedAt: '2026-11-10T12:00:02Z' })]));
    const outcome = await firstValueFrom(writerOver(client).executeRefund('r-1', 'CASH', 'execute-key-0001'));
    expect(calls[0].path).toBe(`${API_BASE}/refund-authorizations?page=1&limit=100`);
    expect(calls[1]).toEqual({ path: SAGA, method: 'POST', headers: { 'Idempotency-Key': 'execute-key-0001' },
      body: { refundAuthorizationId: 'f-1', reservationId: 'r-1', outflowMedium: 'CASH', amountCents: 80000, businessDate: '2026-11-10', reason: 'Cancelación a tiempo' } });
    expect(calls[2].path).toBe(`${SAGA}/s-1`);
    expect(outcome).toMatchObject({ kind: 'executed', refund: { id: 'r-1', state: 'EJECUTADA', cashMovement: 'm-1' } });
  });

  it('keeps asking the saga while it runs and sends a transfer as TRANSFER', async () => {
    const { client, calls } = fakeClient({ ok: page([refund()]) }, { ok: saga('RUNNING') }, { ok: saga('RUNNING') }, { ok: saga('RUNNING') }, { ok: saga('COMPLETED') },
      ...after([refund({ executionState: 'EXECUTED', outflowMethod: 'TRANSFER' })]));
    await firstValueFrom(writerOver(client).executeRefund('r-1', 'BANK_TRANSFER', 'execute-key-0002'));
    expect(calls.filter((c) => c.path === `${SAGA}/s-1`)).toHaveLength(3);
    expect((calls[1].body as { outflowMedium: string }).outflowMedium).toBe('TRANSFER');
  });

  it('answers cash-failed with the refund still authorized when the saga compensated', async () => {
    const { client } = fakeClient({ ok: page([refund()]) }, { ok: saga('RUNNING') }, { ok: saga('COMPENSATED', { failedStep: 'RECORD_CASH_OUTFLOW' }) }, ...after([refund()]));
    expect(await firstValueFrom(writerOver(client).executeRefund('r-1', 'CASH', 'execute-key-0003'))).toMatchObject({ kind: 'cash-failed', refund: { state: 'AUTORIZADA' } });
  });

  it('shows a saga that ended FAILED as an error that tells a person must review it', async () => {
    const { client } = fakeClient({ ok: page([refund()]) }, { ok: saga('FAILED', { failedStep: 'RECORD_CASH_OUTFLOW' }) });
    await expect(firstValueFrom(writerOver(client).executeRefund('r-1', 'CASH', 'execute-key-0004'))).rejects.toMatchObject({ code: 'SAGA_FAILED', userMessage: expect.stringContaining('revis') });
  });

  it('hands the refusal of the saga to the page in Spanish, and builds no call when the refund has no authorization to execute', async () => {
    const refused = fakeClient({ ok: page([refund()]) }, { fail: { status: 403, code: 'FORBIDDEN', message: 'forbidden', traceId: 't' } });
    await expect(firstValueFrom(writerOver(refused.client).executeRefund('r-1', 'CASH', 'execute-key-0005'))).rejects.toMatchObject({ status: 403, userMessage: 'No tienes permiso para ejecutar devoluciones.' });
    const none = fakeClient({ ok: page([refund({ executionState: 'EXECUTED' })]) });
    await expect(firstValueFrom(writerOver(none.client).executeRefund('r-1', 'CASH', 'execute-key-0006'))).rejects.toMatchObject({ status: 404 });
    expect(none.calls).toHaveLength(1);
  });

  it('cuts the reason to the 200 characters of the contract and leaves the credit balance to its own story', async () => {
    const long = fakeClient({ ok: page([refund({ reason: 'x'.repeat(300) })]) }, { ok: saga('COMPLETED') }, ...after([refund({ executionState: 'EXECUTED' })]));
    await firstValueFrom(writerOver(long.client).executeRefund('r-1', 'CASH', 'execute-key-0007'));
    expect((long.calls[1].body as { reason: string }).reason).toHaveLength(200);
    const credit = fakeClient();
    await expect(firstValueFrom(writerOver(credit.client).executeRefund('r-1', null, 'execute-key-0008'))).rejects.toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(credit.calls).toEqual([]);
  });
});

import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { RefundsApiSource, RefundsApiWriter } from '../src/app/http/refunds-api-sources';
import { RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-016 over the container client (portal spec plan D-02, D-05; api routes of the proposed contract): the refunds are the service's decisions and refunds,
// joined by reservation; the portal derives the screen state, draws the minutes left at the clock it is given and sends nothing it was not asked to send.
const NOW = Date.parse('2026-11-10T12:00:00Z');
const reservation = (id: string, name: string) => ({ id, leadCustomerName: name } as Reservation);
class Stored extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const reservations = new Stored([reservation('r-1', 'Laura Gómez (demo)'), reservation('r-2', 'Carlos Ruiz (demo)'), reservation('r-3', 'Ana Pérez (demo)'), reservation('r-4', 'Pedro Díaz (demo)')]);
const decision = (over: object) => ({ financialDecisionId: 'd-1', reservationId: 'r-1', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 80000, recognizedAt: '2026-11-10T06:00:00Z',
  decisionDueAt: '2026-11-11T06:00:00Z', frozen: false, ...over });
const refund = (over: object) => ({ refundAuthorizationId: 'f-1', reservationId: 'r-1', financialDecisionId: 'd-1', origin: 'CUSTOMER_CANCELLATION', authorizedAmountCents: 80000,
  reason: 'Cancelación a tiempo', authorizedAt: '2026-11-10T08:00:00Z', executionDueAt: '2026-11-17T08:00:00Z', overdue: false, executionState: 'AUTHORIZED', ...over });
const listed = (decisions: object[], refunds: object[]) => [{ ok: page(decisions) }, { ok: page(refunds) }] as const;

describe('refundsSourceOverTheApiClient', () => {
  it('reads both lists of the service and joins the customer by reservation', async () => {
    const { client, calls } = fakeClient(...listed([decision({})], []));
    const rows = await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW).list());
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/financial-decisions?page=1&limit=100`, `${API_BASE}/refund-authorizations?page=1&limit=100`]);
    expect(rows).toEqual([expect.objectContaining({ id: 'r-1', customer: 'Laura Gómez (demo)', reason: 'Cancelación solicitada por el cliente', amountCents: 80000 })]);
  });

  it('draws the minutes left of an open decision at the clock it is given, and none once decided or frozen', async () => {
    const { client } = fakeClient(...listed([decision({}), decision({ financialDecisionId: 'd-2', reservationId: 'r-2', frozen: true }),
      decision({ financialDecisionId: 'd-3', reservationId: 'r-3', outcome: 'REFUND_FULL', decidedAt: '2026-11-10T09:00:00Z' })], []));
    const rows = await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW).list());
    expect(rows.map((r) => [r.id, r.state, r.remainingMinutes])).toEqual([['r-1', 'PENDIENTE_DE_DECISION', 18 * 60], ['r-2', 'PENDIENTE_DE_DECISION', null], ['r-3', 'PENDIENTE_DE_AUTORIZACION', null]]);
    expect(rows[0]).toMatchObject({ decisionDueAt: '2026-11-11T06:00:00Z', executionDueAt: null, defaulted: false });
  });

  it('shows the refund state over the decision, its method, its movement and the overdue mark', async () => {
    const executed = refund({ refundAuthorizationId: 'f-2', financialDecisionId: 'd-2', reservationId: 'r-2', executionState: 'EXECUTED', outflowMethod: 'TRANSFER', cashMovementId: 'm-1', executedAt: '2026-11-12T10:00:00Z' });
    const { client } = fakeClient(...listed([decision({ outcome: 'REFUND_FULL' }), decision({ financialDecisionId: 'd-2', reservationId: 'r-2', outcome: 'REFUND_FULL' })], [refund({ overdue: true }), executed]));
    const rows = await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW).list());
    expect(rows[0]).toMatchObject({ state: 'AUTORIZADA', overdue: true, decisionReason: 'Cancelación a tiempo', executionDueAt: '2026-11-17T08:00:00Z', decisionDueAt: null });
    expect(rows[1]).toMatchObject({ state: 'EJECUTADA', method: 'BANK_TRANSFER', cashMovement: 'm-1', date: '2026-11-12T10:00:00Z', executionDueAt: null });
  });

  it('reads a default of the 24 hours, a rejection, a credit outcome and a refund determined with no decision', async () => {
    const { client } = fakeClient(...listed([decision({ outcome: 'REFUND_FULL', decidedBySystem: true }), decision({ financialDecisionId: 'd-2', reservationId: 'r-2', kind: 'CREDIT_BALANCE_REFUND_REQUEST', outcome: 'REJECTED', justification: 'No procede' }),
      decision({ financialDecisionId: 'd-3', reservationId: 'r-3', outcome: 'CREDIT_FULL' })], [refund({ refundAuthorizationId: 'f-4', financialDecisionId: undefined, reservationId: 'r-4', origin: 'NOT_ATTRIBUTABLE_TO_CUSTOMER' })]));
    const rows = await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW).list());
    expect(rows.map((r) => [r.id, r.state, r.defaulted])).toEqual([['r-1', 'PENDIENTE_DE_AUTORIZACION', true], ['r-2', 'RECHAZADA', false], ['r-3', 'SALDO_A_FAVOR', false], ['r-4', 'AUTORIZADA', false]]);
    expect(rows[1]).toMatchObject({ decisionReason: 'No procede', reason: 'Solicitud de devolución de saldo a favor' });
    expect(rows[3]).toMatchObject({ reason: 'Causa no atribuible al cliente' });
  });
});

describe('refundsWriterOverTheApiClient', () => {

  it('posts the reason with the key of the intention to the authorization of the decision that waits, and reads the refund again', async () => {
    const waiting = decision({ outcome: 'REFUND_FULL' });
    const { client, calls } = fakeClient({ ok: page([waiting]) }, { ok: refund({}) }, ...listed([waiting], [refund({})]));
    const source = new RefundsApiSource(client, reservations, () => NOW);
    const result = await firstValueFrom(new RefundsApiWriter(client, source).authorize('r-1', 'Cancelación a tiempo', 'authorize-key-0001'));
    expect(calls[0].path).toBe(`${API_BASE}/financial-decisions?page=1&limit=100&pending=true`);
    expect(calls[1]).toEqual({ path: `${API_BASE}/financial-decisions/d-1/refund-authorization`, method: 'POST', body: { reason: 'Cancelación a tiempo' }, headers: { 'Idempotency-Key': 'authorize-key-0001' } });
    expect(result).toMatchObject({ id: 'r-1', state: 'AUTORIZADA' });
  });

  it('records the 100 % decision with no body and rejects with the justification', async () => {
    const open = decision({});
    const record = fakeClient({ ok: page([open]) }, { ok: { ...open, outcome: 'REFUND_FULL' } }, ...listed([{ ...open, outcome: 'REFUND_FULL' }], []));
    await firstValueFrom(new RefundsApiWriter(record.client, new RefundsApiSource(record.client, reservations, () => NOW)).decideFullRefund('r-1', 'decision-key-0001'));
    expect(record.calls[1]).toEqual({ path: `${API_BASE}/financial-decisions/d-1/refund-decision`, method: 'POST', headers: { 'Idempotency-Key': 'decision-key-0001' } });
    const reject = fakeClient({ ok: page([open]) }, { ok: { ...open, outcome: 'REJECTED' } }, ...listed([{ ...open, outcome: 'REJECTED', justification: 'No procede' }], []));
    await firstValueFrom(new RefundsApiWriter(reject.client, new RefundsApiSource(reject.client, reservations, () => NOW)).reject('r-1', 'No procede', 'reject-key-00001'));
    expect(reject.calls[1]).toMatchObject({ path: `${API_BASE}/financial-decisions/d-1/rejection`, body: { justification: 'No procede' } });
  });

  it('hands a refusal of the service to the page and sends nothing when no decision waits for the act', async () => {
    const waiting = decision({});
    const refused = fakeClient({ ok: page([waiting]) }, { fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'no', traceId: 't' } });
    await expect(firstValueFrom(new RefundsApiWriter(refused.client, new RefundsApiSource(refused.client, reservations, () => NOW)).reject('r-1', 'x', 'reject-key-00002'))).rejects.toMatchObject({ status: 422 });
    const none = fakeClient({ ok: page([]) });
    await expect(firstValueFrom(new RefundsApiWriter(none.client, new RefundsApiSource(none.client, reservations, () => NOW)).authorize('r-1', 'x', 'authorize-key-0002'))).rejects.toMatchObject({ status: 404 });
    expect(none.calls).toHaveLength(1);
  });

  it('leaves the credit balance and the execution to their own stories', async () => {
    const { client, calls } = fakeClient();
    const writer = new RefundsApiWriter(client, new RefundsApiSource(client, reservations, () => NOW));
    await expect(firstValueFrom(writer.keepAsCreditBalance())).rejects.toMatchObject({ code: 'NOT_IN_CONTRACT' });
    await expect(firstValueFrom(writer.executeRefund())).rejects.toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(calls).toEqual([]);
  });
});

describe('the container build provides the refund ports', () => {
  it('registers the source and the writer over the client, so the refund screens exist outside the demo', () => {
    const provided = sourceProviders(fakeClient().client).map((p) => (p as { provide?: unknown }).provide);
    expect(provided).toContain(RefundsSource);
    expect(provided).toContain(RefundsWriter);
  });
});

import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { CreditBalanceApiSource, CreditBalanceApiWriter } from '../src/app/http/credit-balance-api-sources';
import { CreditBalanceSource, CreditBalanceWriter } from '../src/app/credit-balance/data/credit-balance-ports';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-017 over the container client (portal spec plan D-03, D-08; routes of the proposed contract): the service owns every value and refusal; the portal groups the
// credits by customer (DP-CB8: the customer is told by name in the reservations list), asks the history only where there is one, and sends no figure of its own.
const reservation = (id: string, name: string, over: Partial<Reservation> = {}): Reservation => ({
  id, leadCustomerName: name, tourName: 'Desierto de la Tatacoa', departureDate: '2026-12-07T06:30:00Z', conditions: '', people: 2,
  quote: { services: [{ name: 'Desierto de la Tatacoa', cents: 100000 }], transportCents: 0, projectedCents: 100000, discounts: [], discountCents: 0, finalCents: 100000 },
  balanceCents: 0, status: 'CANCELADA', financialStatus: 'SIN_PAGO', seatHeld: false, departureId: 'dep-1', ...over,
});
class Stored extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const reservations = new Stored([reservation('r-1', 'Laura Gómez'), reservation('r-2', 'Pedro Ruiz'),
  reservation('r-3', 'laura gomez', { status: 'PENDIENTE_DE_PAGO', balanceCents: 50000 }), reservation('r-4', 'Laura Gómez', { status: 'FINALIZADA', balanceCents: 9000 })]);
const credit = (id: string, source: string, customer: string, recorded: number, applied = 0, inRefund = 0) => ({ creditBalanceId: id, sourceReservationId: source, customerId: customer,
  origin: 'CUSTOMER_CANCELLATION', recordedCents: recorded, appliedCents: applied, inRefundCents: inRefund, availableCents: recorded - applied - inRefund, recordedAt: '2026-11-01T10:00:00Z' });
const first = credit('c-1', 'r-1', 'cu-1', 30000, 10000, 5000), second = credit('c-2', 'r-2', 'cu-2', 20000);
const detail = { ...first, applications: [{ creditBalanceApplicationId: 'a-1', creditBalanceId: 'c-1', targetReservationId: 'r-3', amountCents: 10000, appliedBy: 'u-9', appliedAs: 'STAFF', appliedAt: '2026-11-03T10:00:00Z' }],
  refundRequests: [{ financialDecisionId: 'd-1', amountCents: 5000, requestedBy: 'u-9', requestedAt: '2026-11-04T10:00:00Z' }] };
const decision = { financialDecisionId: 'd-1', reservationId: 'r-1', kind: 'CREDIT_BALANCE_REFUND_REQUEST', baseAmountCents: 5000, recognizedAt: '2026-11-04T10:00:00Z', decisionDueAt: '2026-11-05T10:00:00Z', frozen: false };
const summary = { availableCents: 35000, customersWithCredit: 2, requestsToDecide: 1 };
const fail = (status: number, code: string) => ({ fail: { status, code, message: 'refused', traceId: 't' } });

describe('creditBalanceSourceOverTheApiClient', () => {
  it('builds the overview from the credits, the summary, the requests and the detail of the credits that have a history', async () => {
    const { client, calls } = fakeClient({ ok: page([first, second]) }, { ok: summary }, { ok: page([decision]) }, { ok: detail });
    const overview = await firstValueFrom(new CreditBalanceApiSource(client, reservations).list());

    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/credit-balances?page=1&limit=100`, `${API_BASE}/credit-balance-summary`,
      `${API_BASE}/financial-decisions?page=1&limit=100`, `${API_BASE}/credit-balances/c-1`]);
    expect(overview).toMatchObject({ availableCents: 35000, customersWithBalance: 2, pendingDecisions: 1 });
    const laura = overview.customers[1];
    expect(laura).toMatchObject({ name: 'Laura Gómez', availableCents: 15000, suggestedCents: 15000 });
    expect(laura.sources).toEqual([{ reservationId: 'r-1', balanceCents: 20000, requestedCents: 5000, availableCents: 15000 }]);
    expect(laura.targets).toEqual([{ reservationId: 'r-3', balanceCents: 50000 }]);
    expect(laura.history.map((m) => [m.kind, m.amountCents])).toEqual([['DEVOLUCION', -5000], ['APLICACION', -10000], ['ORIGEN', 30000]]);
    expect(overview.customers[0]).toMatchObject({ name: 'Pedro Ruiz', availableCents: 20000, targets: [], suggestedCents: 0 });
    expect(overview.requests).toEqual([expect.objectContaining({ id: 'd-1', reservationId: 'r-1', customer: 'Laura Gómez', amountCents: 5000, state: 'PENDIENTE_DE_AUTORIZACION' })]);
  });

  it('reads the treatment of a reservation from its open decision and the credit already recorded', async () => {
    const open = { ...decision, financialDecisionId: 'd-2', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 80000 };
    const { client } = fakeClient({ ok: page([open]) }, { ok: page([]) });
    const treatment = await firstValueFrom(new CreditBalanceApiSource(client, reservations).treatmentOf('r-1'));
    expect(treatment).toEqual({ reservationId: 'r-1', amountCents: 80000, open: true, recorded: null });
    const none = fakeClient({ ok: page([]) }, { ok: page([]) });
    expect(await firstValueFrom(new CreditBalanceApiSource(none.client, reservations).treatmentOf('r-1'))).toBeNull();
  });

  it('hands a failure of the service to the page', async () => {
    const { client } = fakeClient(fail(403, 'FORBIDDEN'));
    await expect(firstValueFrom(new CreditBalanceApiSource(client, reservations).list())).rejects.toMatchObject({ status: 403 });
  });
});

describe('creditBalanceWriterOverTheApiClient', () => {
  const open = { ...decision, financialDecisionId: 'd-2', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 80000 };

  it('records the credit of the open decision with the Idempotency-Key and no body', async () => {
    const { client, calls } = fakeClient({ ok: page([open]) }, { ok: credit('c-9', 'r-1', 'cu-1', 80000) });
    const line = await firstValueFrom(new CreditBalanceApiWriter(client, reservations).recordFromTreatment('r-1', 'credit-key-0001'));
    expect(calls[1]).toEqual({ path: `${API_BASE}/financial-decisions/d-2/credit-decision`, method: 'POST', headers: { 'Idempotency-Key': 'credit-key-0001' } });
    expect(line).toMatchObject({ id: 'c-9', reservationId: 'r-1', amountCents: 80000, origin: 'TRATAMIENTO', status: 'PENDIENTE', appliedTo: null });
  });

  it('asks the service to apply the credits of the customer to the target, one route per credit, and sends only the target and the amount', async () => {
    const applied = (id: string, cents: number) => ({ creditBalanceApplicationId: 'a', creditBalanceId: id, targetReservationId: 'r-3', amountCents: cents, appliedBy: 'u', appliedAs: 'STAFF', appliedAt: '2026-11-05T10:00:00Z' });
    const { client, calls } = fakeClient({ ok: page([first, credit('c-5', 'r-4', 'cu-1', 12000)]) }, { ok: applied('c-1', 15000) }, { ok: applied('c-5', 5000) });
    const outcome = await firstValueFrom(new CreditBalanceApiWriter(client, reservations).apply('r-3', 20000, 'apply-key-0001'));
    expect(calls.slice(1)).toEqual([
      { path: `${API_BASE}/credit-balances/c-1/applications`, method: 'POST', body: { targetReservationId: 'r-3', amountCents: 15000 }, headers: { 'Idempotency-Key': 'apply-key-0001-1' } },
      { path: `${API_BASE}/credit-balances/c-5/applications`, method: 'POST', body: { targetReservationId: 'r-3', amountCents: 5000 }, headers: { 'Idempotency-Key': 'apply-key-0001-2' } }]);
    expect(outcome).toEqual({ ok: true, appliedCents: 20000, firstPayment: true });
  });

  it('answers a business refusal of the service as data and any other failure as an error', async () => {
    const refused = fakeClient({ ok: page([first]) }, { fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'above the pending balance', traceId: 't' } });
    expect(await firstValueFrom(new CreditBalanceApiWriter(refused.client, reservations).apply('r-3', 1000, 'apply-key-0002'))).toEqual({ ok: false, reason: 'above the pending balance' });
    const denied = fakeClient({ ok: page([first]) }, fail(403, 'FORBIDDEN'));
    await expect(firstValueFrom(new CreditBalanceApiWriter(denied.client, reservations).apply('r-3', 1000, 'apply-key-0003'))).rejects.toMatchObject({ status: 403 });
  });

  it('records no excess itself: the service does it when it approves the proof', async () => {
    const { client, calls } = fakeClient();
    const split = await firstValueFrom(new CreditBalanceApiWriter(client, reservations).recordExcess(reservation('r-3', 'Laura', { balanceCents: 50000 }), 70000, 'excess-key-0001'));
    expect(calls).toEqual([]);
    expect(split).toEqual({ appliedCents: 50000, pendingCents: 0, excess: null });
  });
});

describe('the container build provides the credit balance ports', () => {
  it('registers the source and the writer over the client, so the screens exist outside the demo', () => {
    const provided = sourceProviders(fakeClient().client).map((p) => (p as { provide?: unknown }).provide);
    expect(provided).toContain(CreditBalanceSource);
    expect(provided).toContain(CreditBalanceWriter);
  });
});

import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ModificationApiQuote, ModificationApiWriter } from '../src/app/http/modification-api-sources';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ModificationQuote, ReservationModificationWriter } from '../src/app/reservation-changes/travellers-modification/data/modification-ports';
import { sourceProviders } from '../src/app/sources';
import { DemoModificationQuote, DemoTransportFare } from '../src/app/demo/reservation-modification-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { fakeClient } from './api-client.double';
import { departureOf, reservationOf } from './reservations.double';

// HU-COM-012 over the container client (portal spec 012 plan D-03, D-05; api routes of the proposed contract): the quote, the refusal and the
// modification are the service's; the portal sends the new number of travellers and nothing it was not asked to send.
const base: Reservation = {
  id: 'r-1', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureDate: '2026-11-07T06:30:00Z', conditions: '', people: 3,
  quote: { services: [{ name: 'Desierto de la Tatacoa', cents: 300000 }], transportCents: 0, projectedCents: 300000, discounts: [], discountCents: 0, finalCents: 300000 },
  balanceCents: 300000, status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: true, departureId: 'd-1', validatedCents: 0,
};
class Stored extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const quoteDto = { reservationId: 'r-1', changeType: 'MODIFICATION', allowed: true, originalFinalValueCents: 300000, newFinalValueCents: 200000, differenceCents: -100000,
  validatedValueCents: 250000, newPendingBalanceCents: 0, excessCents: 50000, seatDelta: -1, seatsAvailable: true };
const recordDto = { modificationId: 'm-1', reservationId: 'r-1', changeType: 'MODIFICATION', people: 2, originalFinalValueCents: 300000, newFinalValueCents: 200000,
  resultingPendingBalanceCents: 0, excessCents: 50000, seatDelta: -1, excessDecisionOpened: true, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'PARTIAL',
  reason: 'Un viajero menos', modifiedBy: 'u-1', modifiedAt: '2026-11-04T10:00:00Z' };
const quotePath = `${API_BASE}/reservations/r-1/modification-quote`;
const writePath = `${API_BASE}/reservations/r-1/modifications`;
const command = { code: 'r-1', change: { added: 0, removed: 1 }, cause: 'Un viajero menos', idempotencyKey: 'modify-key-0001' };
const refusal = (status: number, code: string, message = 'refused') => ({ fail: { status, code, message, traceId: 't' } });

describe('modificationQuoteOverTheApiClient', () => {
  it('asks the service with the travellers the reservation has now and answers allowed', async () => {
    const { client, calls } = fakeClient({ ok: { ...quoteDto, newFinalValueCents: 300000, differenceCents: 0 } });
    expect(await firstValueFrom(new ModificationApiQuote(client, new Stored([base])).admits('r-1'))).toEqual({ kind: 'allowed' });
    expect(calls).toEqual([{ path: quotePath, method: 'POST', body: { changeType: 'MODIFICATION', people: 3 } }]);
  });

  it.each([['NO_POLICY'], ['NOT_ALLOWED'], ['TOO_LATE']])('reads the refusal %s of the terms of the tour as not allowed', async (refusalReason) => {
    const { client } = fakeClient({ ok: { ...quoteDto, allowed: false, refusalReason } });
    expect(await firstValueFrom(new ModificationApiQuote(client, new Stored([base])).admits('r-1'))).toEqual({ kind: 'refused', reason: 'not-allowed' });
  });

  it.each(['EN_EJECUCION', 'FINALIZADA', 'CANCELADA'] as const)('refuses a %s reservation as not before execution and asks the service nothing', async (status) => {
    const { client, calls } = fakeClient();
    expect(await firstValueFrom(new ModificationApiQuote(client, new Stored([{ ...base, status }])).admits('r-1'))).toEqual({ kind: 'refused', reason: 'not-before-execution' });
    expect(calls).toEqual([]);
  });

  it('answers null for a reservation the service does not know or the list does not hold', async () => {
    expect(await firstValueFrom(new ModificationApiQuote(fakeClient(refusal(404, 'NOT_FOUND')).client, new Stored([base])).admits('r-1'))).toBeNull();
    expect(await firstValueFrom(new ModificationApiQuote(fakeClient().client, new Stored([])).admits('r-1'))).toBeNull();
  });

  it('hands any other failure to the page', async () => {
    const { client } = fakeClient(refusal(403, 'FORBIDDEN'));
    await expect(firstValueFrom(new ModificationApiQuote(client, new Stored([base])).admits('r-1'))).rejects.toMatchObject({ status: 403 });
  });

  it('sends the travellers after the change and gives the lines as the service computed them, adding nothing up', async () => {
    const { client, calls } = fakeClient({ ok: quoteDto });
    const lines = await firstValueFrom(new ModificationApiQuote(client, new Stored([base])).lines('r-1', { added: 0, removed: 1 }));
    expect(calls).toEqual([{ path: quotePath, method: 'POST', body: { changeType: 'MODIFICATION', people: 2 } }]);
    expect(lines).toEqual({ allowed: true, projectedCents: null, discountCents: null, finalCents: 200000, balanceCents: 0, differenceCents: -100000, excessCents: 50000,
      seatsAvailable: true });
  });

  it('keeps a refused quote as it is and flags the departure without seats', async () => {
    const { client } = fakeClient({ ok: { ...quoteDto, seatsAvailable: false, allowed: false, refusalReason: 'NO_AVAILABILITY' } });
    expect(await firstValueFrom(new ModificationApiQuote(client, new Stored([base])).lines('r-1', { added: 5, removed: 0 })))
      .toMatchObject({ allowed: false, seatsAvailable: false });
  });
});

describe('reservationModificationWriterOverTheApiClient', () => {
  it('posts the new number of travellers and the cause with the key of the intention, and nothing else', async () => {
    const { client, calls } = fakeClient({ ok: recordDto });
    await firstValueFrom(new ModificationApiWriter(client, new Stored([base])).modify(command));
    expect(calls).toEqual([{ path: writePath, method: 'POST', body: { changeType: 'MODIFICATION', people: 2, reason: 'Un viajero menos' },
      headers: { 'Idempotency-Key': 'modify-key-0001' } }]);
  });

  it('answers modified with the reservation as the service holds it now and the trace of the record', async () => {
    const after: Reservation = { ...base, people: 2, balanceCents: 0, quote: { ...base.quote, finalCents: 200000 } };
    const { client } = fakeClient({ ok: recordDto });
    const outcome = await firstValueFrom(new ModificationApiWriter(client, new Stored([after])).modify(command));
    expect(outcome).toEqual({ kind: 'modified', reservation: after, trace: { reservationCode: 'r-1', originalCents: 300000, recalculatedCents: 200000, balanceCents: 0,
      differenceCents: -100000, cause: 'Un viajero menos', by: 'u-1', at: '2026-11-04T10:00:00Z', decision: { kind: 'MODIFICATION_EXCESS', excessCents: 50000, outcome: null } } });
  });

  it('opens no decision when the record has no excess', async () => {
    const { client } = fakeClient({ ok: { ...recordDto, excessCents: 0, excessDecisionOpened: false } });
    const outcome = await firstValueFrom(new ModificationApiWriter(client, new Stored([base])).modify(command));
    expect(outcome.kind === 'modified' && outcome.trace.decision).toBeNull();
  });

  it.each([
    ['BUSINESS_RULE_VIOLATION', 'the terms of the tour refuse the change: NO_POLICY', 'not-allowed'],
    ['BUSINESS_RULE_VIOLATION', 'the terms of the tour refuse the change: TOO_LATE', 'not-allowed'],
    ['BUSINESS_RULE_VIOLATION', 'the departure has no seats for the change', 'no-capacity'],
    ['INVALID_STATUS_TRANSITION', 'cannot modify a running reservation', 'not-before-execution'],
  ] as const)('reads a 422 %s "%s" as the refusal %s that changed nothing', async (code, message, reason) => {
    const { client } = fakeClient(refusal(422, code, message));
    expect(await firstValueFrom(new ModificationApiWriter(client, new Stored([base])).modify(command))).toEqual({ kind: 'refused', reason });
  });

  it('hands the other failures to the page and writes nothing for a reservation that would be left with no traveller', async () => {
    const denied = fakeClient(refusal(403, 'FORBIDDEN'));
    await expect(firstValueFrom(new ModificationApiWriter(denied.client, new Stored([base])).modify(command))).rejects.toMatchObject({ status: 403 });
    const none = fakeClient();
    await expect(firstValueFrom(new ModificationApiWriter(none.client, new Stored([base])).modify({ ...command, change: { added: 0, removed: 3 } }))).rejects.toBeTruthy();
    expect(none.calls).toEqual([]);
  });
});

describe('the container build provides the modification ports', () => {
  it('registers the quote and the writer over the client, so choosing the option does not fail outside the demo', () => {
    const provided = sourceProviders(fakeClient().client).map((p) => (p as { provide?: unknown }).provide);
    expect(provided).toContain(ModificationQuote);
    expect(provided).toContain(ReservationModificationWriter);
  });
});

describe('the demo quote answers the same lines as the service does', () => {
  const two = reservationOf('RES-A', { status: 'CONFIRMADA', departureId: 'dep-1', validatedCents: 4000, balanceCents: 1000 });
  const quotes = () => { const d = { items: [departureOf(1, { effectiveCapacity: 3 })] }; return new DemoModificationQuote(new DemoReservationsStore([two]), new DemoTransportFare(d), [], d); };

  it('gives projected value, discounts, final value, balance and the difference or the excess for the travellers after the change', async () => {
    expect(await firstValueFrom(quotes().lines('RES-A', { added: 1, removed: 0 }))).toEqual({ allowed: true, projectedCents: 7500, discountCents: 0, finalCents: 7500,
      balanceCents: 3500, differenceCents: 2500, excessCents: 0, seatsAvailable: true });
    expect(await firstValueFrom(quotes().lines('RES-A', { added: 0, removed: 1 }))).toMatchObject({ finalCents: 2500, balanceCents: 0, excessCents: 1500 });
  });

  it('says the departure has no seats for more travellers than its capacity, and null for an unknown reservation', async () => {
    expect(await firstValueFrom(quotes().lines('RES-A', { added: 2, removed: 0 }))).toMatchObject({ seatsAvailable: false });
    expect(await firstValueFrom(quotes().lines('RES-X', { added: 1, removed: 0 }))).toBeNull();
  });
});

import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { CancellationApiQuote, CancellationApiWriter } from '../src/app/http/cancellation-api-sources';
import { CancellationQuote, CancellationWriter } from '../src/app/reservation-changes/data/cancellation-ports';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { sourceProviders } from '../src/app/sources';
import { fakeClient } from './api-client.double';

// HU-COM-013 over the container client (portal spec plan D-03, D-06, D-10; api routes of the proposed contract): the quote and the cancellation
// are the service's; the portal maps the wire to its own words and sends nothing it was not asked to send.
const base: Reservation = {
  id: 'r-1', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureDate: '2026-11-07T06:30:00Z', conditions: '', people: 3,
  quote: { services: [{ name: 'Desierto de la Tatacoa', cents: 300000 }], transportCents: 0, projectedCents: 300000, discounts: [], discountCents: 0, finalCents: 300000 },
  balanceCents: 0, status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO', seatHeld: true, departureId: 'd-1', validatedCents: 300000,
};
class Stored extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const quoteDto = { reservationId: 'r-1', cancellable: true, validatedValueCents: 300000, penaltyBasisPoints: 5000, penaltyCents: 150000, refundableCents: 150000 };
const recordDto = { reservationId: 'r-1', reservationStatus: 'CANCELLED', reason: 'El cliente no puede viajar', origin: 'CUSTOMER_REQUEST', validatedValueCents: 300000,
  penaltyBasisPoints: 5000, penaltyCents: 150000, refundableCents: 150000, refundDecisionOpened: true, cancelledBy: 'u-1', cancelledAt: '2026-11-04T10:00:00Z' };
const cancelPath = `${API_BASE}/reservations/r-1/cancellation`;
const command = { code: 'r-1', cause: 'El cliente no puede viajar', origin: 'customer', idempotencyKey: 'cancel-key-0001' } as const;

describe('cancellationQuoteOverTheApiClient', () => {
  it('reads the quote of the service and gives the amounts as they come, with no penalty of its own', async () => {
    const { client, calls } = fakeClient({ ok: quoteDto });
    const answer = await firstValueFrom(new CancellationApiQuote(client, new Stored([base])).quote('r-1'));
    expect(calls).toEqual([{ path: `${cancelPath}-quote` }]);
    expect(answer).toEqual({ reservation: base, eligibility: 'allowed', refundable: { kind: 'amount', cents: 150000, penaltyCents: 150000 } });
  });

  it('answers no payments when nothing was validated', async () => {
    const { client } = fakeClient({ ok: { ...quoteDto, validatedValueCents: 0, penaltyCents: 0, refundableCents: 0 } });
    expect((await firstValueFrom(new CancellationApiQuote(client, new Stored([base])).quote('r-1')))?.refundable).toEqual({ kind: 'no-payments' });
  });

  it.each([
    ['INVALID_STATUS_TRANSITION', 'EN_EJECUCION', 'in-execution'], ['INVALID_STATUS_TRANSITION', 'FINALIZADA', 'terminal'],
    ['INVALID_STATUS_TRANSITION', 'CANCELADA', 'terminal'], ['BUSINESS_RULE_VIOLATION', 'CONFIRMADA', 'rescheduling-pending'],
  ] as const)('reads the refusal %s of a %s reservation as %s', async (refusalReason, status, eligibility) => {
    const { client } = fakeClient({ ok: { ...quoteDto, cancellable: false, refusalReason } });
    expect((await firstValueFrom(new CancellationApiQuote(client, new Stored([{ ...base, status }])).quote('r-1')))?.eligibility).toBe(eligibility);
  });

  it('answers null for a reservation the service does not know or the list does not hold', async () => {
    const missing = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'missing', traceId: 't' } });
    expect(await firstValueFrom(new CancellationApiQuote(missing.client, new Stored([base])).quote('r-1'))).toBeNull();
    const unlisted = fakeClient({ ok: quoteDto });
    expect(await firstValueFrom(new CancellationApiQuote(unlisted.client, new Stored([])).quote('r-1'))).toBeNull();
  });

  it('hands any other failure to the page', async () => {
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'no', traceId: 't' } });
    await expect(firstValueFrom(new CancellationApiQuote(client, new Stored([base])).quote('r-1'))).rejects.toMatchObject({ status: 403 });
  });
});

describe('cancellationWriterOverTheApiClient', () => {
  it('posts the reason and the only origin the route registers, with the key of the intention, and nothing else', async () => {
    const store = new Stored([{ ...base, status: 'CANCELADA', seatHeld: false }]);
    const { client, calls } = fakeClient({ ok: recordDto });
    await firstValueFrom(new CancellationApiWriter(client, store, () => 'Colaborador').cancel(command));
    expect(calls).toEqual([{ path: cancelPath, method: 'POST', body: { reason: 'El cliente no puede viajar', origin: 'CUSTOMER_REQUEST' },
      headers: { 'Idempotency-Key': 'cancel-key-0001' } }]);
  });

  it('answers registered with the reservation Cancelada, the cause, the user label and the instant of the service, and the decision when something is refundable', async () => {
    const store = new Stored([{ ...base, status: 'CANCELADA', seatHeld: false }]);
    const { client } = fakeClient({ ok: recordDto });
    const outcome = await firstValueFrom(new CancellationApiWriter(client, store, () => 'Colaborador').cancel(command));
    expect(outcome).toMatchObject({ kind: 'registered', reservation: { id: 'r-1', status: 'CANCELADA', seatHeld: false,
      cancellation: { cause: 'El cliente no puede viajar', by: 'Colaborador', at: '2026-11-04T10:00:00Z', origin: 'customer' },
      financialDecision: { kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 300000, penaltyAmountCents: 150000, refundableCents: 150000, recognizedAt: '2026-11-04T10:00:00Z', outcome: null } } });
  });

  it('opens no decision when the refundable amount is zero', async () => {
    const store = new Stored([{ ...base, status: 'CANCELADA', seatHeld: false }]);
    const { client } = fakeClient({ ok: { ...recordDto, validatedValueCents: 0, penaltyCents: 0, refundableCents: 0, refundDecisionOpened: false } });
    const outcome = await firstValueFrom(new CancellationApiWriter(client, store, () => 'Colaborador').cancel(command));
    expect(outcome.kind === 'registered' && outcome.reservation.financialDecision).toBeFalsy();
  });

  it.each([
    ['INVALID_STATUS_TRANSITION', 'EN_EJECUCION', 'in-execution'], ['INVALID_STATUS_TRANSITION', 'FINALIZADA', 'terminal'],
    ['BUSINESS_RULE_VIOLATION', 'CONFIRMADA', 'rescheduling-pending'],
  ] as const)('reads a 422 %s on a %s reservation as a refusal %s that changes nothing', async (code, status, eligibility) => {
    const store = new Stored([{ ...base, status }]);
    const { client } = fakeClient({ fail: { status: 422, code, message: 'refused', traceId: 't' } });
    const outcome = await firstValueFrom(new CancellationApiWriter(client, store, () => 'Colaborador').cancel(command));
    expect(outcome).toMatchObject({ kind: 'refused', eligibility, reservation: { id: 'r-1', status } });
  });

  it('hands the other failures to the page and sends nothing for an origin this route does not register', async () => {
    const denied = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'no', traceId: 't' } });
    await expect(firstValueFrom(new CancellationApiWriter(denied.client, new Stored([base]), () => 'x').cancel(command))).rejects.toMatchObject({ status: 403 });
    const other = fakeClient();
    await expect(firstValueFrom(new CancellationApiWriter(other.client, new Stored([base]), () => 'x').cancel({ ...command, origin: 'non-payment' })))
      .rejects.toMatchObject({ code: 'NOT_IN_CONTRACT' });
    expect(other.calls).toEqual([]);
  });
});

describe('the container build provides the cancellation ports', () => {
  it('registers the quote and the writer over the client, so the screen and the 10A button exist outside the demo', () => {
    const providers = sourceProviders(fakeClient().client);
    const provided = providers.map((p) => (p as { provide?: unknown }).provide);
    expect(provided).toContain(CancellationQuote);
    expect(provided).toContain(CancellationWriter);
  });
});

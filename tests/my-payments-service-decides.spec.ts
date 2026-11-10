import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ReservationsApiSource } from '../src/app/http/reservations-api-sources';
import { paymentAction, noticeLines } from '../src/app/my-payments/economic-rows';
import { CustomerPaymentSummary, MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-014 portal (AC-14.8, DP-14-03, DP-14-05): the service says which action the customer may take and why a reservation was cancelled;
// the portal reads both and keeps no copy of the rule when the service answers.
const row = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z' };
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3,
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, projectedValueCents: 5997, discounts: [], finalValueCents: 5997,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', pendingBalanceCents: 5997,
  seatHeld: false, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const cancelled = { ...detail, reservationStatus: 'CANCELLED', pendingBalanceCents: 0, cancellationCause: 'PAYMENT_EXPIRY', continueAction: 'NONE' };

describe('reservationsApiSourceReadsTheServiceDecisions', () => {
  it('reads the cancellation cause code of a cancelled reservation as its cancellation, in the words of the screens', async () => {
    const { client } = fakeClient({ ok: page([row]) }, { ok: cancelled });
    const [one] = await firstValueFrom(new ReservationsApiSource(client).list());
    expect(one.status).toBe('CANCELADA');
    expect(one.cancellation).toMatchObject({ cause: 'Cancelada por falta de pago', origin: 'non-payment' });
  });

  it('keeps a free-text cause as it is and the code of the cause not attributable to the customer', async () => {
    const free = fakeClient({ ok: page([row]) }, { ok: { ...cancelled, cancellationCause: 'Viaje cancelado por el cliente' } });
    expect((await firstValueFrom(new ReservationsApiSource(free.client).list()))[0].cancellation?.cause).toBe('Viaje cancelado por el cliente');
    const notAttributable = fakeClient({ ok: page([row]) }, { ok: { ...cancelled, cancellationCause: 'NOT_ATTRIBUTABLE_TO_CUSTOMER' } });
    expect((await firstValueFrom(new ReservationsApiSource(notAttributable.client).list()))[0].cancellation?.origin).toBe('not-attributable');
  });

  it('shows no cancellation when the service sends no cause, and no next action when it sends none', async () => {
    const { client } = fakeClient({ ok: page([row]) }, { ok: detail });
    const [one] = await firstValueFrom(new ReservationsApiSource(client).list());
    expect(one.cancellation).toBeUndefined();
    expect(one.continueAction).toBeUndefined();
  });

  it('reads the next action the service names', async () => {
    const { client } = fakeClient({ ok: page([row]) }, { ok: { ...detail, continueAction: 'PRESENT_NEW_RECEIPT' } });
    expect((await firstValueFrom(new ReservationsApiSource(client).list()))[0].continueAction).toBe('PRESENT_NEW_RECEIPT');
  });
});

const base: Pick<CustomerPaymentSummary, 'reservationStatus' | 'proofStatus' | 'balanceCents' | 'paymentMethod' | 'reschedulingPending' | 'continueAction'> = {
  reservationStatus: 'PENDING_PAYMENT', proofStatus: 'SIN_COMPROBANTE', balanceCents: 1000, paymentMethod: 'BANK_TRANSFER',
};

describe('paymentActionFollowsTheService', () => {
  it('uses the action of the service over its own rule when the service answers', () => {
    expect(paymentAction({ ...base, continueAction: 'NONE' })).toBeNull();
    expect(paymentAction({ ...base, continueAction: 'CONTINUE_PAYMENT' })).toBe('pay');
    expect(paymentAction({ ...base, proofStatus: 'SIN_COMPROBANTE', continueAction: 'PRESENT_NEW_RECEIPT' })).toBe('present');
  });

  it('keeps the rule of the screen when the service sends no action (demo)', () => {
    expect(paymentAction(base)).toBe('pay');
    expect(paymentAction({ ...base, proofStatus: 'RECHAZADO' })).toBe('present');
  });

  it('offers the action of the notice that the service names and none otherwise', () => {
    const notice = { reservationId: 'r-1', proofStatus: 'SIN_COMPROBANTE', reservationStatus: 'PENDING_PAYMENT', balanceCents: 1000 };
    expect(noticeLines({ ...notice, continueAction: 'NONE' }).map((l) => l.action)).toEqual([undefined]);
    expect(noticeLines({ ...notice, continueAction: 'CONTINUE_PAYMENT' }).map((l) => l.action)).toEqual(['pay']);
  });
});

describe('myPaymentsOverTheRealServiceShowsTheCause', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('carries the cause and the action of the service into the summary of Mis pagos', async () => {
    const client: PortalApiClient = {
      request: (async (path: string) => {
        if (path.startsWith(`${API_BASE}/reservations?`)) return page([row]);
        if (path.startsWith(`${API_BASE}/reservations/r-1/payments`)) return page([]);
        if (path === `${API_BASE}/reservations/r-1`) return cancelled;
        throw new Error(`unexpected ${path}`);
      }) as PortalApiClient['request'],
    };
    TestBed.configureTestingModule({ providers: sourceProviders(client) });
    const [one] = await firstValueFrom(TestBed.inject(MyPaymentsSource).listMine());
    expect(one).toMatchObject({ reservationStatus: 'CANCELLED', cancellationCause: 'Cancelada por falta de pago', continueAction: 'NONE' });
  });
});

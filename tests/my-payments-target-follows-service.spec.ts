import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { page } from './api-client.double';

// HU-COM-014 (AC-14.8, DD-2): "Continuar pago" of the panel follows the next action the service names; the portal keeps its own rule only for a
// source that does not answer it.
const row = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z' };
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3,
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, projectedValueCents: 5997, discounts: [], finalValueCents: 5997,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', pendingBalanceCents: 5997,
  seatHeld: false, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const clientOf = (over: object): PortalApiClient => ({
  request: (async (path: string) => {
    if (path.startsWith(`${API_BASE}/reservations?`)) return page([row]);
    if (path.startsWith(`${API_BASE}/reservations/r-1/payments`)) return page([]);
    if (path === `${API_BASE}/reservations/r-1`) return { ...detail, ...over };
    throw new Error(`unexpected ${path}`);
  }) as PortalApiClient['request'],
});
const target = (over: object) => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: sourceProviders(clientOf(over)) });
  return firstValueFrom(TestBed.inject(MyPaymentsSource).continuePaymentTarget());
};

describe('continuePaymentTargetFollowsTheService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers no continue payment when the service names no action to continue, even if its own rule would', async () => {
    expect(await target({ continueAction: 'NONE' })).toBeNull();
    expect(await target({ continueAction: 'PRESENT_NEW_RECEIPT' })).toBeNull();
  });

  it('offers the reservation the service names to continue, even when it is not pending payment', async () => {
    expect(await target({ reservationStatus: 'CONFIRMED', continueAction: 'CONTINUE_PAYMENT' })).toEqual({ reservationId: 'r-1', paymentType: 'PARTIAL', amountCents: 5997 });
  });

  it('keeps its own rule when the service names nothing', async () => {
    expect(await target({})).toEqual({ reservationId: 'r-1', paymentType: 'PARTIAL', amountCents: 5997 });
  });
});

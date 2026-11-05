import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { page } from './api-client.double';

// HU-COM-014 portal, DD-2 / DD-4 of the spec: "Mis pagos" over the real service. The default module (not the demo one) provides the read port
// of the economic state, composed over the reservations and the payments the service already serves; the portal computes nothing.
const row = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z' };
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 3,
  tourLine: { ratePerPersonCents: 1999, people: 3, amountCents: 5997 }, projectedValueCents: 5997, discounts: [], finalValueCents: 5997,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', pendingBalanceCents: 5997,
  seatHeld: false, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const newest = { paymentId: 'p-2', paymentMethod: 'TRANSFER', amountCents: 2000, validationStatus: 'REJECTED', registeredBy: 'u', registeredAt: '2026-10-31T10:00:00Z',
  decidedBy: 'op', decidedAt: '2026-10-31T11:00:00Z', decisionReason: 'Comprobante ilegible' };
const oldest = { paymentId: 'p-1', paymentMethod: 'TRANSFER', amountCents: 1000, validationStatus: 'IN_VALIDATION', registeredBy: 'u', registeredAt: '2026-10-30T10:00:00Z' };

const client: PortalApiClient = {
  request: (async (path: string) => {
    if (path.startsWith(`${API_BASE}/reservations?`)) return page([row]);
    if (path.startsWith(`${API_BASE}/reservations/r-1/payments`)) return page([newest, oldest]);
    if (path === `${API_BASE}/reservations/r-1`) return detail;
    throw new Error(`unexpected ${path}`);
  }) as PortalApiClient['request'],
};

describe('myPaymentsOverTheRealService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('provides the read port in the default module, with the state of the latest proof and the reason of a rejected receipt', async () => {
    TestBed.configureTestingModule({ providers: sourceProviders(client) });
    const mine = await firstValueFrom(TestBed.inject(MyPaymentsSource).listMine());
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ reservationId: 'r-1', tourName: 'Desierto de la Tatacoa', reservationStatus: 'PENDING_PAYMENT', paymentType: 'PARTIAL',
      paymentMethod: 'BANK_TRANSFER', proofStatus: 'RECHAZADO', balanceCents: 5997, validatedCents: 0 });
    expect(mine[0].receipts).toEqual([{ support: '', amountCents: 1000, status: 'EN_VALIDACION' },
      { support: '', amountCents: 2000, status: 'RECHAZADO', rejectionReason: 'Comprobante ilegible' }]);
  });

  it('names the notice and the reservation the customer continues, as the service shows them', async () => {
    TestBed.configureTestingModule({ providers: sourceProviders(client) });
    const source = TestBed.inject(MyPaymentsSource);
    expect((await firstValueFrom(source.notices())).map((n) => n.reservationId)).toEqual(['r-1']);
    expect(await firstValueFrom(source.continuePaymentTarget())).toEqual({ reservationId: 'r-1', paymentType: 'PARTIAL', amountCents: 5997 });
  });
});

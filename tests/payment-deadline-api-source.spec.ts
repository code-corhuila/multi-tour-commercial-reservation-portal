import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PaymentDeadlineApiReader } from '../src/app/http/payments-api-sources';
import { PaymentDeadlineReader } from '../src/app/payments/data/payment-followup-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient } from './api-client.double';

// HU-COM-008 (code-corhuila/multi-tour-docs#174), screens 21 and 24: the deadline line reads the deadline the service resolved
// (GET /reservations/{id}/payment-deadline, ReservationPaymentDeadline of the contract); the portal computes nothing.
const wire = {
  reservationId: 'r-1', kind: 'INITIAL', dueAt: '2026-11-10T09:00:00-05:00', departureStartsAt: '2026-11-12T06:30:00-05:00',
  effectiveDeadline: '2026-11-10T09:00:00-05:00', frozen: false,
};

describe('PaymentDeadlineApiReader', () => {
  it('reads the deadline of the reservation and hands the effective deadline with the departure start', async () => {
    const { client, calls } = fakeClient({ ok: wire });
    const deadline = await firstValueFrom(new PaymentDeadlineApiReader(client).deadlineOf('r-1'));
    expect(calls).toEqual([{ path: '/api/v1/commercial-reservation/reservations/r-1/payment-deadline' }]);
    expect(deadline).toEqual({ dueAt: '2026-11-10T09:00:00-05:00', departureStartsAt: '2026-11-12T06:30:00-05:00' });
  });

  it('uses the effective deadline, not the configured due instant, when the departure comes first', async () => {
    const { client } = fakeClient({ ok: { ...wire, dueAt: '2026-11-20T09:00:00-05:00', effectiveDeadline: '2026-11-12T06:30:00-05:00' } });
    const deadline = await firstValueFrom(new PaymentDeadlineApiReader(client).deadlineOf('r-1'));
    expect(deadline?.dueAt).toBe('2026-11-12T06:30:00-05:00');
  });

  it('answers null when the service does not know the reservation (404), so the line is not drawn', async () => {
    const { client } = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'No existe.' } });
    expect(await firstValueFrom(new PaymentDeadlineApiReader(client).deadlineOf('r-9'))).toBeNull();
  });

  it('lets every other failure reach the caller', async () => {
    const { client } = fakeClient({ fail: { status: 500, code: 'INTERNAL', message: 'Falló.' } });
    await expect(firstValueFrom(new PaymentDeadlineApiReader(client).deadlineOf('r-1'))).rejects.toMatchObject({ status: 500 });
  });
});

describe('the container build provides the deadline reader', () => {
  it('registers PaymentDeadlineReader over the client, so screens 21 and 24 draw the line outside the demo', () => {
    const provided = sourceProviders(fakeClient().client).map((p) => (p as { provide?: unknown }).provide);
    expect(provided).toContain(PaymentDeadlineReader);
  });
});

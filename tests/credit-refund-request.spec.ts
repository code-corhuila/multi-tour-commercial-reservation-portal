import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { CreditRefundApiRequester } from '../src/app/http/credit-balance-api-sources';
import { DemoCreditBalanceSource, DemoCreditRefundRequester } from '../src/app/demo/credit-balance-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { CreditBalance, CreditBalanceSource, CreditBalanceWriter, CreditRefundRequester } from '../src/app/credit-balance/data/credit-balance-ports';
import { CreditBalancePageComponent } from '../src/app/credit-balance/pages/credit-balance-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { fakeClient, page } from './api-client.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-017 AC-CB.10 and AC-CB.14: the operator registers a refund request of a customer's credit (admin-saldo-favor.html). Invented data only.
const NOW = '2026-10-14T10:00:00-05:00', ANA = 'Ana Prueba (demo)';
const line = (id: string, reservationId: string, amountCents: number): CreditBalance =>
  ({ id, reservationId, tenant: 'tenant-demo', amountCents, origin: 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: 'Administrador del tenant', recordedAt: '2026-10-13T09:00:00-05:00', appliedTo: null });
const fixtures = () => {
  const store = new DemoReservationsStore([reservationOf('RES-O1', { leadCustomerName: ANA, status: 'CANCELADA', balanceCents: 0 })]);
  store.creditBalances = [line('SAF-1', 'RES-O1', 30_000_000)];
  return store;
};
const demo = (role = 'TENANT_ADMINISTRATOR') => {
  const store = fixtures(), clock = new FixedClock(NOW), can = PortalCapabilities.for(role);
  return { store, source: new DemoCreditBalanceSource(store, clock), requester: new DemoCreditRefundRequester(store, clock, can, 'tenant-demo', new Map()) };
};

describe('refundRequestSetsTheAmountAsideAndStartsTheTwentyFourHours', () => {
  it('creates the request pending, sets the amount aside and lists it with its motive and who registered it', async () => {
    const d = demo();
    expect(await firstValueFrom(d.requester.request('RES-O1', 10_000_000, 'Solicitud del cliente por correo', 'k-1'))).toEqual({ ok: true, amountCents: 10_000_000 });
    const overview = await firstValueFrom(d.source.list());
    expect(overview.pendingDecisions).toBe(1);
    expect(overview.customers[0].sources[0]).toMatchObject({ requestedCents: 10_000_000, availableCents: 20_000_000 });
    expect(overview.requests).toEqual([expect.objectContaining({ reservationId: 'RES-O1', amountCents: 10_000_000, state: 'PENDIENTE_DE_AUTORIZACION', reason: 'Solicitud del cliente por correo',
      requestedBy: 'Administrador del tenant', decisionDueAt: '2026-10-15T10:00:00-05:00' })]);
  });

  it('answers a repeated key once', async () => {
    const d = demo();
    await firstValueFrom(d.requester.request('RES-O1', 10_000_000, 'Motivo', 'k-1'));
    await firstValueFrom(d.requester.request('RES-O1', 10_000_000, 'Motivo', 'k-1'));
    expect(d.store.creditRequests).toHaveLength(1);
  });
});

describe('refundRequestWithoutReasonOrAboveAvailableIsRefused', () => {
  it('refuses with the text of the mockup and records nothing', async () => {
    const d = demo(), ask = (cents: number, motive: string, key: string) => firstValueFrom(d.requester.request('RES-O1', cents, motive, key));
    expect(await ask(0, 'Motivo', 'a')).toEqual({ ok: false, reason: 'Indica un monto mayor a cero.' });
    expect(await ask(30_000_001, 'Motivo', 'b')).toEqual({ ok: false, reason: 'El monto supera el saldo disponible de la reserva de origen ($300.000).' });
    expect(await ask(1_000_000, '  ', 'c')).toEqual({ ok: false, reason: 'Registra el motivo o la referencia de la solicitud del cliente.' });
    expect(await firstValueFrom(d.requester.request('RES-ZZ', 1_000_000, 'Motivo', 'd'))).toEqual({ ok: false, reason: 'No se encontró la reserva de origen del saldo.' });
    expect(d.store.creditRequests).toEqual([]);
  });

  it('refuses a role without the capability with 403 and grants it to the Administrator and the Collaborator only', async () => {
    await expect(firstValueFrom(demo('ANALYST').requester.request('RES-O1', 1_000_000, 'Motivo', 'k'))).rejects.toMatchObject({ status: 403 });
    const roles = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY', 'SOMETHING_ELSE'];
    expect(roles.map((r) => PortalCapabilities.for(r).canRequestCreditRefund())).toEqual([true, true, false, false, false, false, false]);
  });
});

async function screen(role = 'TENANT_ADMINISTRATOR') {
  const d = demo(role), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: CreditBalanceSource, useValue: d.source },
    { provide: CreditBalanceWriter, useValue: {} }, { provide: CreditRefundRequester, useValue: d.requester }, { provide: IdempotencyKeys, useValue: keys }] as Provider[] });
  const fixture = TestBed.createComponent(CreditBalancePageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const type = async (selector: string, value: string) => { const i = host.querySelector<HTMLInputElement>(selector)!; i.value = value; i.dispatchEvent(new Event('input')); await settle(); };
  return { ...d, host, settle, button, type };
}

describe('theRefundRequestFormOfTheCreditScreen', () => {
  it('opens the form of an origin with its available amount and registers the request', async () => {
    const s = await screen();
    expect(s.host.querySelector('[data-credit-refund-form]')).toBeNull();
    s.button('Solicitar devolución')!.click();
    await s.settle();
    expect(s.host.querySelector<HTMLInputElement>('[data-credit-refund-amount]')!.value).toBe('300000');
    expect(s.host.querySelector('[data-credit-refund-form]')!.textContent).toContain('Motivo o referencia del cliente');
    await s.type('[data-credit-refund-amount]', '100000');
    await s.type('[data-credit-refund-motive]', 'Solicitud del cliente por correo');
    s.button('Registrar solicitud')!.click();
    await s.settle();
    expect(s.store.creditRequests).toEqual([expect.objectContaining({ amountCents: 10_000_000, reason: 'Solicitud del cliente por correo' })]);
    expect(s.host.querySelector('[data-credit-requests]')!.textContent).toContain('Pendiente de autorización');
    expect(s.host.querySelector('[data-credit-feedback]')!.textContent).toContain(CREDIT_REFUND_OK);
  });

  it('shows the refusal in the form and focuses nothing else', async () => {
    const s = await screen();
    s.button('Solicitar devolución')!.click();
    await s.settle();
    s.button('Registrar solicitud')!.click();
    await s.settle();
    expect(s.host.querySelector('[data-credit-refund-form] [role="alert"]')?.textContent).toContain('Registra el motivo o la referencia de la solicitud del cliente.');
  });

  it('draws no button for a role that cannot request', async () => {
    const s = await screen('ANALYST');
    expect(s.button('Solicitar devolución')).toBeUndefined();
    expect(s.host.querySelector('[data-credit-refund-form]')).toBeNull();
  });
});
const CREDIT_REFUND_OK = 'Solicitud de devolución registrada';

describe('creditRefundRequestOverTheApiClient', () => {
  const credit = (id: string, source: string, available: number) => ({ creditBalanceId: id, sourceReservationId: source, customerId: 'cu-1', origin: 'CUSTOMER_CANCELLATION',
    recordedCents: available, appliedCents: 0, inRefundCents: 0, availableCents: available, recordedAt: '2026-11-01T10:00:00Z' });

  it('posts the amount and the reason of the staff to the credit of the origin with the key', async () => {
    const { client, calls } = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { ok: {} });
    expect(await firstValueFrom(new CreditRefundApiRequester(client).request('r-1', 10000, 'Por correo', 'key-1'))).toEqual({ ok: true, amountCents: 10000 });
    expect(calls[1]).toEqual({ path: `${API_BASE}/credit-balances/c-1/refund-requests`, method: 'POST', body: { amountCents: 10000, reason: 'Por correo' }, headers: { 'Idempotency-Key': 'key-1' } });
  });

  it('hands the refusal of the service as data and any other failure on', async () => {
    const refused = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'El monto supera el saldo.', traceId: 't' } });
    expect(await firstValueFrom(new CreditRefundApiRequester(refused.client).request('r-1', 99999, 'x', 'k'))).toEqual({ ok: false, reason: 'El monto supera el saldo.' });
    const down = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { fail: { status: 403, code: 'FORBIDDEN', message: 'no', traceId: 't' } });
    await expect(firstValueFrom(new CreditRefundApiRequester(down.client).request('r-1', 1, 'x', 'k'))).rejects.toMatchObject({ status: 403 });
  });
});

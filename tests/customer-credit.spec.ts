import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { CustomerCreditApiSource, CustomerCreditApiWriter } from '../src/app/http/customer-credit-api-sources';
import { CustomerCreditSource, CustomerCreditWriter } from '../src/app/credit-balance/data/customer-credit-ports';
import { CUSTOMER_CREDIT_COPY } from '../src/app/credit-balance/customer-credit-copy';
import { CustomerCreditPanelComponent } from '../src/app/credit-balance/components/customer-credit-panel.component';
import { CustomerCreditNoticeComponent } from '../src/app/credit-balance/components/customer-credit-notice.component';
import { DemoCustomerCreditSource, DemoCustomerCreditWriter } from '../src/app/demo/customer-credit-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { CreditBalance } from '../src/app/credit-balance/data/credit-balance-ports';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { CUSTOMER_CREDIT_CONTRIBUTIONS } from '../src/app/credit-balance/components/customer-credit-panel.component';
import { MyPaymentsPageComponent } from '../src/app/my-payments/pages/my-payments-page.component';
import { MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { fakeClient, page } from './api-client.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-017 customer side (AC-CB.13, DP-CB6 PROPUESTO yes): 17B shows only the own credit, requests its refund and lists the requests. Invented data only.
const NOW = '2026-10-14T10:00:00-05:00';
const line = (id: string, reservationId: string, amountCents: number): CreditBalance =>
  ({ id, reservationId, tenant: 'tenant-demo', amountCents, origin: 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: 'Administrador del tenant', recordedAt: '2026-10-13T09:00:00-05:00', appliedTo: null });
const own = (...ids: string[]): MyReservationsSource => ({ listMine: () => of(ids.map((reservationId) => ({ reservationId }))) } as unknown as MyReservationsSource);
/** Ana owns RES-O1 (credit $300.000); Beto owns RES-X1 (credit $50.000), which Ana must never read. */
const fixtures = () => {
  const store = new DemoReservationsStore([
    reservationOf('RES-O1', { leadCustomerName: 'Ana Prueba (demo)', status: 'CANCELADA', balanceCents: 0 }),
    reservationOf('RES-X1', { leadCustomerName: 'Beto Prueba (demo)', status: 'CANCELADA', balanceCents: 0 }),
  ]);
  store.creditBalances = [line('SAF-1', 'RES-O1', 30_000_000), line('SAF-2', 'RES-X1', 5_000_000)];
  return store;
};
const demo = (store = fixtures(), mine = own('RES-O1')) => {
  const clock = new FixedClock(NOW), answered = new Map();
  return { store, source: new DemoCustomerCreditSource(store, mine, clock), writer: new DemoCustomerCreditWriter(store, mine, clock, answered) };
};
const read = (source: CustomerCreditSource) => firstValueFrom(source.mine());

describe('myPaymentsShowsOnlyTheOwnCreditAndRequestsItsRefund', () => {
  it('reads only the credit of the own reservations', async () => {
    const credit = await read(demo().source);
    expect(credit.totalCents).toBe(30_000_000);
    expect(credit.sources).toEqual([{ reservationId: 'RES-O1', availableCents: 30_000_000 }]);
    expect(credit.requests).toEqual([]);
  });

  it('refundRequestSetsTheAmountAsideAndLetsTheDecisionWait', async () => {
    const d = demo();
    const request = await firstValueFrom(d.writer.requestRefund('RES-O1', 30_000_000, 'k-1'));
    expect(request).toMatchObject({ reservationId: 'RES-O1', amountCents: 30_000_000, state: 'PENDIENTE_DE_AUTORIZACION' });
    const credit = await read(d.source);
    expect(credit.totalCents).toBe(0);
    expect(credit.requests).toEqual([expect.objectContaining({ reservationId: 'RES-O1', amountCents: 30_000_000, state: 'PENDIENTE_DE_AUTORIZACION', requestedAt: NOW })]);
    expect(d.store.creditRequests).toEqual([expect.objectContaining({ reservationId: 'RES-O1', requestedBy: 'Cliente', decisionDueAt: '2026-10-15T10:00:00-05:00' })]);
  });

  it('a repeated key answers the stored request and records no second one', async () => {
    const d = demo();
    const first = await firstValueFrom(d.writer.requestRefund('RES-O1', 30_000_000, 'k-1'));
    const again = await firstValueFrom(d.writer.requestRefund('RES-O1', 30_000_000, 'k-1'));
    expect(again).toEqual(first);
    expect(d.store.creditRequests).toHaveLength(1);
  });

  it('refuses a credit that is not the own, an amount of zero and an amount above the available', async () => {
    const d = demo();
    await expect(firstValueFrom(d.writer.requestRefund('RES-X1', 5_000_000, 'k-2'))).rejects.toMatchObject({ status: 404 });
    await expect(firstValueFrom(d.writer.requestRefund('RES-O1', 0, 'k-3'))).rejects.toMatchObject({ status: 422 });
    await expect(firstValueFrom(d.writer.requestRefund('RES-O1', 30_000_001, 'k-4'))).rejects.toMatchObject({ status: 422 });
    expect(d.store.creditRequests).toEqual([]);
  });
});

async function screen(withCredit = true) {
  const d = demo(withCredit ? fixtures() : new DemoReservationsStore([reservationOf('RES-O1', { leadCustomerName: 'Ana Prueba (demo)' })]));
  const keys = new ControllableIdempotencyKeys(), navigation = new PortalNavigation();
  navigation.register([CLIENT_AREA.tours, CLIENT_AREA.payments]);
  TestBed.configureTestingModule({ providers: [{ provide: CustomerCreditSource, useValue: d.source }, { provide: CustomerCreditWriter, useValue: d.writer },
    { provide: IdempotencyKeys, useValue: keys }, { provide: PortalNavigation, useValue: navigation }] as Provider[] });
  const fixture = TestBed.createComponent(CustomerCreditPanelComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const flat = (e: Element) => e.textContent?.replace(/\s+/g, ' ').trim();
  return { ...d, host, settle, button, navigation, flat };
}

describe('theCustomerCreditPanelOfMyPayments', () => {
  it('writes the available credit with its origin, the notice and the two actions as the mockup', async () => {
    const s = await screen();
    const block = s.host.querySelector('[data-credit-source]')!;
    expect(s.flat(block)).toContain('Saldo a favor disponible: $300.000 (origen: reserva RES-O1).');
    expect(s.flat(block)).toContain('No vence en Fase 1. Puedes aplicarlo total o parcialmente a una reserva nueva del mismo operador desde el paso de pago, o solicitar su devolución.');
    expect(s.button('Solicitar devolución')).toBeTruthy();
    expect(s.host.textContent).not.toContain('RES-X1');
    s.host.querySelector<HTMLElement>('[data-credit-apply-link]')!.click();
    expect(s.navigation.selected()).toBe(CLIENT_AREA.tours);
  });

  it('writes the empty text when the customer has no credit and no request', async () => {
    const s = await screen(false);
    expect(s.flat(s.host)).toBe(CUSTOMER_CREDIT_COPY.empty);
    expect(CUSTOMER_CREDIT_COPY.empty).toBe('No tienes saldo a favor. Si una modificación, cancelación o pago validado genera un excedente a tu favor, aparecerá aquí.');
  });

  it('requests the refund of the origin with one key, lists the request with the 24-hour notice and sets the credit aside', async () => {
    const s = await screen();
    s.button('Solicitar devolución')!.click();
    await s.settle();
    expect(s.store.creditRequests).toHaveLength(1);
    expect(s.host.querySelector('[data-credit-source]')).toBeNull();
    const list = s.host.querySelector('[data-credit-requests]')!;
    expect(s.flat(list)).toContain('Solicitudes de devolución de saldo a favor');
    expect(s.flat(list)).toContain('RES-O1 · $300.000 · Pendiente de autorización (solicitada el 14 oct 2026)');
    expect(s.flat(list)).toContain('El Administrador del tenant tiene 24 horas corridas para autorizar o rechazar de forma justificada; sin decisión, Multitour autoriza la devolución por el monto solicitado.');
  });

  it('says so and keeps the credit when the request fails', async () => {
    const s = await screen();
    s.store.creditBalances = [];
    s.button('Solicitar devolución')!.click();
    await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe(CUSTOMER_CREDIT_COPY.failed);
  });
});

describe('thePanelIsDrawnInMyPaymentsByItsSlot', () => {
  const summary = { reservationId: 'RES-O1', tourName: 'Tour', departureAt: '2026-11-07', reservationStatus: 'CANCELLED', paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER', proofStatus: 'SIN_COMPROBANTE',
    financialStatus: null, validatedCents: 0, balanceCents: 0, creditBalanceCents: 0 };
  const page = async (withSlot: boolean) => {
    const d = demo();
    TestBed.configureTestingModule({ providers: [{ provide: MyPaymentsSource, useValue: { listMine: () => of([summary]) } }, { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) },
      { provide: CustomerCreditSource, useValue: d.source }, { provide: CustomerCreditWriter, useValue: d.writer }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
      ...(withSlot ? CUSTOMER_CREDIT_CONTRIBUTIONS : [])] as Provider[] });
    const fixture = TestBed.createComponent(MyPaymentsPageComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  };

  it('draws the own credit and the request button instead of the read-only line', async () => {
    const text = await page(true);
    expect(text).toContain('Saldo a favor disponible: $300.000 (origen: reserva RES-O1).');
    expect(text).toContain('Solicitar devolución');
    expect(text).not.toContain('No tienes saldo a favor');
  });

  it('keeps the read-only line of the page when the build supplies no panel', async () => {
    expect(await page(false)).toContain('No tienes saldo a favor');
  });
});

describe('theNoticeOfThePanelOpensTheCreditPanel', () => {
  it('writes the notice of 17 with the amount and opens Mis pagos on the credit', async () => {
    const d = demo(), navigation = new PortalNavigation();
    navigation.register([CLIENT_AREA.payments]);
    TestBed.configureTestingModule({ providers: [{ provide: CustomerCreditSource, useValue: d.source }, { provide: PortalNavigation, useValue: navigation }] as Provider[] });
    const fixture = TestBed.createComponent(CustomerCreditNoticeComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent.replace(/\s+/g, ' ')).toContain('tienes un saldo a favor de $300.000.');
    Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Consultar saldo a favor')!.click();
    expect(navigation.selected()).toBe(CLIENT_AREA.payments);
  });
});

describe('customerCreditOverTheApiClient', () => {
  const credit = (id: string, source: string, recorded: number, inRefund = 0) => ({ creditBalanceId: id, sourceReservationId: source, customerId: 'cu-1', origin: 'CUSTOMER_CANCELLATION',
    recordedCents: recorded, appliedCents: 0, inRefundCents: inRefund, availableCents: recorded - inRefund, recordedAt: '2026-11-01T10:00:00Z' });
  const detail = { ...credit('c-2', 'r-2', 20000, 20000), applications: [], refundRequests: [{ financialDecisionId: 'd-1', amountCents: 20000, requestedAt: '2026-11-04T10:00:00Z' },
    { financialDecisionId: 'd-0', amountCents: 5000, requestedAt: '2026-11-02T10:00:00Z', outcome: 'REJECTED' }] };

  it('reads the own credits and the requests of the credits that have one, with no figure of its own', async () => {
    const { client, calls } = fakeClient({ ok: page([credit('c-1', 'r-1', 30000), credit('c-2', 'r-2', 20000, 20000)]) }, { ok: detail });
    const mine = await firstValueFrom(new CustomerCreditApiSource(client).mine());
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/credit-balances?page=1&limit=100`, `${API_BASE}/credit-balances/c-2`]);
    expect(mine.totalCents).toBe(30000);
    expect(mine.sources).toEqual([{ reservationId: 'r-1', availableCents: 30000 }]);
    expect(mine.requests).toEqual([expect.objectContaining({ id: 'd-1', reservationId: 'r-2', amountCents: 20000, state: 'PENDIENTE_DE_AUTORIZACION', requestedAt: '2026-11-04T10:00:00Z' }),
      expect.objectContaining({ id: 'd-0', state: 'RECHAZADA' })]);
  });

  it('posts the refund request of the credit of the origin reservation with the key and the amount only', async () => {
    const decision = { financialDecisionId: 'd-9', reservationId: 'r-1', kind: 'CREDIT_BALANCE_REFUND_REQUEST', baseAmountCents: 30000, recognizedAt: '2026-11-05T10:00:00Z', decisionDueAt: '2026-11-06T10:00:00Z', frozen: false };
    const { client, calls } = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { ok: decision });
    const request = await firstValueFrom(new CustomerCreditApiWriter(client).requestRefund('r-1', 30000, 'key-1'));
    expect(calls[1]).toEqual({ path: `${API_BASE}/credit-balances/c-1/refund-requests`, method: 'POST', body: { amountCents: 30000 }, headers: { 'Idempotency-Key': 'key-1' } });
    expect(request).toMatchObject({ id: 'd-9', reservationId: 'r-1', amountCents: 30000, state: 'PENDIENTE_DE_AUTORIZACION' });
  });

  it('hands the refusal of the service on', async () => {
    const { client } = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'refused', traceId: 't' } });
    await expect(firstValueFrom(new CustomerCreditApiWriter(client).requestRefund('r-1', 30000, 'key-2'))).rejects.toMatchObject({ status: 422 });
  });
});

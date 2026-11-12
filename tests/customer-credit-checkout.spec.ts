import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { CustomerCreditApiWriter } from '../src/app/http/customer-credit-api-sources';
import { CustomerCreditSource, CustomerCreditWriter } from '../src/app/credit-balance/data/customer-credit-ports';
import { CUSTOMER_CREDIT_COPY } from '../src/app/credit-balance/customer-credit-copy';
import { CustomerCreditCheckoutComponent, CUSTOMER_CREDIT_CHECKOUT } from '../src/app/credit-balance/components/customer-credit-checkout.component';
import { DemoCustomerCreditSource, DemoCustomerCreditWriter } from '../src/app/demo/customer-credit-demo';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { CreditBalance } from '../src/app/credit-balance/data/credit-balance-ports';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { CHECKOUT_BLOCKS, CONTINUE_PAYMENT_BLOCKS } from '../src/app/shared/portal-slots';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { fakeClient, page } from './api-client.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-017 AC-CB.12 (DP-CB6 PROPUESTO yes): the box of 21 applies the own credit, as a validated payment without proof, to the reservation (new or existing). Invented data only.
const NOW = '2026-10-14T10:00:00-05:00';
const line = (id: string, reservationId: string, amountCents: number): CreditBalance =>
  ({ id, reservationId, tenant: 'tenant-demo', amountCents, origin: 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: 'Administrador del tenant', recordedAt: '2026-10-13T09:00:00-05:00', appliedTo: null });
const own = (...ids: string[]): MyReservationsSource => ({ listMine: () => of(ids.map((reservationId) => ({ reservationId }))) } as unknown as MyReservationsSource);
/** Ana owns RES-O1 (credit $300.000) and RES-T1 (owes $200.000 on dep-1); RES-X1 is Beto's. */
const fixtures = (withCredit = true) => {
  const store = new DemoReservationsStore([
    reservationOf('RES-O1', { leadCustomerName: 'Ana Prueba (demo)', status: 'CANCELADA', balanceCents: 0, validatedCents: 30_000_000 }),
    reservationOf('RES-T1', { leadCustomerName: 'Ana Prueba (demo)', departureId: 'demo-dep-1', departureDate: '2026-11-07', balanceCents: 20_000_000, validatedCents: 0 }),
    reservationOf('RES-X1', { leadCustomerName: 'Beto Prueba (demo)', departureId: 'demo-dep-1', departureDate: '2026-11-07', balanceCents: 1_000_000 }),
  ]);
  if (withCredit) store.creditBalances = [line('SAF-1', 'RES-O1', 30_000_000)];
  return store;
};
const demo = (store = fixtures()) => {
  const clock = new FixedClock(NOW), mine = own('RES-O1', 'RES-T1');
  return { store, source: new DemoCustomerCreditSource(store, mine, clock), writer: new DemoCustomerCreditWriter(store, mine, clock, new Map(), new DemoDeparturesStore()) };
};

describe('ownCreditAppliedToAReservation', () => {
  it('applies the least of the available credit and the pending balance as a validated payment without proof', async () => {
    const d = demo();
    const outcome = await firstValueFrom(d.writer.apply('RES-T1', 'k-1'));
    expect(outcome).toEqual({ ok: true, appliedCents: 20_000_000, firstPayment: true });
    expect(d.store.items.find((r) => r.id === 'RES-T1')).toMatchObject({ balanceCents: 0, validatedCents: 20_000_000, seatHeld: true });
    expect((await firstValueFrom(d.source.mine())).totalCents).toBe(10_000_000);
    expect(d.store.creditApplications).toEqual([expect.objectContaining({ sourceId: 'RES-O1', targetId: 'RES-T1', amountCents: 20_000_000, actor: 'Cliente' })]);
  });

  it('answers a repeated key once and never touches a reservation that is not the own', async () => {
    const d = demo();
    await firstValueFrom(d.writer.apply('RES-T1', 'k-1'));
    expect(await firstValueFrom(d.writer.apply('RES-T1', 'k-1'))).toMatchObject({ ok: true, appliedCents: 20_000_000 });
    expect(d.store.creditApplications).toHaveLength(1);
    await expect(firstValueFrom(d.writer.apply('RES-X1', 'k-2'))).rejects.toMatchObject({ status: 404 });
  });

  it('hands a business refusal on as data with the text of the port', async () => {
    const d = demo();
    d.store.items = d.store.items.map((r) => (r.id === 'RES-T1' ? { ...r, status: 'CANCELADA' as const } : r));
    expect(await firstValueFrom(d.writer.apply('RES-T1', 'k-3'))).toMatchObject({ ok: false, reason: expect.stringContaining('no admite pagos nuevos') });
  });
});

async function box(options: { existing?: boolean; reservation?: string | null; credit?: boolean } = {}) {
  const d = demo(fixtures(options.credit ?? true)), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: CustomerCreditSource, useValue: d.source }, { provide: CustomerCreditWriter, useValue: d.writer }, { provide: IdempotencyKeys, useValue: keys }] as Provider[] });
  const fixture = TestBed.createComponent(CustomerCreditCheckoutComponent);
  fixture.componentRef.setInput('existing', options.existing ?? false);
  fixture.componentRef.setInput('reservation', options.reservation ? { reservationId: options.reservation } : null);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const flat = () => host.textContent?.replace(/\s+/g, ' ').trim();
  const tick = async () => { const c = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; c.checked = true; c.dispatchEvent(new Event('change')); await settle(); };
  return { ...d, fixture, host, settle, flat, tick };
}

describe('checkoutBoxAppliesTheCreditToANewAndToAnExistingReservation', () => {
  it('draws nothing when the customer has no credit', async () => {
    const b = await box({ credit: false });
    expect(b.host.querySelector('input')).toBeNull();
  });

  it('writes the label of a new reservation and applies nothing until the reservation exists', async () => {
    const b = await box();
    expect(b.flat()).toContain('Aplicar mi saldo a favor disponible ($300.000) como pago de esta reserva. El valor aplicado cuenta como pago validado.');
    await b.tick();
    expect(b.store.creditApplications).toEqual([]);
    b.fixture.componentRef.setInput('reservation', { reservationId: 'RES-T1' });
    await b.settle();
    expect(b.store.creditApplications).toHaveLength(1);
    expect(b.flat()).toContain('Saldo a favor aplicado: $200.000 como pago validado de RES-T1; el cupo quedó apartado en la misma operación.');
  });

  it('writes the label of an existing reservation and applies it when ticked', async () => {
    const b = await box({ existing: true, reservation: 'RES-T1' });
    expect(b.flat()).toContain('Aplicar mi saldo a favor disponible ($300.000) al saldo pendiente de esta reserva. El valor aplicado cuenta como pago validado, sin comprobante.');
    await b.tick();
    expect(b.store.items.find((r) => r.id === 'RES-T1')?.balanceCents).toBe(0);
  });

  it('shows the refusal of the port', async () => {
    const b = await box({ existing: true, reservation: 'RES-T1' });
    b.store.items = b.store.items.map((r) => (r.id === 'RES-T1' ? { ...r, status: 'FINALIZADA' as const } : r));
    await b.tick();
    expect(b.host.querySelector('[role="alert"]')?.textContent).toContain('no admite pagos nuevos');
  });

  it('is contributed to the checkout and to the continue-payment slots', () => {
    const tokens = CUSTOMER_CREDIT_CHECKOUT.map((p) => (p as { provide: unknown }).provide);
    expect(tokens).toEqual([CHECKOUT_BLOCKS, CONTINUE_PAYMENT_BLOCKS]);
    expect(CUSTOMER_CREDIT_COPY.checkoutNew('$1')).toContain('como pago de esta reserva');
  });
});

describe('customerCreditApplyOverTheApiClient', () => {
  const credit = (id: string, source: string, available: number) => ({ creditBalanceId: id, sourceReservationId: source, customerId: 'cu-1', origin: 'CUSTOMER_CANCELLATION',
    recordedCents: available, appliedCents: 0, inRefundCents: 0, availableCents: available, recordedAt: '2026-11-01T10:00:00Z' });
  const payments = (balance: number, validated = 0) => ({ listMine: () => of([{ reservationId: 'r-9', balanceCents: balance, validatedCents: validated }]) } as unknown as MyPaymentsSource);

  it('applies credit by credit up to the pending balance, with a key per credit', async () => {
    const { client, calls } = fakeClient({ ok: page([credit('c-1', 'r-1', 30000), credit('c-2', 'r-2', 20000)]) }, { ok: {} }, { ok: {} });
    const outcome = await firstValueFrom(new CustomerCreditApiWriter(client, payments(40000)).apply('r-9', 'key-1'));
    expect(outcome).toEqual({ ok: true, appliedCents: 40000, firstPayment: true });
    expect(calls.slice(1)).toEqual([
      { path: `${API_BASE}/credit-balances/c-1/applications`, method: 'POST', body: { targetReservationId: 'r-9', amountCents: 30000 }, headers: { 'Idempotency-Key': 'key-1-1' } },
      { path: `${API_BASE}/credit-balances/c-2/applications`, method: 'POST', body: { targetReservationId: 'r-9', amountCents: 10000 }, headers: { 'Idempotency-Key': 'key-1-2' } }]);
  });

  it('hands the refusal of the service as data and any other failure on', async () => {
    const refused = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message: 'La salida ya inició.', traceId: 't' } });
    expect(await firstValueFrom(new CustomerCreditApiWriter(refused.client, payments(10000)).apply('r-9', 'k'))).toEqual({ ok: false, reason: 'La salida ya inició.' });
    const down = fakeClient({ ok: page([credit('c-1', 'r-1', 30000)]) }, { fail: { status: 500, code: 'X', message: 'x', traceId: 't' } });
    await expect(firstValueFrom(new CustomerCreditApiWriter(down.client, payments(10000)).apply('r-9', 'k'))).rejects.toMatchObject({ status: 500 });
  });
});

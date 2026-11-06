import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { PaymentMethodsApiSource, PaymentsApiWriter, ReservationsWithPaymentsApiSource } from '../src/app/http/payments-api-sources';
import { ReservationsApiSource } from '../src/app/http/reservations-api-sources';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-009 over the contract (PROPOSED routes): the types and methods come from the parameter rows, a payment is a child of the reservation,
// a transfer travels as multipart (JSON part `payment` + binary part `proof`) and a cash payment as JSON. The user and the tenant are the token's.
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 2,
  tourLine: { ratePerPersonCents: 5000, people: 2, amountCents: 10000 }, projectedValueCents: 10000, discounts: [], finalValueCents: 10000,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', pendingBalanceCents: 10000, seatHeld: true, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const summary = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z',
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 10000 };
const attempt = (extra: object = {}) => ({ paymentId: 'p-1', reservationId: 'r-1', paymentMethod: 'TRANSFER', amountCents: 4000, validationStatus: 'IN_VALIDATION', registeredBy: 'u-1',
  registeredAt: '2026-11-01T10:00:00Z', reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 10000, seatHeld: true, ...extra });
const rows = [
  { paymentType: 'FULL_PAYMENT', initialWaitHours: 72, additionalWaitHours: 24, transferEnabled: true, cashEnabled: false, changedBy: 'u-1', changeReason: 'x', changedAt: '2026-10-01T00:00:00Z' },
  { paymentType: 'DEPOSIT', initialWaitHours: 48, additionalWaitHours: 24, minimumDepositBp: 3000, balanceDeadlineAdvanceHours: 24, transferEnabled: true, cashEnabled: true, changedBy: 'u-1', changeReason: 'x', changedAt: '2026-10-01T00:00:00Z' },
];
const textOf = (blob: Blob) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
const proof = new File(['%PDF-1'], 'comprobante.pdf', { type: 'application/pdf' });

describe('paymentMethodsOverTheApiClient', () => {
  it('offers the types and the methods the parameter rows enable, with the codes and labels the screens know', async () => {
    const { client, calls } = fakeClient({ ok: page(rows) }, { ok: page(rows) });
    const source = new PaymentMethodsApiSource(client);
    expect(await firstValueFrom(source.listTypes())).toEqual([{ code: 'TOTAL', label: 'Pago total' }, { code: 'PARTIAL', label: 'Abono' }]);
    expect(await firstValueFrom(source.listEnabled())).toEqual([{ code: 'BANK_TRANSFER', label: 'Transferencia' }, { code: 'CASH_AT_OFFICE', label: 'Efectivo' }]);
    expect(calls[0]).toEqual({ path: `${API_BASE}/payment-parameters?page=1&limit=100` });
  });

  it('offers nothing when the tenant has no parameter row, and does not make the bank account up (not served, DP-06)', async () => {
    const { client } = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new PaymentMethodsApiSource(client).listEnabled())).toEqual([]);
    expect(await firstValueFrom(new PaymentMethodsApiSource(client).bankAccount()).catch((e) => e)).toMatchObject({ code: 'NOT_IN_CONTRACT' });
  });
});

describe('paymentsWriterOverTheApiClient', () => {
  it('registers a transfer as multipart: the JSON part payment and the binary part proof, under the Idempotency-Key, with no user or tenant', async () => {
    const { client, calls } = fakeClient({ ok: attempt() }, { ok: detail }, { ok: page([summary]) }, { ok: page([attempt()]) });
    await firstValueFrom(new PaymentsApiWriter(client).register({ reservationId: 'r-1', amountCents: 4000, proof }, 'key-12345678'));
    expect(calls[0].path).toBe(`${API_BASE}/reservations/r-1/payments`);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers).toEqual({ 'Idempotency-Key': 'key-12345678' });
    const form = calls[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([form.has('payment'), form.has('proof')]).toEqual([true, true]);
    expect(JSON.parse(await textOf(form.get('payment') as Blob))).toEqual({ paymentMethod: 'TRANSFER', amountCents: 4000 });
    expect((form.get('proof') as File).name).toBe('comprobante.pdf');
  });

  it('registers cash as JSON with no file, and answers the reservation read again with its payments', async () => {
    const cash = attempt({ paymentMethod: 'CASH', validationStatus: undefined });
    const { client, calls } = fakeClient({ ok: cash }, { ok: { ...detail, paymentMethod: 'CASH' } }, { ok: page([summary]) }, { ok: page([cash]) });
    const saved = await firstValueFrom(new PaymentsApiWriter(client).register({ reservationId: 'r-1', amountCents: 4000, proof: null }, 'key-12345678'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations/r-1/payments`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' }, body: { paymentMethod: 'CASH', amountCents: 4000 } });
    expect(saved).toMatchObject({ id: 'r-1', tourName: 'Desierto de la Tatacoa', payments: [{ id: 'p-1', method: 'CASH_AT_OFFICE', amountCents: 4000, proofStatus: 'SIN_COMPROBANTE' }] });
  });
});

describe('reservationsWithPaymentsOverTheApiClient', () => {
  it('reads the payments of each reservation, oldest first, with the proof state in the words of the screens and the decision when there is one', async () => {
    const decided = attempt({ paymentId: 'p-2', validationStatus: 'REJECTED', decidedBy: 'u-2', decidedAt: '2026-11-01T12:00:00Z', decisionReason: 'Ilegible' });
    const { client, calls } = fakeClient({ ok: page([summary]) }, { ok: detail }, { ok: page([attempt(), decided]) });
    const [one] = await firstValueFrom(new ReservationsWithPaymentsApiSource(client).list());
    expect(calls[2]).toEqual({ path: `${API_BASE}/reservations/r-1/payments?page=1&limit=100` });
    expect(one.payments?.map((p) => [p.id, p.proofStatus])).toEqual([['p-2', 'RECHAZADO'], ['p-1', 'EN_VALIDACION']]);
    expect(one.payments?.[0].review).toMatchObject({ decision: 'RECHAZADO', reason: 'Ilegible', decidedAt: '2026-11-01T12:00:00Z' });
  });
});

describe('sourceProvidersOfThePayments', () => {
  it('provides the methods, the writer and the reservations with their payments over the container client', () => {
    const injector = Injector.create({ providers: sourceProviders(fakeClient().client) });
    expect(injector.get(PaymentMethodsSource)).toBeInstanceOf(PaymentMethodsApiSource);
    expect(injector.get(PaymentsWriter)).toBeInstanceOf(PaymentsApiWriter);
    expect(injector.get(ReservationsSource)).toBeInstanceOf(ReservationsApiSource);
    expect(injector.get(ReservationsSource)).toBeInstanceOf(ReservationsWithPaymentsApiSource);
  });
});

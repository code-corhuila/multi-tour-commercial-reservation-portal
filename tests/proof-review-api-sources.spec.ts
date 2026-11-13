import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { PendingProofsApiSource, ProofReviewApiWriter } from '../src/app/http/proof-review-api-sources';
import { PendingProofsSource, ProofReviewWriter } from '../src/app/payments/data/proof-review-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-010 over the contract (PROPOSED routes): the panel lists the proofs by status. A rejection is one POST per proof under an
// Idempotency-Key and stays inside the service; an approval starts the saga register-payment (DP-11, answer of Jhon 2026-10-30): Cash
// records the income first and step 2 applies the amount in the reservation, so the portal follows the saga to its end.
const detail = {
  reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 2,
  tourLine: { ratePerPersonCents: 5000, people: 2, amountCents: 10000 }, projectedValueCents: 10000, discounts: [], finalValueCents: 10000,
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', pendingBalanceCents: 10000, seatHeld: true, conditions: null, createdAt: '2026-10-30T10:00:00Z',
};
const summary = { reservationId: 'r-1', customerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z',
  reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 10000 };
const row = (extra: object = {}) => ({ paymentId: 'p-1', reservationId: 'r-1', customerName: 'Laura Gómez (demo)', paymentType: 'DEPOSIT', paymentMethod: 'TRANSFER', declaredAmountCents: 4000,
  validationStatus: 'IN_VALIDATION', presentedAt: '2026-11-01T10:00:00Z', reviewDueAt: '2026-11-02T10:00:00Z', reviewOverdue: false, pendingBalanceCents: 10000, ...extra });
const attempt = (extra: object = {}) => ({ paymentId: 'p-1', reservationId: 'r-1', paymentMethod: 'TRANSFER', amountCents: 4000, validationStatus: 'IN_VALIDATION', registeredBy: 'u-1',
  registeredAt: '2026-11-01T10:00:00Z', reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 10000, seatHeld: true, ...extra });
const decision = (extra: object = {}) => ({ ...row({ validationStatus: 'APPROVED', verifiedAmountCents: 4500 }), appliedAmountCents: 4000, excessAmountCents: 500, treatmentAmountCents: 0,
  decidedBy: 'u-2', decidedAt: '2026-11-01T11:00:00Z', decisionReason: 'Diferencia', reservationStatus: 'CONFIRMED', paymentStatus: 'DEPOSIT_RECEIVED', validatedValueCents: 4000, ...extra });
const STATUSES = ['IN_VALIDATION', 'APPROVED', 'REJECTED'];

describe('pendingProofsOverTheApiClient', () => {
  it('lists the proofs of every status (the mockup lists the decided ones too) from the rows alone: no reservation, summary or payment is read per row', async () => {
    const { client, calls } = fakeClient({ ok: { ...page([row({ reviewOverdue: true })]), overdueCount: 1 } }, { ok: page([row({ paymentId: 'p-2', validationStatus: 'APPROVED', verifiedAmountCents: 4000 })]) }, { ok: page([row({ paymentId: 'p-3', reservationId: 'r-2', customerName: 'Mario Ruiz (demo)', paymentType: 'FULL_PAYMENT', paymentMethod: 'CASH', validationStatus: 'REJECTED' })]) });
    const proofs = await firstValueFrom(new PendingProofsApiSource(client).list());
    expect(calls.map((c) => c.path)).toEqual(STATUSES.map((s) => `${API_BASE}/payment-proofs?page=1&limit=100&status=${s}`));
    expect(proofs.overdueCount).toBe(1);
    expect(proofs.rows).toHaveLength(3);
    expect(proofs.rows[0]).toMatchObject({ overdue: true, reservation: { id: 'r-1', leadCustomerName: 'Laura Gómez (demo)', paymentType: 'PARTIAL', paymentMethod: 'BANK_TRANSFER' }, payment: { id: 'p-1', proofStatus: 'EN_VALIDACION', amountCents: 4000 } });
    expect(proofs.rows[1].payment).toMatchObject({ id: 'p-2', proofStatus: 'APROBADO' });
    expect(proofs.rows[2]).toMatchObject({ overdue: false, reservation: { id: 'r-2', leadCustomerName: 'Mario Ruiz (demo)', paymentType: 'TOTAL', paymentMethod: 'CASH_AT_OFFICE' }, payment: { id: 'p-3', proofStatus: 'RECHAZADO' } });
  });

  it('shows the overdue count the service answers for the whole list, not the marks of the rows it happened to read', async () => {
    const { client } = fakeClient({ ok: { ...page([row({ reviewOverdue: true })]), overdueCount: 3 } }, { ok: { ...page([]), overdueCount: 9 } }, { ok: page([]) });
    const proofs = await firstValueFrom(new PendingProofsApiSource(client).list());
    expect(proofs.overdueCount).toBe(3);
    expect(proofs.rows).toHaveLength(1);
  });

  it('keeps a row of an older service that sends no method: the panel then shows no modality for it', async () => {
    const { paymentMethod, ...legacy } = row();
    const { client } = fakeClient({ ok: page([legacy]) }, { ok: page([]) }, { ok: page([]) });
    const proofs = await firstValueFrom(new PendingProofsApiSource(client).list());
    expect(proofs.rows[0].reservation.paymentMethod).toBeUndefined();
  });

  it('answers an empty panel without reading any reservation, and shows a refusal as the page error', async () => {
    const empty = fakeClient({ ok: page([]) }, { ok: page([]) }, { ok: page([]) });
    expect(await firstValueFrom(new PendingProofsApiSource(empty.client).list())).toEqual({ rows: [], overdueCount: 0 });
    expect(empty.calls).toHaveLength(3);
    const { client } = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'Sin permiso.', traceId: 't-1' } });
    expect(await firstValueFrom(new PendingProofsApiSource(client).list()).catch((e) => e)).toMatchObject({ status: 403, userMessage: 'Sin permiso.' });
  });
});

const SAGA = '/api/v1/sagas/register-payment';
const saga = (status: string, extra: object = {}) => ({ id: 's-1', status, completedSteps: [], createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:01Z', ...extra });

describe('proofReviewWriterOverTheApiClient', () => {
  const approve = { reservationId: 'r-1', paymentId: 'p-1', decision: 'APROBADO' as const, verifiedAmountCents: 4500, reason: 'Diferencia' };
  const completed = () => [{ ok: saga('COMPLETED', { completedSteps: ['RECORD_CASH_INCOME', 'RECORD_VALIDATED_PAYMENT'] }) }, { ok: decision() }, { ok: { ...detail, reservationStatus: 'CONFIRMED' } }, { ok: page([summary]) }, { ok: page([attempt({ validationStatus: 'APPROVED', verifiedAmountCents: 4500 })]) }];

  it('approves by starting the saga register-payment with the verified amount, the reason and the key, never the approve route, and answers the reservation with what the approval did', async () => {
    const { client, calls } = fakeClient(...completed());
    const saved = await firstValueFrom(new ProofReviewApiWriter(client, 0).decide(approve, 'key-12345678'));
    expect(calls[0]).toMatchObject({ path: SAGA, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' },
      body: { reservationId: 'r-1', paymentId: 'p-1', paymentMedium: 'TRANSFER', amountCents: 4500, concept: 'Comprobante de transferencia aprobado', reason: 'Diferencia' } });
    expect((calls[0].body as { businessDate: string }).businessDate).toMatch(/^d{4}-d{2}-d{2}$/);
    expect(calls.some((c) => c.path.endsWith('/approve'))).toBe(false);
    expect(calls[1].path).toBe(`${API_BASE}/payment-proofs/p-1`);
    expect(saved.status).toBe('CONFIRMADA');
    expect(saved.payments?.[0].review).toMatchObject({ decision: 'APROBADO', appliedCents: 4000, surplusCents: 500, pendingTreatmentCents: 0 });
  });

  it('leaves the reason out of an approval that has none, and sends no reviewer, time or state', async () => {
    const { client, calls } = fakeClient(...completed(), { ok: {} });
    await firstValueFrom(new ProofReviewApiWriter(client, 0).decide({ ...approve, reason: '  ' }, 'key-12345678'));
    expect(Object.keys(calls[0].body as object).sort()).toEqual(['amountCents', 'businessDate', 'concept', 'paymentId', 'paymentMedium', 'reservationId']);
  });

  it('asks the saga again until it ends and reads the result only when it completed', async () => {
    const { client, calls } = fakeClient({ ok: saga('RUNNING') }, { ok: saga('RUNNING') }, ...completed());
    await firstValueFrom(new ProofReviewApiWriter(client, 0).decide(approve, 'key-12345678'));
    expect(calls.slice(0, 3).map((c) => [c.method ?? 'GET', c.path])).toEqual([['POST', SAGA], ['GET', `${SAGA}/s-1`], ['GET', `${SAGA}/s-1`]]);
  });

  it('tells that Cash refused the income and the proof stays pending, and reads nothing else', async () => {
    const { client, calls } = fakeClient({ ok: saga('FAILED', { failedStep: 'RECORD_CASH_INCOME' }) });
    expect(await firstValueFrom(new ProofReviewApiWriter(client, 0).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ userMessage: 'Caja rechazó el ingreso y el comprobante sigue pendiente.' });
    expect(calls).toHaveLength(1);
  });

  it('tells that the reservation refused the payment and Cash reversed the income', async () => {
    const { client } = fakeClient({ ok: saga('RUNNING') }, { ok: saga('COMPENSATED', { failedStep: 'RECORD_VALIDATED_PAYMENT' }) });
    expect(await firstValueFrom(new ProofReviewApiWriter(client, 0).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ userMessage: 'La reserva no aceptó el pago y Caja reversó el ingreso; el comprobante sigue pendiente.' });
  });

  it('leaves an unknown outcome of the second step to a person, and a saga that never ends to a later look', async () => {
    const unknown = fakeClient({ ok: saga('FAILED', { failedStep: 'RECORD_VALIDATED_PAYMENT' }) });
    expect(await firstValueFrom(new ProofReviewApiWriter(unknown.client, 0).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ userMessage: 'No se conoce el resultado del registro: un responsable debe revisarlo.' });
    const running = fakeClient({ ok: saga('RUNNING') }, ...Array.from({ length: 70 }, () => ({ ok: saga('RUNNING') })));
    expect(await firstValueFrom(new ProofReviewApiWriter(running.client, 0).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ userMessage: 'El registro sigue en curso: consulta de nuevo en unos minutos.' });
  });

  it('rejects with the reason only, through its own route and with no amount', async () => {
    const { client, calls } = fakeClient({ ok: decision({ validationStatus: 'REJECTED' }) }, { ok: detail }, { ok: page([summary]) }, { ok: page([attempt({ validationStatus: 'REJECTED' })]) });
    await firstValueFrom(new ProofReviewApiWriter(client).decide({ reservationId: 'r-1', paymentId: 'p-1', decision: 'RECHAZADO', verifiedAmountCents: 0, reason: 'Ilegible' }, 'key-87654321'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/payment-proofs/p-1/reject`, method: 'POST', headers: { 'Idempotency-Key': 'key-87654321' }, body: { reason: 'Ilegible' } });
  });

  it('shows the refusal of the service, such as a proof already decided or a missing right, as the page error', async () => {
    for (const [status, message] of [[422, 'This action is not allowed in the current state.'], [403, 'You do not have permission to do this.']] as const) {
      const { client } = fakeClient({ fail: { status, code: 'HTTP_ERROR', message, traceId: 't-1' } });
      expect(await firstValueFrom(new ProofReviewApiWriter(client, 0).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ status, userMessage: message });
    }
  });
});

describe('sourceProvidersOfTheProofReview', () => {
  it('provides the panel and the decision over the container client', () => {
    const injector = Injector.create({ providers: sourceProviders(fakeClient().client) });
    expect(injector.get(PendingProofsSource)).toBeInstanceOf(PendingProofsApiSource);
    expect(injector.get(ProofReviewWriter)).toBeInstanceOf(ProofReviewApiWriter);
  });
});

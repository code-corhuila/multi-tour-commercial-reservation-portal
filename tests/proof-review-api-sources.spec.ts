import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { PendingProofsApiSource, ProofReviewApiWriter } from '../src/app/http/proof-review-api-sources';
import { PendingProofsSource, ProofReviewWriter } from '../src/app/payments/data/proof-review-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-010 over the contract (PROPOSED routes): the panel lists the proofs by status, the decision is one POST per proof under an
// Idempotency-Key. The approval comes first and a rejection stays inside the service (api spec 010, update of 2026-11-01).
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

describe('proofReviewWriterOverTheApiClient', () => {
  const approve = { reservationId: 'r-1', paymentId: 'p-1', decision: 'APROBADO' as const, verifiedAmountCents: 4500, reason: 'Diferencia' };

  it('approves with the verified amount in cents and the reason, under the key, and answers the reservation with what the approval did', async () => {
    const { client, calls } = fakeClient({ ok: decision() }, { ok: { ...detail, reservationStatus: 'CONFIRMED' } }, { ok: page([summary]) }, { ok: page([attempt({ validationStatus: 'APPROVED', verifiedAmountCents: 4500 })]) });
    const saved = await firstValueFrom(new ProofReviewApiWriter(client).decide(approve, 'key-12345678'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/payment-proofs/p-1/approve`, method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' }, body: { verifiedAmountCents: 4500, reason: 'Diferencia' } });
    expect(saved.status).toBe('CONFIRMADA');
    expect(saved.payments?.[0].review).toMatchObject({ decision: 'APROBADO', appliedCents: 4000, surplusCents: 500, pendingTreatmentCents: 0 });
  });

  it('leaves the reason out of an approval that has none, and sends no reviewer, time or state', async () => {
    const { client, calls } = fakeClient({ ok: decision() }, { ok: detail }, { ok: page([summary]) }, { ok: page([attempt()]) });
    await firstValueFrom(new ProofReviewApiWriter(client).decide({ ...approve, reason: '' }, 'key-12345678'));
    expect(calls[0].body).toEqual({ verifiedAmountCents: 4500 });
  });

  it('rejects with the reason only, through its own route and with no amount', async () => {
    const { client, calls } = fakeClient({ ok: decision({ validationStatus: 'REJECTED' }) }, { ok: detail }, { ok: page([summary]) }, { ok: page([attempt({ validationStatus: 'REJECTED' })]) });
    await firstValueFrom(new ProofReviewApiWriter(client).decide({ reservationId: 'r-1', paymentId: 'p-1', decision: 'RECHAZADO', verifiedAmountCents: 0, reason: 'Ilegible' }, 'key-87654321'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/payment-proofs/p-1/reject`, method: 'POST', headers: { 'Idempotency-Key': 'key-87654321' }, body: { reason: 'Ilegible' } });
  });

  it('shows the refusal of the service, such as a proof already decided or a missing right, as the page error', async () => {
    for (const [status, message] of [[422, 'This action is not allowed in the current state.'], [403, 'You do not have permission to do this.']] as const) {
      const { client } = fakeClient({ fail: { status, code: 'HTTP_ERROR', message, traceId: 't-1' } });
      expect(await firstValueFrom(new ProofReviewApiWriter(client).decide(approve, 'key-12345678')).catch((e) => e)).toMatchObject({ status, userMessage: message });
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

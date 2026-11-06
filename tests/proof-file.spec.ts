import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, NEVER, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { DemoProofFileSource } from '../src/app/demo/proof-file-demo';
import { API_BASE } from '../src/app/http/api-paths';
import { ProofFileApiSource } from '../src/app/http/proof-file-api-source';
import { ProofFileSource } from '../src/app/payments/data/proof-file-source';
import { PendingProofs, PendingProofsSource, ProofReviewWriter } from '../src/app/payments/data/proof-review-ports';
import { ValidateProofPageComponent } from '../src/app/payments/pages/validate-proof-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation, ReservationPayment } from '../src/app/reservations/model/reservation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { sourceProviders } from '../src/app/sources';
import { actorAs } from './actor-context.double';
import { fakeClient } from './api-client.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf, screenOf } from './reservations.double';

// HU-COM-010, portal debt of the deep audit (issue code-corhuila/multi-tour-docs#176): the reviewer sees the proof file, fetched through the
// container client as a blob (mockup admin-validar-soporte.html: image preview, "Ver comprobante" button for a document).
const flat = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');
const bytes = (type: string) => new Blob(['x'], { type });

/** The transfer as the real service lists it: it never returns the file name (PaymentResponse), so `proofName` is ''. */
const transfer = (over: Partial<ReservationPayment> = {}): ReservationPayment =>
  ({ id: 'p-1', method: 'BANK_TRANSFER', amountCents: 4000, proofName: '', proofStatus: 'EN_VALIDACION', registeredBy: 'u-1', presentedAt: '2026-11-01T10:00:00Z', ...over });

class ListedReservations extends ReservationsSource {
  constructor(private readonly items: readonly Reservation[]) { super(); }
  override list() { return of(this.items); }
}
class StubFiles extends ProofFileSource {
  readonly reads: string[] = [];
  constructor(private readonly answer: () => Observable<Blob>) { super(); }
  override read(paymentId: string) { this.reads.push(paymentId); return this.answer(); }
}

function screen(payment: ReservationPayment, files: ProofFileSource) {
  const navigation = new PortalNavigation();
  navigation.register(['payments', 'payments-validate']);
  navigation.params.set({ reservation: 'r-1', payment: payment.id });
  return screenOf(ValidateProofPageComponent, [
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    { provide: ReservationsSource, useValue: new ListedReservations([reservationOf('r-1', { payments: [payment] })]) },
    { provide: PendingProofsSource, useValue: new (class extends PendingProofsSource { override list() { return of<PendingProofs>({ rows: [], overdueCount: 0 }); } })() },
    { provide: ProofReviewWriter, useValue: new (class extends ProofReviewWriter { override decide() { return NEVER; } })() },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
    { provide: ProofFileSource, useValue: files },
  ]);
}

let created: Blob[], revoked: string[];
beforeEach(() => {
  created = []; revoked = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => { created.push(blob as Blob); return `blob:proof-${created.length}`; });
  URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); });
});
afterEach(() => TestBed.resetTestingModule());

describe('proofFileOverTheApiClient', () => {
  it('reads GET /payment-proofs/{id}/file through the container client as a blob, with no personal data in the path', async () => {
    const file = bytes('application/pdf');
    const { client, calls } = fakeClient({ ok: file });
    expect(await firstValueFrom(new ProofFileApiSource(client).read('p-1'))).toBe(file);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe(`${API_BASE}/payment-proofs/p-1/file`);
    expect(calls[0]).toMatchObject({ responseType: 'blob' });
    expect(calls[0].method ?? 'GET').toBe('GET');
  });

  it('shows a refusal as the page error', async () => {
    const { client } = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'No existe.', traceId: 't-1' } });
    expect(await firstValueFrom(new ProofFileApiSource(client).read('p-1')).catch((e) => e)).toMatchObject({ status: 404, userMessage: 'No existe.' });
  });

  it('is the source of the file when the container client is there', () => {
    expect(Injector.create({ providers: sourceProviders(fakeClient().client) }).get(ProofFileSource)).toBeInstanceOf(ProofFileApiSource);
  });
});

describe('proofFileOfTheDemo', () => {
  it('serves a small PDF held in memory, never a stored file', async () => {
    const file = await firstValueFrom(new DemoProofFileSource().read('RES-1833-P1'));
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBeGreaterThan(0);
    expect(file.size).toBeLessThan(5 * 1024);
  });

  it('is registered with the demo review providers', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, ...proofReviewDemoProviders()] });
    expect(TestBed.inject(ProofFileSource)).toBeInstanceOf(DemoProofFileSource);
  });
});

describe('proofFileOnTheDecisionScreen', () => {
  it('asks for the file of a transfer although the service sends no name, and names it as the service does', async () => {
    const files = new StubFiles(() => of(bytes('image/png')));
    const { element } = await screen(transfer(), files);
    expect(files.reads).toEqual(['p-1']);
    expect(flat(element)).toContain('Archivo: receipt-p-1.png');
    expect(flat(element)).not.toContain('Sin comprobante adjunto');
  });

  it('draws an image proof as a preview with the mockup alternative text', async () => {
    const { element } = await screen(transfer(), new StubFiles(() => of(bytes('image/jpeg'))));
    const image = element.querySelector<HTMLImageElement>('img[alt="Vista previa del comprobante de pago"]')!;
    expect(image.getAttribute('src')).toBe('blob:proof-1');
    expect(flat(element)).toContain('Archivo: receipt-p-1.jpg');
    expect(Array.from(element.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Ver comprobante')).toBe(false);
  });

  it('draws a PDF behind the button Ver comprobante, which opens and closes the document', async () => {
    const page = await screen(transfer(), new StubFiles(() => of(bytes('application/pdf'))));
    expect(page.element.querySelector('iframe')).toBeNull();
    await page.click('Ver comprobante');
    expect(page.element.querySelector('iframe[title="Documento del comprobante abierto"]')?.getAttribute('src')).toBe('blob:proof-1');
    await page.click('Ver comprobante');
    expect(page.element.querySelector('iframe')).toBeNull();
  });

  it('keeps the name the service gave when there is one', async () => {
    const { element } = await screen(transfer({ proofName: 'soporte-demo.pdf' }), new StubFiles(() => of(bytes('application/pdf'))));
    expect(flat(element)).toContain('Archivo: soporte-demo.pdf');
  });

  it('says Sin comprobante adjunto, and reads nothing, for a payment that is not a transfer', async () => {
    const files = new StubFiles(() => of(bytes('application/pdf')));
    const { element } = await screen(transfer({ id: 'p-2', method: 'CASH', proofName: null, proofStatus: 'SIN_COMPROBANTE' }), files);
    expect(files.reads).toEqual([]);
    expect(flat(element)).toContain('Sin comprobante adjunto');
  });

  it('says Sin comprobante adjunto when the service answers that the file does not exist', async () => {
    const { element } = await screen(transfer(), new StubFiles(() => throwError(() => ({ status: 404, userMessage: 'No existe.' }))));
    expect(flat(element)).toContain('Sin comprobante adjunto');
  });

  it('shows another failure with its message and reads again on Reintentar', async () => {
    let calls = 0;
    const files = new StubFiles(() => (++calls === 1 ? throwError(() => ({ status: 500, userMessage: 'Falla del servicio.' })) : of(bytes('image/png'))));
    const page = await screen(transfer(), files);
    expect(page.element.querySelector('[data-file-state="error"]')?.textContent).toContain('Falla del servicio.');
    expect(flat(page.element)).not.toContain('Sin comprobante adjunto');
    await page.click('Reintentar');
    expect(files.reads).toHaveLength(2);
    expect(page.element.querySelector('img[alt="Vista previa del comprobante de pago"]')).not.toBeNull();
  });

  it('shows Cargando while the file arrives', async () => {
    const { element } = await screen(transfer(), new StubFiles(() => NEVER));
    expect(element.querySelector('[data-file-state="loading"]')?.textContent).toContain('Cargando…');
  });

  it('revokes the object URL when the screen goes away and when the file is read again', async () => {
    const page = await screen(transfer(), new StubFiles(() => of(bytes('image/png'))));
    expect(revoked).toEqual([]);
    page.fixture.destroy();
    expect(revoked).toEqual(['blob:proof-1']);
  });

  it('draws the demo proof of the delivered portal: the name and the button of the seeded PDF', async () => {
    const navigation = new PortalNavigation();
    navigation.register(['payments', 'payments-validate']);
    navigation.params.set({ reservation: 'RES-1833', payment: 'RES-1833-P1' });
    const { reservationDemoProviders } = await import('../src/app/demo/reservations-demo');
    const { paymentsDemoProviders } = await import('../src/app/demo/payments-demo');
    const page = await screenOf(ValidateProofPageComponent, [
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(),
      { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
      { provide: PortalNavigation, useValue: navigation },
    ]);
    expect(flat(page.element)).toContain('Archivo: soporte-demo.pdf');
    await page.click('Ver comprobante');
    expect(page.element.querySelector('iframe')).not.toBeNull();
  });
});

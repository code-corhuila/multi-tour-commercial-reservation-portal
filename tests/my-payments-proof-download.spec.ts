import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { myPaymentsDemoProviders } from '../src/app/demo/my-payments-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { selfServiceDemoProviders } from '../src/app/demo/self-service-reservation-demo';
import { API_BASE } from '../src/app/http/api-paths';
import { CustomerPaymentSummary, MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { MyPaymentsPageComponent } from '../src/app/my-payments/pages/my-payments-page.component';
import { ProofFileSource } from '../src/app/payments/data/proof-file-source';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CLIENT_AREA } from '../src/app/portal-areas';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders } from '../src/app/sources';
import { page } from './api-client.double';

// HU-COM-014 portal: mis-pagos.html draws a "Descargar" link on every proof of the list (app.js 9663). The file is the one the service serves
// at GET /payment-proofs/{id}/file to its owner; the portal keeps none and a cash payment has none.
const SUMMARY: CustomerPaymentSummary = {
  reservationId: 'RES-1', tourName: 'Desierto de la Tatacoa', departureAt: '2026-11-07', reservationStatus: 'PENDING_PAYMENT', paymentType: 'TOTAL',
  paymentMethod: 'BANK_TRANSFER', proofStatus: 'EN_VALIDACION', financialStatus: 'SIN_PAGO', validatedCents: 0, balanceCents: 85_000_000,
  receipts: [{ paymentId: 'p-1', support: 'comprobante-1.pdf', amountCents: 85_000_000, status: 'EN_VALIDACION' }, { support: 'efectivo', amountCents: 1_000, status: 'APROBADO' }],
};
class Files extends ProofFileSource {
  readonly asked: string[] = [];
  constructor(private readonly answer: () => Observable<Blob>) { super(); }
  override read(paymentId: string): Observable<Blob> { this.asked.push(paymentId); return this.answer(); }
}
class Mine extends MyPaymentsSource {
  override listMine() { return of([SUMMARY]); }
  override notices() { return of([]); }
  override continuePaymentTarget() { return of(null); }
}
const flat = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

async function render(files: Files) {
  const navigation = new PortalNavigation();
  navigation.register([CLIENT_AREA.panel, CLIENT_AREA.payments]);
  TestBed.configureTestingModule({ providers: [{ provide: MyPaymentsSource, useValue: new Mine() }, { provide: ProofFileSource, useValue: files },
    { provide: PortalNavigation, useValue: navigation }, { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) }] });
  const fixture = TestBed.createComponent(MyPaymentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  return { host: fixture.nativeElement as HTMLElement, settle };
}

describe('myPaymentsOffersDescargarForTheProofsThatHaveAFile', () => {
  const saved: Array<{ download: string; href: string }> = [];
  beforeEach(() => {
    saved.length = 0;
    URL.createObjectURL = vi.fn(() => 'blob:proof'); URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push({ download: this.download, href: this.href }); });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('draws the link only on the proof that carries a payment id, and none on a cash payment', async () => {
    const view = await render(new Files(() => of(new Blob(['x'], { type: 'application/pdf' }))));
    const items = Array.from(view.host.querySelectorAll('.crp-my-payments-receipts li'), (li) => flat(li.textContent));
    expect(items).toEqual(['comprobante-1.pdf · $850.000 · En validación Descargar', 'efectivo · $1.000 · Aprobado']);
  });

  it('reads the file by payment id and hands it to the browser named after the payment', async () => {
    const files = new Files(() => of(new Blob(['x'], { type: 'application/pdf' })));
    const view = await render(files);
    (view.host.querySelector('.crp-my-payments-receipts a') as HTMLElement).click(); await view.settle();
    expect(files.asked).toEqual(['p-1']);
    expect(saved).toEqual([{ download: 'receipt-p-1.pdf', href: 'blob:proof' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:proof');
  });

  it('says the file could not be downloaded when the service refuses, and keeps the list', async () => {
    const view = await render(new Files(() => throwError(() => ({ status: 404 }))));
    (view.host.querySelector('.crp-my-payments-receipts a') as HTMLElement).click(); await view.settle();
    expect(saved).toEqual([]);
    expect(flat(view.host.querySelector('[role="alert"]')?.textContent)).toBe('No pudimos descargar el comprobante.');
    expect(view.host.querySelectorAll('.crp-my-payments-receipts li')).toHaveLength(2);
  });
});

describe('theSourcesGiveEachTransferProofItsPaymentId', () => {
  afterEach(() => TestBed.resetTestingModule());
  const row = { reservationId: 'r-1', customerName: 'Laura', tourName: 'Tatacoa', departureStartsAt: '2026-11-07T06:30:00Z' };
  const detail = { reservationId: 'r-1', customerId: 'c-1', serviceId: 't-1', salidaId: 'd-1', people: 1, tourLine: { ratePerPersonCents: 1, people: 1, amountCents: 1 },
    projectedValueCents: 1, discounts: [], finalValueCents: 1, reservationStatus: 'PENDING_PAYMENT', paymentStatus: 'NO_PAYMENT', pendingBalanceCents: 1, seatHeld: false, createdAt: '2026-10-30T10:00:00Z' };
  const transfer = { paymentId: 'p-2', paymentMethod: 'TRANSFER', amountCents: 1, validationStatus: 'IN_VALIDATION', registeredBy: 'u', registeredAt: '2026-10-31T10:00:00Z' };
  const cash = { paymentId: 'p-3', paymentMethod: 'CASH', amountCents: 1, registeredBy: 'u', registeredAt: '2026-10-31T11:00:00Z' };

  it('with the real service, the transfer carries it and the cash payment does not', async () => {
    const client: PortalApiClient = { request: (async (path: string) => {
      if (path.startsWith(`${API_BASE}/reservations?`)) return page([row]);
      if (path.startsWith(`${API_BASE}/reservations/r-1/payments`)) return page([cash, transfer]);
      return detail;
    }) as PortalApiClient['request'] };
    TestBed.configureTestingModule({ providers: sourceProviders(client) });
    const [mine] = await firstValueFrom(TestBed.inject(MyPaymentsSource).listMine());
    expect(mine.receipts?.map((r) => r.paymentId)).toEqual(['p-2', undefined]);
  });

  it('the demo gives the paymentId of every transfer proof so the delivered portal can offer the download', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) },
      { provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, ...reservationDemoProviders(), ...selfServiceDemoProviders(), ...paymentsDemoProviders(), ...myPaymentsDemoProviders()] });
    const receipts = (await firstValueFrom(TestBed.inject(MyPaymentsSource).listMine())).flatMap((r) => r.receipts ?? []);
    expect(receipts.length).toBeGreaterThan(0);
    expect(receipts.filter((r) => r.support).every((r) => r.paymentId)).toBe(true);
  });
});

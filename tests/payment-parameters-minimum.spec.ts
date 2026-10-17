import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentParametersDemoProviders } from '../src/app/demo/payment-parameters-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PaymentParametersSource, PaymentParametersView } from '../src/app/payment-parameters/data/payment-parameters-ports';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { PaymentManagementPageComponent } from '../src/app/payments/pages/payment-management-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-009 amendment v1.9, AC-PY.12 (P4): "Monto del abono (mínimo $X)" and "Abono mínimo para confirmar: $X" on 13, X from the payment parameters.
// RES-1841 is Abono · Efectivo, $418.000, nothing validated yet: its minimum deposit is a third, $139.333.
const CASH_PARTIAL = 'RES-1841';
const TRANSFER_TOTAL = 'RES-1842';
const flat = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

class FixedMinimum extends PaymentParametersSource {
  constructor(private readonly cents: number) { super(); }
  override read(): Observable<PaymentParametersView> { return of({ rows: [], audit: [], lastChange: null }); }
  override minimumDepositCents(): Observable<number> { return of(this.cents); }
}

function screen(reservation: string, extra: unknown[] = [], withParameters = true) {
  const navigation = new PortalNavigation();
  navigation.params.set({ reservation });
  return screenOf(PaymentManagementPageComponent, [
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(), ...(withParameters ? paymentParametersDemoProviders() : []),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
    ...extra,
  ]);
}

afterEach(() => TestBed.resetTestingModule());

describe('theMinimumDepositComesFromThePaymentParametersOnScreen13', () => {
  it('writes the minimum in the placeholder and the hint of an Abono, from the parameters', async () => {
    const { element } = await screen(CASH_PARTIAL);
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono (mínimo $139.333)');
    expect(flat(element.querySelector('[data-payment-minimum]')!)).toBe('Abono mínimo para confirmar: $139.333. El saldo restante queda pendiente.');
  });
  it('follows the port, not a third held in the view', async () => {
    const { element } = await screen(CASH_PARTIAL, [{ provide: PaymentParametersSource, useValue: new FixedMinimum(20_000_000) }]);
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono (mínimo $200.000)');
  });
  it('draws no minimum for a Pago total or in a build without the parameters', async () => {
    expect((await screen(TRANSFER_TOTAL)).element.querySelector('[data-payment-minimum]')).toBeNull();
    TestBed.resetTestingModule();
    const without = await screen(CASH_PARTIAL, [], false);
    expect(without.element.querySelector('[data-payment-minimum]')).toBeNull();
    expect(without.element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono');
  });
});

describe('aDepositBelowTheMinimumIsRefusedBesideTheFieldWithTheMockupText', () => {
  it('refuses the first deposit below the minimum beside the amount, marks it invalid and sends nothing', async () => {
    const { element, type, settle } = await screen(CASH_PARTIAL);
    const writer = TestBed.inject(PaymentsWriter), sent: unknown[] = [], register = writer.register.bind(writer);
    writer.register = (...args: Parameters<typeof register>) => { sent.push(args); return register(...args); };
    await type('amount', '50000');
    element.querySelector<HTMLButtonElement>('form [type="submit"]')?.click(); await settle();
    expect(flat(element.querySelector('#crp-payments-amount-error')!)).toBe('El abono debe ser como mínimo $139.333 (abono mínimo del servicio sobre el valor final después de descuentos).');
    expect(element.querySelector('[name="amount"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element.querySelector('[name="amount"]'));
    expect(sent).toEqual([]);
  });
  it('accepts a deposit that reaches the minimum', async () => {
    const { element, type, settle } = await screen(CASH_PARTIAL);
    await type('amount', '139334');
    element.querySelector<HTMLButtonElement>('form [type="submit"]')?.click(); await settle();
    expect(flat(element.querySelector('#crp-payments-amount-error')!)).toBe('');
  });
});

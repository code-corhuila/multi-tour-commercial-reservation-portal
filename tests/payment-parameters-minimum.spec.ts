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

// HU-COM-009 amendment v1.9, AC-PY.12 (P4): the minimum deposit conditions the confirmation, not the registration (PDR v1.9 GAP-03): on 13 it is an informative note, X from the payment parameters.
// RES-1841 is Abono · Efectivo, $418.000, nothing validated yet: its minimum deposit is a third, $139.333.
const CASH_PARTIAL = 'RES-1841';
const TRANSFER_TOTAL = 'RES-1842';
const NOTE = (x: string) => `Abono mínimo para confirmar la reserva: ${x} (sobre el valor final después de descuentos). Puedes registrar un abono menor: la reserva se confirma cuando lo validado llegue al mínimo.`;
const BELOW = ' La reserva queda Pendiente de pago hasta que lo validado llegue al mínimo.';
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
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono (mínimo para confirmar $139.333)');
    expect(flat(element.querySelector('[data-payment-minimum]')!)).toBe(NOTE('$139.333'));
  });
  it('follows the port, not a third held in the view', async () => {
    const { element } = await screen(CASH_PARTIAL, [{ provide: PaymentParametersSource, useValue: new FixedMinimum(20_000_000) }]);
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono (mínimo para confirmar $200.000)');
  });
  it('draws no minimum for a Pago total or in a build without the parameters', async () => {
    expect((await screen(TRANSFER_TOTAL)).element.querySelector('[data-payment-minimum]')).toBeNull();
    TestBed.resetTestingModule();
    const without = await screen(CASH_PARTIAL, [], false);
    expect(without.element.querySelector('[data-payment-minimum]')).toBeNull();
    expect(without.element.querySelector<HTMLInputElement>('[name="amount"]')!.placeholder).toBe('Monto del abono');
  });
});

describe('aDepositBelowTheMinimumIsRegisteredAndTheMinimumOnlyInforms', () => {
  it('registers the first deposit below the minimum, with no error beside the amount, and tells the reservation stays pending', async () => {
    const { element, type, settle } = await screen(CASH_PARTIAL);
    const writer = TestBed.inject(PaymentsWriter), sent: unknown[] = [], register = writer.register.bind(writer);
    writer.register = (...args: Parameters<typeof register>) => { sent.push(args); return register(...args); };
    expect(flat(element.querySelector('[data-payment-minimum]')!)).toBe(NOTE('$139.333'));
    await type('amount', '50000');
    expect(flat(element.querySelector('[data-payment-minimum]')!)).toBe(NOTE('$139.333') + BELOW);
    element.querySelector<HTMLButtonElement>('form [type="submit"]')?.click(); await settle();
    expect(flat(element.querySelector('#crp-payments-amount-error')!)).toBe('');
    expect(element.querySelector('[name="amount"]')!.getAttribute('aria-invalid')).toBeNull();
    expect(sent.length).toBe(1);
  });
  it('accepts a deposit that reaches the minimum and drops the pending line', async () => {
    const { element, type, settle } = await screen(CASH_PARTIAL);
    await type('amount', '139334');
    expect(flat(element.querySelector('[data-payment-minimum]')!)).toBe(NOTE('$139.333'));
    element.querySelector<HTMLButtonElement>('form [type="submit"]')?.click(); await settle();
    expect(flat(element.querySelector('#crp-payments-amount-error')!)).toBe('');
  });
});

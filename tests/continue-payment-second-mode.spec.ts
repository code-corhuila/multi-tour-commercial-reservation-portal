import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoTourImages } from '../src/app/demo/tour-photo-demo';
import { RESERVATION_FORM_CONTRIBUTIONS } from '../src/app/customers/components/reservation-form-sections';
import { ContinuePaymentTarget, CustomerPaymentSummary, MyPaymentsSource, PaymentNotice } from '../src/app/my-payments/data/my-payments-source';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { TourImages } from '../src/app/shared/tour-photo';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

// HU-COM-008, AC-RS.13 / DP-RS9 (docs #759): Continuar pago lands on screen 21 in its second mode, as finalizar-reserva.html draws it with ?reserva=.
const OWN: CustomerPaymentSummary = {
  reservationId: 'RES-1842', tourName: 'Desierto de la Tatacoa al atardecer', departureAt: '2026-11-07', reservationStatus: 'CONFIRMED', people: 2,
  paymentType: 'PARTIAL', paymentMethod: 'BANK_TRANSFER', proofStatus: 'APROBADO', financialStatus: 'ABONO_RECIBIDO',
  validatedCents: 30_000_000, balanceCents: 55_000_000, finalValueCents: 85_000_000,
};

class Port extends MyPaymentsSource {
  constructor(private readonly all: readonly CustomerPaymentSummary[]) { super(); }
  override listMine(): Observable<readonly CustomerPaymentSummary[]> { return of(this.all); }
  override notices(): Observable<readonly PaymentNotice[]> { return of([]); }
  override continuePaymentTarget(): Observable<ContinuePaymentTarget | null> { return of(null); }
}

afterEach(() => TestBed.resetTestingModule());

async function openSecondMode(all: readonly CustomerPaymentSummary[] = [OWN], reservation = 'RES-1842') {
  const navigation = new PortalNavigation();
  navigation.register([CLIENT_AREA.reservations, 'finish', 'transfer-payment']);
  navigation.params.set({ reservation });
  const open = vi.spyOn(navigation, 'open');
  const quote = vi.fn(() => NEVER);
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) },
    { provide: MyPaymentsSource, useValue: new Port(all) },
    { provide: PaymentMethodsSource, useValue: { listEnabled: () => NEVER, listTypes: () => NEVER, bankAccount: () => NEVER } },
    { provide: SelectionQuoteSource, useValue: { quote } },
    { provide: ReservationRequester, useValue: { request: vi.fn() } },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: TourImages, useValue: new DemoTourImages() },
    { provide: PortalNavigation, useValue: navigation },
    ...RESERVATION_FORM_CONTRIBUTIONS,
  ] });
  const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const text = () => (host.textContent ?? '').replace(/\s+/g, ' ');
  const button = (name: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim().endsWith(name));
  return { host, text, open, quote, settle, button, amount: () => host.querySelector<HTMLInputElement>('input[name="amount"]')! };
}

describe('continuingAPaymentShowsValidatedValuesAndPendingBalance (AC-RS.13)', () => {
  it('draws the second mode of the mockup: title, notice, validated values, pending balance and the amount to pay now', async () => {
    const view = await openSecondMode();
    expect(view.text()).toContain('Completar el pago de la reserva');
    expect(view.text()).toContain('Completa el saldo de una reserva existente: no se crea una reserva nueva.');
    expect(view.text()).toContain('Desierto de la Tatacoa al atardecer');
    expect(view.text()).toContain('Valores validados $300.000');
    expect(view.text()).toContain('Saldo pendiente $550.000');
    expect(view.text()).toContain('Valor final $850.000');
    expect(view.text()).toContain('Monto a pagar ahora');
    expect(view.text()).toContain('Tipo de pago de la reserva: Abono. Aquí pagas una parte o todo el saldo pendiente ($550.000).');
    expect(view.amount().value).toBe('550000');
  });

  it('is not the creation form: no holder, no conditions, no quote and no new reservation', async () => {
    const view = await openSecondMode();
    expect(view.host.querySelector('#crp-holder-name')).toBeNull();
    expect(view.text()).not.toContain('Cliente titular');
    expect(view.text()).not.toContain('Condiciones de reserva');
    expect(view.quote).not.toHaveBeenCalled();
  });

  it('Continuar opens screen 24 with the reservation, its type and the amount typed, in cents', async () => {
    const view = await openSecondMode();
    view.amount().value = '100000'; view.amount().dispatchEvent(new Event('input'));
    view.button('Continuar')!.click();
    expect(view.open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1842', type: 'PARTIAL', amount: '10000000' });
  });

  it('refuses an amount above the balance or not positive, with the message of the mockup, and opens nothing', async () => {
    const view = await openSecondMode();
    for (const typed of ['550001', '0', '']) {
      view.amount().value = typed; view.amount().dispatchEvent(new Event('input'));
      view.button('Continuar')!.click(); await view.settle();
      expect(view.text()).toContain('Ingresa un monto válido: mayor a cero y hasta el saldo pendiente ($550.000).');
    }
    expect(view.open).not.toHaveBeenCalled();
  });

  it('Volver a mis reservas goes back to the list', async () => {
    const view = await openSecondMode();
    view.button('Volver a mis reservas')!.click();
    expect(view.open).toHaveBeenCalledWith(CLIENT_AREA.reservations);
  });

  it('says why there is nothing to continue: not the customer, Cancelada or no balance', async () => {
    expect((await openSecondMode([OWN], 'RES-9999')).text()).toContain('No encontramos la reserva indicada en tu cuenta.');
    TestBed.resetTestingModule();
    expect((await openSecondMode([{ ...OWN, reservationStatus: 'CANCELLED' }])).text()).toContain('La reserva RES-1842 está Cancelada: no admite nuevos pagos y no puede reactivarse.');
    TestBed.resetTestingModule();
    expect((await openSecondMode([{ ...OWN, balanceCents: 0 }])).text()).toContain('La reserva RES-1842 no tiene saldo pendiente.');
  });
});

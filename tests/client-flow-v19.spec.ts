import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutPaymentBlockComponent } from '../src/app/payments/components/checkout-payment-block.component';
import { PaymentReceivedPageComponent, PaymentRejectedPageComponent } from '../src/app/payments/pages/payment-result-pages.component';
import { TransferPaymentPageComponent } from '../src/app/payments/pages/transfer-payment-page.component';
import { PAYMENT_RESULT_AREA } from '../src/app/payments/payment-result-copy';
import { CLIENT_AREA, PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CustomerPaymentSummary, MyPaymentsSource } from '../src/app/my-payments/data/my-payments-source';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester, ReservationSelectionSource, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { RESERVATION_FLOW } from '../src/app/self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { ControllablePaymentMethods, CustomerAs, METHODS, QUOTE, RecordingRequester, SELECTION, quoteOf, reservationFor, selectionAt } from './self-service-reservation.double';

// Client flow v1.9 (reservar-tour, finalizar-reserva, pago-transferencia, pago-exitoso, pago-fallido): texts and structure of the current mockup.
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
afterEach(() => TestBed.resetTestingModule());

async function mount<T>(component: Type<T>, providers: unknown[], inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: providers as never });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const press = async (label: string) => { Array.from(element.querySelectorAll('button, a')).find((b) => flat(b.textContent) === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await settle(); };
  return { element, settle, press, text: (selector: string) => flat(element.querySelector(selector)?.textContent) };
}
const navigationWith = (areas: string[], params: Record<string, string> = {}) => { const nav = new PortalNavigation(); nav.register(areas); nav.params.set(params); return nav; };

describe('finalizar-reserva.html v1.9 (screen 21)', () => {
  async function confirm() {
    const methods = new ControllablePaymentMethods();
    const view = await mount(ConfirmReservationPageComponent, [
      { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') }, { provide: ReservationSelectionSource, useValue: selectionAt(SELECTION) },
      { provide: PaymentMethodsSource, useValue: methods }, { provide: SelectionQuoteSource, useValue: quoteOf() }, { provide: ReservationRequester, useValue: new RecordingRequester() },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigationWith([RESERVATION_FLOW.reserve]) },
    ]);
    methods.requests.at(-1)!.reply(METHODS); await view.settle();
    const choose = async (code: string) => { const s = view.element.querySelector('select')!; s.value = code; s.dispatchEvent(new Event('change')); await view.settle(); };
    return { ...view, choose };
  }

  it('writes the pill, the back link, the conditions and the help as the mockup does', async () => {
    const p = await confirm();
    expect(p.text('.crp-finish-pill')).toBe('Tu reserva se crea Pendiente de pago. Elige por separado el tipo de pago y el medio de pago habilitados.');
    expect(p.text('.crp-booking-back')).toBe('← Volver a salida y viajeros');
    expect(p.text('.crp-finish-conditions .self-service-note')).toBe('Reservas únicamente el tour y la salida seleccionada. La alimentación indicada forma parte del paquete cuando corresponda; el hospedaje y los restaurantes asociados no se reservan en Multitour.');
    expect(p.text('.crp-finish-help')).toContain('El equipo del operador puede ayudarte a continuar el proceso de reserva y pago; no es un medio de pago.');
  });

  it('explains the medio de pago chosen and names the button after it', async () => {
    const p = await confirm();
    expect(p.text('.crp-booking-bar button')).toBe('Confirmar reserva');
    await p.choose('BANK_TRANSFER');
    expect(p.element.textContent).toContain('Subes el comprobante; queda En validación hasta que un usuario autorizado lo revise (hasta 24 horas).');
    await p.choose('CASH_AT_OFFICE');
    expect(p.element.textContent).toContain('Se registra cuando el equipo del operador recibe el dinero. La promesa de pago no confirma la reserva.');
    expect(p.text('.crp-booking-bar button')).toBe('Crear reserva Pendiente de pago');
  });
});

describe('Tipo de pago y plazo (block of 21)', () => {
  const block = (method = '') => mount(CheckoutPaymentBlockComponent, [
    { provide: PaymentMethodsSource, useValue: new ControllablePaymentMethods() }, { provide: PortalNavigation, useValue: new PortalNavigation() }, { provide: PaymentsWriter, useValue: {} },
  ], { quote: QUOTE, reservation: null, method });

  it('titles and describes the types and the deadline rules without inventing dates', async () => {
    const p = await block();
    expect(p.text('h2')).toBe('Tipo de pago y plazo');
    expect(p.text('legend')).toBe('Tipo de pago (la condición económica de la reserva)');
    expect(Array.from(p.element.querySelectorAll('label.crp-checkout-option'), (l) => flat(l.textContent))).toEqual([
      'Pago total Se confirma cuando se valida el 100 % del valor final, en uno o varios pagos.',
      'Abono Se confirma cuando se valida como mínimo el abono mínimo del servicio; el saldo queda pendiente con plazo propio.']);
    const rules = Array.from(p.element.querySelectorAll('.crp-checkout-deadline p'), (l) => flat(l.textContent));
    expect(rules).toEqual([
      'Límite absoluto: ningún plazo supera la hora de inicio de la salida; desde esa hora no se admiten pagos ni comprobantes. Si no se cumple el pago en el plazo, la reserva se cancela automáticamente y el cupo se libera.',
      'Si presentas un comprobante dentro del plazo, la reserva no se cancela mientras esté En validación. El cupo se aparta con tu primer pago, no al crear la reserva.']);
  });

  it('adds the balance rule only for an Abono, and the notes of each medium', async () => {
    const p = await block('CASH_AT_OFFICE');
    expect(p.element.textContent).not.toContain('Saldo del abono');
    p.element.querySelector<HTMLInputElement>('input[value="PARTIAL"]')!.click(); await p.settle();
    expect(p.element.textContent).toContain('Saldo del abono: una vez Confirmada, debes completarlo y que sea validado antes del plazo configurado por el operador; nunca después de la hora de inicio de la salida.');
    expect(p.element.textContent).toContain('Elegir efectivo registra solo una promesa de pago: no es un pago validado, no confirma la reserva y no aparta cupo. La reserva queda Pendiente de pago y únicamente cuenta cuando el equipo del operador reciba y registre el dinero dentro del plazo.');
    TestBed.resetTestingModule();
    const t = await block('BANK_TRANSFER');
    expect(t.element.textContent).toContain('La reserva sigue Pendiente de pago hasta que un usuario autorizado valide tu pago. El comprobante (PDF, JPG, JPEG o PNG, máximo 5 MB) queda En validación únicamente cuando lo envías.');
  });
});

describe('pago-transferencia.html v1.9 (screen 24)', () => {
  const reservation = { ...reservationFor(SELECTION, 'RES-1842'), paymentMethod: 'BANK_TRANSFER' };
  const transfer = (areas = [CLIENT_AREA.reservations, PAYMENT_RESULT_AREA.received]) => {
    const nav = navigationWith(areas, { reservation: 'RES-1842', type: 'PARTIAL', amount: '30000000' });
    return mount(TransferPaymentPageComponent, [
      { provide: MyReservationsSource, useValue: { listMine: () => of([reservation]) } }, { provide: PaymentMethodsSource, useValue: new ControllablePaymentMethods() },
      { provide: PaymentsWriter, useValue: { register: () => of(undefined) } }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: nav },
    ]).then((view) => ({ ...view, nav }));
  };

  it('writes the alert, "Tu reserva" and the proof section as the mockup does', async () => {
    const p = await transfer();
    expect(p.text('.crp-transfer-alert p')).toBe('Realiza la transferencia y sube el comprobante. El comprobante queda En validación solo cuando lo envías; no es ingreso de caja ni confirma la reserva hasta que un usuario del operador con el permiso Validar comprobantes lo valide, en un plazo máximo de 24 horas corridas.');
    const rows = Array.from(p.element.querySelectorAll('.crp-transfer-summary > div'), (d) => flat(d.textContent));
    expect(rows).toEqual(['Reserva #RES-1842', 'Tour Ruta Andina', 'Salida 18 sep 2026 · 06:30', 'Viajeros 2 viajeros', 'Tipo y medio de pago Abono · Transferencia', 'Valor a transferir $300.000']);
    expect(p.text('.crp-transfer-proof h2')).toBe('Comprobante de pago');
    expect(p.text('label[for="crp-transfer-proof"]')).toBe('Archivo del comprobante (PDF, JPG, JPEG o PNG; máximo 5 MB)');
    expect(p.element.textContent).toContain('Si es tu primer pago, el cupo se verifica y se aparta al recibir el comprobante, antes de aceptarlo. Si ya no hay cupo, te lo informaremos y no se recibirá el comprobante.');
    expect(p.element.textContent).not.toContain('Código de referencia');
  });

  it('goes back to Mis reservas, and sending the proof opens Comprobante recibido', async () => {
    const p = await transfer();
    expect(Array.from(p.element.querySelectorAll('button'), (b) => flat(b.textContent))).toContain('Volver a mis reservas');
    expect(p.text('.crp-booking-topbar button')).toBe('← Volver a mis reservas');
    const input = p.element.querySelector<HTMLInputElement>('#crp-transfer-proof')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'soporte.pdf', { type: 'application/pdf' })], configurable: true }); input.dispatchEvent(new Event('change'));
    await p.press('Enviar comprobante para validación');
    expect(p.nav.selected()).toBe(PAYMENT_RESULT_AREA.received);
    expect(p.nav.params()).toEqual({ reservation: 'RES-1842' });
  });
});

describe('pago-exitoso.html and pago-fallido.html (screens 22 and 23, PROPUESTO in spec 009-)', () => {
  const summary = (over: Partial<CustomerPaymentSummary> = {}): CustomerPaymentSummary => ({
    reservationId: 'RES-1842', tourName: 'Ruta Andina', departureAt: '2026-09-18T06:30:00', reservationStatus: 'PENDING_PAYMENT', paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER',
    proofStatus: 'EN_VALIDACION', financialStatus: 'SIN_PAGO', validatedCents: 0, balanceCents: 85_000_000, people: 2, deadlineAt: '2026-09-17T06:30:00', ...over });
  const page = <T>(component: Type<T>, list: Observable<readonly CustomerPaymentSummary[]>, params: Record<string, string> = { reservation: 'RES-1842' }) => mount(component, [
    { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') }, { provide: MyPaymentsSource, useValue: { listMine: () => list } },
    { provide: PortalNavigation, useValue: navigationWith([CLIENT_AREA.reservations, CLIENT_AREA.panel, CLIENT_AREA.payments, 'transfer-payment'], params) },
  ]);

  it('registers both as customer pages without menu or chrome of their own, only when Mis pagos exists', () => {
    for (const [key, component] of [[PAYMENT_RESULT_AREA.received, PaymentReceivedPageComponent], [PAYMENT_RESULT_AREA.rejected, PaymentRejectedPageComponent]] as const) {
      expect(PORTAL_AREAS.find((a) => a.key === key)).toMatchObject({ component, audience: 'customer', clientChrome: 'none', menu: false });
    }
  });

  it('Comprobante recibido says the proof is En validación and does not confirm the reservation', async () => {
    const p = await page(PaymentReceivedPageComponent, of([summary()]));
    expect(p.text('h1')).toBe('Comprobante recibido');
    expect(p.text('.crp-result-copy')).toBe('Recibimos tu comprobante y quedó En validación. Esto no confirma tu reserva: un usuario del operador con el permiso Validar comprobantes lo revisará en un plazo máximo de 24 horas corridas. La reserva se confirma solo cuando el pago sea validado.');
    expect(Array.from(p.element.querySelectorAll('.crp-result-ref'), (r) => flat(r.textContent))).toEqual([
      'Reserva: #RES-1842', 'Estado del comprobante: En validación', 'Estado de la reserva: Pendiente de pago', 'Situación financiera: Sin pago']);
    expect(p.text('.crp-result-deadline')).toBe('Plazo de pago vigente hasta 17 sep 2026 · 06:30. Si presentaste el comprobante dentro del plazo, la reserva no se cancela mientras esté En validación.');
    expect(p.element.textContent).not.toMatch(/PENDING_PAYMENT|EN_VALIDACION|SIN_PAGO/);
    await p.press('Ver mis reservas');
    expect(TestBed.inject(PortalNavigation).selected()).toBe(CLIENT_AREA.reservations);
  });

  it('Comprobante recibido of an unknown reservation says so, and failures offer Reintentar', async () => {
    const p = await page(PaymentReceivedPageComponent, of([]));
    expect(p.text('h1')).toBe('No encontramos la reserva');
    expect(p.element.textContent).toContain('Entra desde Mis reservas para consultar el estado de tus comprobantes.');
    TestBed.resetTestingModule();
    const failed = await page(PaymentReceivedPageComponent, throwError(() => new Error('down')));
    expect(failed.element.querySelector('[data-state="error"]')?.textContent).toContain('Reintentar');
  });

  it('Comprobante rechazado shows the reason and the balance, and Presentar nuevo comprobante returns to screen 24', async () => {
    const rejected = summary({ proofStatus: 'RECHAZADO', receipts: [{ support: 'a.pdf', amountCents: 1, status: 'RECHAZADO', rejectionReason: 'El monto no coincide.' }] });
    const p = await page(PaymentRejectedPageComponent, of([rejected]));
    expect(p.text('h1')).toBe('Comprobante rechazado');
    expect(p.text('.crp-result-copy')).toBe('Tu comprobante fue rechazado por el operador. Tu reserva conserva sus pagos ya validados y, mientras el plazo de pago original siga vigente, puedes presentar un nuevo comprobante sobre esta misma reserva.');
    expect(Array.from(p.element.querySelectorAll('.crp-result-ref'), (r) => flat(r.textContent))).toEqual([
      'Reserva: #RES-1842', 'Estado: Comprobante Rechazado · Reserva Pendiente de pago', 'Motivo del rechazo: El monto no coincide.', 'Saldo pendiente: $850.000']);
    await p.press('Presentar nuevo comprobante');
    const nav = TestBed.inject(PortalNavigation);
    expect(nav.selected()).toBe('transfer-payment');
    expect(nav.params()).toEqual({ reservation: 'RES-1842', type: 'TOTAL', amount: '85000000' });
  });

  it('Comprobante rechazado without a rejected proof sends the customer to Mis pagos', async () => {
    const p = await page(PaymentRejectedPageComponent, of([summary()]));
    expect(p.text('h1')).toBe('Sin comprobantes rechazados');
    expect(p.element.textContent).toContain('No tienes comprobantes rechazados pendientes de subsanar. Consulta el estado de tus comprobantes en Mis pagos.');
    await p.press('Ir a mis pagos');
    expect(TestBed.inject(PortalNavigation).selected()).toBe(CLIENT_AREA.payments);
    void vi;
  });
});

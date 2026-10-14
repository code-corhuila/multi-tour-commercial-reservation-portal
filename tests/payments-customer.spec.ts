import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods, selfServiceDemoProviders } from '../src/app/demo/self-service-reservation-demo';
import { CheckoutPaymentBlockComponent } from '../src/app/payments/components/checkout-payment-block.component';
import { TransferPaymentPageComponent } from '../src/app/payments/pages/transfer-payment-page.component';
import { CLIENT_AREA, PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { PaymentMethodsSource, ReservationRequester } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { CustomerReservation } from '../src/app/self-service-reservation/model/self-service-reservation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { TRANSFER_PAYMENT_LINES, contribute } from '../src/app/shared/portal-slots';
import type { MountProps } from '../src/app/shell-contract';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';
import { ControllableMyReservationsSource, QUOTE, SELECTION, reservationFor } from './self-service-reservation.double';

// HU-COM-009, customer part (spec 009-, T-01 to T-03, T-07, T-08): the method block of 21 (CHECKOUT_BLOCKS) and screen 24.
// Seeded: RES-1842 belongs to the demo final customer (Laura Gómez), Pago total · Transferencia, $850.000; RES-1841 to another customer.
const pdf = (name = 'soporte.pdf', size = 1024) => Object.defineProperty(new File(['x'], name, { type: 'application/pdf' }), 'size', { value: size });
const demoQuery = (query = '') => history.replaceState(null, '', `/platform/areas/commercial-reservation-portal${query}`);
const navigationWith = (params: Record<string, string>) => { const nav = new PortalNavigation(); nav.params.set(params); return nav; };

afterEach(() => { TestBed.resetTestingModule(); demoQuery(); });

describe('the Método y plazo de pago block of 21', () => {
  async function blockOf(reservation: CustomerReservation | null, methods: PaymentMethodsSource = new DemoPaymentMethods(), method = '') {
    const navigation = new PortalNavigation(), open = vi.spyOn(navigation, 'open').mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [{ provide: PaymentMethodsSource, useValue: methods }, { provide: PortalNavigation, useValue: navigation }] });
    const fixture = TestBed.createComponent(CheckoutPaymentBlockComponent);
    fixture.componentRef.setInput('quote', QUOTE); fixture.componentRef.setInput('reservation', reservation); fixture.componentRef.setInput('method', method);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle();
    const element: HTMLElement = fixture.nativeElement;
    const button = (text: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    const choose = async (code: string) => { element.querySelector<HTMLInputElement>(`input[name="paymentType"][value="${code}"]`)!.click(); await settle(); };
    const type = async (value: string) => { const i = element.querySelector<HTMLInputElement>('[name="deposit"]')!; i.value = value; i.dispatchEvent(new Event('input')); await settle(); };
    return { element, settle, button, choose, type, open };
  }
  const created = (paymentMethod?: string): CustomerReservation => ({ ...reservationFor(SELECTION, 'RES-1843'), paymentMethod });

  it('methodBlockOffersOnlyEnabledTypesAndMethods: the enabled types with the texts of the mockup, the first one chosen', async () => {
    const { element } = await blockOf(null);
    expect(element.querySelector('h2')?.textContent).toBe('Método y plazo de pago');
    const options = Array.from(element.querySelectorAll('label.crp-checkout-option'), (l) => l.textContent?.replace(/\s+/g, ' ').trim());
    expect(options).toEqual(['Pago total Completa el valor final de la reserva.',
      'Abono Confirma según el abono mínimo parametrizado y conserva el saldo pendiente.']);
    expect(element.querySelector<HTMLInputElement>('input[value="TOTAL"]')?.checked).toBe(true);
    expect(element.querySelector('[name="deposit"]')).toBeNull();
    expect(element.textContent).not.toMatch(/Continuar al pago|plazo máximo/i);
  });

  it('asks for the Monto a abonar only for an Abono, with the hint of the mockup', async () => {
    const { element, choose } = await blockOf(null);
    await choose('PARTIAL');
    expect(element.querySelector('label[for="crp-checkout-deposit"]')?.textContent).toBe('Monto a abonar');
    expect(element.textContent).toContain('El abono mínimo se calcula sobre el valor final después de aplicar descuentos.');
  });

  it('cashChosenByTheCustomerSaysTheOfficeRegistersIt, with no proof and no payment step (DP-PY6)', async () => {
    const { element, button } = await blockOf(created('CASH_AT_OFFICE'));
    expect(element.textContent).toContain('El pago en efectivo será registrado por el equipo del operador.');
    expect(element.textContent).toContain('El pago en efectivo no confirma la reserva hasta que el dinero sea recibido y registrado por el equipo del operador.');
    expect(button('Continuar al pago')).toBeUndefined();
    expect(element.querySelector('input[type="file"]')).toBeNull();
  });

  it('showsTheMediumNotesAsSoonAsTheMediumIsChosen, before the reservation exists (AC-PY.2, mockup app.js 1953-1956)', async () => {
    const none = await blockOf(null);
    expect(none.element.textContent).not.toMatch(/El pago en efectivo|La transferencia queda pendiente/);
    TestBed.resetTestingModule();
    const cash = await blockOf(null, new DemoPaymentMethods(), 'CASH_AT_OFFICE');
    expect(cash.element.textContent).toContain('El pago en efectivo será registrado por el equipo del operador.');
    expect(cash.element.textContent).toContain('El pago en efectivo no confirma la reserva hasta que el dinero sea recibido y registrado por el equipo del operador.');
    expect(cash.element.textContent).not.toContain('La transferencia queda pendiente de revisión mediante comprobante.');
    TestBed.resetTestingModule();
    const transfer = await blockOf(null, new DemoPaymentMethods(), 'BANK_TRANSFER');
    expect(transfer.element.textContent).toContain('La transferencia queda pendiente de revisión mediante comprobante.');
    expect(transfer.element.textContent).not.toContain('El pago en efectivo');
    expect(transfer.button('Continuar al pago')).toBeUndefined();
  });

  it('opens screen 24 for a created transfer reservation, with the type and the final value for a Pago total', async () => {
    const { element, button, open, settle } = await blockOf(created('BANK_TRANSFER'));
    expect(element.textContent).toContain('La transferencia queda pendiente de revisión mediante comprobante.');
    button('Continuar al pago')!.click(); await settle();
    expect(open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1843', type: 'TOTAL', amount: String(QUOTE.finalValueCents) });
  });

  it('reads the Monto a abonar in cents and refuses it beside its field when it is missing or above the final value', async () => {
    const { element, button, choose, type, open, settle } = await blockOf(created('BANK_TRANSFER'));
    await choose('PARTIAL');
    for (const wrong of ['', '0', '2078401']) {
      await type(wrong); button('Continuar al pago')!.click(); await settle();
      const field = element.querySelector('[name="deposit"]')!;
      expect(field.getAttribute('aria-invalid'), wrong).toBe('true');
      expect(element.querySelector(`#${field.getAttribute('aria-describedby')}`)?.textContent, wrong)
        .toBe('Ingresa un monto de abono válido (mayor a cero y hasta el valor final).');
    }
    expect(open).not.toHaveBeenCalled();
    await type('300000.07'); button('Continuar al pago')!.click(); await settle();
    expect(open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1843', type: 'PARTIAL', amount: '30000007' });
  });

  it('everyPaymentScreenShowsOneOfTheFourStates: Reintentar when the enabled types fail', async () => {
    let calls = 0;
    const flaky = new (class extends DemoPaymentMethods {
      override listTypes() { calls += 1; return calls === 1 ? throwError(() => new Error('down')) : super.listTypes(); }
    })();
    const { element, button, settle } = await blockOf(null, flaky);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudo completar la solicitud.');
    button('Reintentar')!.click(); await settle();
    expect(element.querySelectorAll('input[name="paymentType"]')).toHaveLength(2);
  });
});

describe('screen 24, Pago por transferencia', () => {
  function providers(params: Record<string, string>, over: unknown[] = [], keys = new ControllableIdempotencyKeys()) {
    return [
      { provide: ActorContext, useValue: actorAs('READ_ONLY') },
      { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) },
      { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
      ...reservationDemoProviders(), ...selfServiceDemoProviders(), ...paymentsDemoProviders(),
      { provide: IdempotencyKeys, useValue: keys },
      { provide: PortalNavigation, useValue: navigationWith(params) },
      ...over,
    ];
  }
  const TOTAL = { reservation: 'RES-1842', type: 'TOTAL', amount: '85000000' };
  async function transferOf(params: Record<string, string> = TOTAL, over: unknown[] = []) {
    const view = await screenOf(TransferPaymentPageComponent, providers(params, over));
    const attach = async (file: File) => {
      const i = view.element.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(i, 'files', { value: [file], configurable: true }); i.dispatchEvent(new Event('change')); await view.settle();
    };
    const stored = async (id = 'RES-1842') => (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === id)!;
    return { ...view, attach, stored, feedback: () => view.element.querySelector('#crp-transfer-proof-feedback')?.textContent?.trim() };
  }

  it('everyPaymentScreenShowsOneOfTheFourStates', async () => {
    const mine = new ControllableMyReservationsSource();
    const { element, settle, click } = await transferOf(TOTAL, [{ provide: MyReservationsSource, useValue: mine }]);
    expect(element.querySelector('[data-state="loading"]')).not.toBeNull();
    mine.requests[0].fail(); await settle();
    expect(element.querySelector('[data-state="error"]')).not.toBeNull();
    await click('Reintentar'); mine.requests[1].reply([]); await settle();
    expect(element.querySelector('[data-state="empty"]')?.textContent).toContain('No hay una reserva pendiente de transferencia.');
    await click('Reintentar'); mine.requests[2].reply([reservationFor(SELECTION, 'RES-1842')]); await settle();
    expect(element.querySelector('[data-state="data"]')?.textContent).toContain('#RES-1842');
  });

  it('draws pago-transferencia.html: alert, Datos bancarios, reference code, proof field and the proof and financial state', async () => {
    const { element } = await transferOf();
    expect(element.querySelector('h1')?.textContent).toBe('Pago por transferencia');
    const text = element.textContent!.replace(/\s+/g, ' ');
    for (const piece of ['Reserva Pendiente de pago', 'Realiza la transferencia y sube obligatoriamente la imagen del comprobante.',
      'Datos bancarios', 'Banco', 'Banco de ejemplo', 'Tipo de cuenta', 'Ahorros', 'Número de cuenta', '000-000-000', 'Titular', 'Travesía Natural',
      'Comprobante obligatorio', 'Código de referencia: #RES-1842', 'Estado del comprobante: Sin comprobante', 'Situación financiera: Sin pago',
      'Enviar comprobante para validación', 'Volver al panel']) {
      expect(text, piece).toContain(piece);
    }
    expect(element.querySelector('label[for="crp-transfer-proof"]')?.textContent).toBe('Imagen del comprobante (PDF, JPG, JPEG o PNG; máximo 5 MB)');
    expect(text).not.toMatch(/24 horas|plazo de pago|PENDING_PAYMENT|SIN_PAGO|undefined/);
  });

  it('a customer reaches only their own reservations: another one gets the empty state (AC-PY.9)', async () => {
    const { element } = await transferOf({ reservation: 'RES-1841', type: 'TOTAL', amount: '100' });
    expect(element.querySelector('[data-state="empty"]')).not.toBeNull();
    expect(element.textContent).not.toContain('RES-1841');
  });

  it('missingAmountOrProofIsShownBesideItsFieldAndNothingIsSent, and proofOfAnotherTypeOrAbove5MbIsRejectedBeforeStoring', async () => {
    const { element, click, attach, stored, feedback } = await transferOf();
    await click('Enviar comprobante para validación');
    expect(feedback()).toBe('Selecciona un comprobante para continuar.');
    expect(element.querySelector('#crp-transfer-proof')?.getAttribute('aria-invalid')).toBe('true');
    await attach(pdf('soporte.pdf', 6 * 1024 * 1024));
    expect(feedback()).toBe('El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.');
    await click('Enviar comprobante para validación');
    expect((await stored()).payments ?? []).toHaveLength(0);
    await attach(pdf());
    expect(feedback()).toBe('Archivo válido. El comprobante quedará En validación hasta su revisión.');
  });

  it('customerTransferLeavesThePaymentPendingAndTheReservationUnchanged, shows the customer as who registered it and goes to the panel', async () => {
    const { attach, click, stored } = await transferOf({ reservation: 'RES-1842', type: 'PARTIAL', amount: '30000000' });
    const before = await stored(), open = vi.spyOn(TestBed.inject(PortalNavigation), 'open');
    await attach(pdf()); await click('Enviar comprobante para validación');
    const after = await stored();
    expect(after.payments).toEqual([expect.objectContaining({ amountCents: 30_000_000, method: 'BANK_TRANSFER', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)' })]);
    expect(after).toMatchObject({ status: before.status, financialStatus: before.financialStatus, balanceCents: before.balanceCents, paymentType: 'TOTAL' });
    expect(open).toHaveBeenCalledWith(CLIENT_AREA.panel);
  });

  it('a double click sends one proof under one key', async () => {
    const { element, attach, settle, stored } = await transferOf();
    await attach(pdf());
    const send = Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Enviar comprobante para validación')!;
    send.click(); send.click(); await settle();
    expect((await stored()).payments).toHaveLength(1);
  });

  it('says why when the departure already started (AC-PY.7)', async () => {
    demoQuery('?demoNow=2026-11-07T09:00:00-05:00');
    const { element, attach, click, stored } = await transferOf();
    await attach(pdf()); await click('Enviar comprobante para validación');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Se alcanzó la hora programada de inicio');
    expect((await stored()).payments ?? []).toHaveLength(0);
  });

  it('offers TRANSFER_PAYMENT_LINES in Comprobante obligatorio', async () => {
    @Component({ selector: 'crp-test-line', template: '<p>Línea {{ reservationId() }}</p>' })
    class LineDouble { readonly reservationId = input<string>(); }
    const { element } = await transferOf(TOTAL, [contribute(TRANSFER_PAYMENT_LINES, { component: LineDouble, order: 1 })]);
    expect(element.querySelector('.crp-transfer-proof crp-test-line')?.textContent).toBe('Línea RES-1842');
  });
});

describe('customer payment wiring', () => {
  it('registers screen 24 as a customer flow page with no menu item', () => {
    expect(PORTAL_AREAS.find((area) => area.key === 'transfer-payment'))
      .toMatchObject({ label: 'Pago por transferencia', audience: 'customer', clientChrome: 'none', menu: false });
  });

  it('keeps the method chosen on 21 with the reservation, so 13 and 24 read it (DP-PY3)', async () => {
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) },
      { provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, ...reservationDemoProviders(), ...selfServiceDemoProviders(),
    ] });
    const created = await firstValueFrom(TestBed.inject(ReservationRequester).request({ departureId: 'demo-dep-1', serviceIds: ['demo-svc-1'], people: 1 }, 'CASH_AT_OFFICE', 'k-1'));
    expect(created.paymentMethod).toBe('CASH_AT_OFFICE');
    const stored = (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === created.reservationId);
    expect(stored?.paymentMethod).toBe('CASH_AT_OFFICE');
  });

  it('page 21 hands the chosen medium to the block, which shows its note before Confirmar reserva (AC-PY.2)', async () => {
    const fresh = [{ provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, ...reservationDemoProviders(), ...selfServiceDemoProviders(), ...paymentsDemoProviders()];
    const host = document.createElement('div'); document.body.append(host);
    const props = { apiClient: { request: vi.fn() }, session: { roles: ['FINAL_CUSTOMER'], open: () => undefined, close: () => undefined },
      initialParams: { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' } } as unknown as MountProps;
    const cleanup = entry.mountWith(host, props, () => fresh);
    try {
      await vi.waitFor(() => expect(host.querySelector('app-confirm-reservation-page [data-state="data"]')).toBeTruthy());
      await vi.waitFor(() => expect(host.querySelector('.crp-checkout-payment input[name="paymentType"]')).toBeTruthy());
      expect(host.querySelector('.crp-checkout-payment')?.textContent).not.toContain('El pago en efectivo no confirma la reserva');
      const method = host.querySelector<HTMLSelectElement>('#self-service-method')!;
      method.value = 'CASH_AT_OFFICE'; method.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(host.querySelector('.crp-checkout-payment')?.textContent)
        .toContain('El pago en efectivo no confirma la reserva hasta que el dinero sea recibido y registrado por el equipo del operador.'));
      expect(host.querySelector('.self-service-created')).toBeNull();
    } finally { cleanup(); host.remove(); }
  });

  it('goes from 21 to 24 and sends the proof in the demo module, over the one store the operator reads', async () => {
    // Fresh demo stores: the page store of sources.demo.ts is shared with other files of the run (oncePerPage).
    const fresh = [{ provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, ...reservationDemoProviders(), ...selfServiceDemoProviders(), ...paymentsDemoProviders()];
    const host = document.createElement('div'); document.body.append(host);
    const props = { apiClient: { request: vi.fn() }, session: { roles: ['FINAL_CUSTOMER'], open: () => undefined, close: () => undefined },
      initialParams: { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' } } as unknown as MountProps;
    const cleanup = entry.mountWith(host, props, () => fresh);
    try {
      const press = (text: string) => {
        const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
        if (!found) throw new Error(`no ${text} in ${host.textContent}`);
        found.click();
      };
      await vi.waitFor(() => expect(host.querySelector('app-confirm-reservation-page [data-state="data"]')).toBeTruthy());
      const method = host.querySelector<HTMLSelectElement>('#self-service-method')!;
      method.value = 'BANK_TRANSFER'; method.dispatchEvent(new Event('change'));
      host.querySelector<HTMLInputElement>('[name="conditions"]')!.click(); host.querySelector<HTMLInputElement>('[name="terms"]')!.click();
      press('Confirmar reserva');
      await vi.waitFor(() => expect(host.querySelector('.self-service-created')?.textContent).toContain('RES-1843'));
      await vi.waitFor(() => press('Continuar al pago'));
      await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('Pago por transferencia'));
      const proof = host.querySelector<HTMLInputElement>('#crp-transfer-proof')!;
      Object.defineProperty(proof, 'files', { value: [pdf()], configurable: true }); proof.dispatchEvent(new Event('change'));
      press('Enviar comprobante para validación');
      // 24 then opens the panel, which here goes back to 21 because the mount still carries the selection (008-).
      await vi.waitFor(() => expect(host.querySelector('app-transfer-payment-page')).toBeNull());
      const store = fresh.find((p) => (p as { provide?: unknown }).provide === ReservationsSource) as { useValue: ReservationsSource };
      const created = (await firstValueFrom(store.useValue.list())).find((r) => r.id === 'RES-1843')!;
      expect(created).toMatchObject({ paymentMethod: 'BANK_TRANSFER', paymentType: 'TOTAL', status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO' });
      expect(created.payments).toEqual([expect.objectContaining({ amountCents: created.quote.finalCents, proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)' })]);
    } finally { cleanup(); host.remove(); }
  });
});

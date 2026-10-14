import { readFileSync } from 'node:fs';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { DemoReservationsStore, reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PAYMENTS_DETAIL_BLOCK } from '../src/app/payments/components/reservation-payments-block.component';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { PaymentManagementPageComponent } from '../src/app/payments/pages/payment-management-page.component';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { PAYMENT_MANAGEMENT_ACTIONS, RESERVATION_DETAIL_BLOCKS, contribute } from '../src/app/shared/portal-slots';
import type { MountProps } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { ControllableReservations, reservationOf, screenOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

// HU-COM-009, operator part (spec 009-, tasks T-01 to T-08): screens 10A, 10C and 13 over the one demo store of HU-COM-007.
// Seeded: RES-1842 Pago total · Transferencia (Tatacoa, 07 nov 2026) and RES-1841 Abono · Efectivo (Pitalito, 2 seats, 1 traveler).
const TRANSFER = 'RES-1842';
const CASH = 'RES-1841';
const pdf = (name = 'soporte.pdf', size = 1024) => Object.defineProperty(new File(['x'], name, { type: 'application/pdf' }), 'size', { value: size });
const navigationTo = (reservation: string) => { const nav = new PortalNavigation(); nav.params.set({ reservation }); return nav; };
/** The e2e hook of the demo build (multi-agents e2e README 2.3): ?demoFixtures=a,b and ?demoNow=<ISO> on the area address. */
const demoQuery = (query = '') => history.replaceState(null, '', `/platform/areas/commercial-reservation-portal${query}`);

function demoProviders(role = 'TENANT_ADMINISTRATOR', reservation = TRANSFER, keys = new ControllableIdempotencyKeys()) {
  return [
    { provide: ActorContext, useValue: actorAs(role as never) },
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(),
    ...paymentsDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: PortalNavigation, useValue: navigationTo(reservation) },
  ];
}
const stored = async (id: string) => (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === id)!;
const register = (reservationId: string, amountCents: number, proof: File | null, key: string) =>
  firstValueFrom(TestBed.inject(PaymentsWriter).register({ reservationId, amountCents, proof }, key));
const refusal = (call: Promise<unknown>) => call.then(() => { throw new Error('accepted'); }, (e: { userMessage: string }) => e.userMessage);

async function managementOf(role = 'TENANT_ADMINISTRATOR', reservation = TRANSFER, extra: unknown[] = []) {
  const view = await screenOf(PaymentManagementPageComponent, [...demoProviders(role, reservation), ...extra]);
  const attach = async (file: File) => {
    const input = view.element.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change')); await view.settle();
  };
  const submit = () => view.element.querySelector<HTMLButtonElement>('button[type="submit"]');
  return { ...view, attach, submit };
}

afterEach(() => { TestBed.resetTestingModule(); demoQuery(); });

describe('operatorPaymentChangesNoStateOrFinancialSituation (AC-PY.1, RN-PY1)', () => {
  it('appends a payment pending validation, holds the seat and leaves the state, the financial situation and the balance alone', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    const before = await stored(TRANSFER);
    const after = await register(TRANSFER, 30_000_000, pdf(), 'k-1');
    expect(after.payments).toHaveLength(1);
    expect(after.payments![0]).toMatchObject({ amountCents: 30_000_000, method: 'BANK_TRANSFER', proofStatus: 'EN_VALIDACION', proofName: 'soporte.pdf' });
    expect(after).toMatchObject({ status: before.status, financialStatus: before.financialStatus, balanceCents: before.balanceCents, seatHeld: true });
    expect(await stored(TRANSFER)).toEqual(after);
  });
});

describe('aRetriedRegistrationReusesItsIdempotencyKey (AC-PY.11)', () => {
  it('answers the same key with the same payment, and a click after success creates no second payment', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    const first = await register(CASH, 5_000_000, null, 'k-1');
    const again = await register(CASH, 5_000_000, null, 'k-1');
    expect(again).toEqual(first);
    expect((await stored(CASH)).payments).toHaveLength(1);
  });
});

describe('proofOfAnotherTypeOrAbove5MbIsRejectedBeforeStoring (AC-PY.3, RN-PY3)', () => {
  it('refuses a gif and a 6 MB pdf in the writer, with the message of the story', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    const message = 'El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.';
    expect(await refusal(register(TRANSFER, 100, new File(['x'], 'soporte.gif', { type: 'image/gif' }), 'k-1'))).toBe(message);
    expect(await refusal(register(TRANSFER, 100, pdf('soporte.pdf', 6 * 1024 * 1024), 'k-2'))).toBe(message);
    expect((await stored(TRANSFER)).payments ?? []).toHaveLength(0);
  });

  it('refuses them in the form too, beside the proof field, sending nothing', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    await type('amount', '300000'); await attach(new File(['x'], 'soporte.gif', { type: 'image/gif' })); submit()!.click(); await settle();
    const input = element.querySelector('input[type="file"]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain('PDF, JPG, JPEG o PNG');
    expect((await stored(TRANSFER)).payments ?? []).toHaveLength(0);
  });
});

describe('cashWithoutAnOpenCashSessionIsRejected (AC-PY.4, RN-PY4)', () => {
  it('registers nothing and says why when the demo asks for a closed cash session', async () => {
    demoQuery('?demoFixtures=closed-cash-session');
    const { element, type, click } = await managementOf('TENANT_ADMINISTRATOR', CASH);
    await type('amount', '50000'); await click('Registrar pago recibido');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No hay una sesión de caja abierta');
    expect((await stored(CASH)).payments ?? []).toHaveLength(0);
  });
});

describe('the seat is taken with the first payment (AC-PY.5, AC-PY.6, RN-PY5)', () => {
  const onPitalito = (id: string, people = 1): Reservation =>
    ({ ...reservationOf(id), departureId: 'demo-dep-2', people, paymentType: 'TOTAL', paymentMethod: 'CASH_AT_OFFICE' });

  it('secondAttemptForTheLastSeatGetsNoAvailability', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    const store = TestBed.inject(ReservationsSource) as DemoReservationsStore;
    store.items = [...store.items, onPitalito('RES-A'), onPitalito('RES-B')];
    await register(CASH, 100, null, 'k-1');
    await register('RES-A', 100, null, 'k-2');
    expect(await refusal(register('RES-B', 100, null, 'k-3'))).toContain('no tiene cupo suficiente');
    expect((await stored('RES-B')).payments ?? []).toHaveLength(0);
    expect((await stored('RES-B')).seatHeld).toBe(false);
  });

  it('firstPaymentWithoutAvailabilityRegistersNothing, while a later payment of a held seat is accepted', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    const store = TestBed.inject(ReservationsSource) as DemoReservationsStore;
    store.items = [...store.items, onPitalito('RES-A', 2)];
    await register(CASH, 100, null, 'k-1');
    expect(await refusal(register('RES-A', 100, null, 'k-2'))).toContain('no tiene cupo suficiente');
    expect((await register(CASH, 100, null, 'k-3')).payments).toHaveLength(2);
  });

  it('refuses the first payment when the demo asks for a full departure', async () => {
    demoQuery('?demoFixtures=full-departure');
    TestBed.configureTestingModule({ providers: demoProviders() });
    expect(await refusal(register(TRANSFER, 100, pdf(), 'k-1'))).toContain('no tiene cupo suficiente');
  });
});

describe('noPaymentOrProofFromTheScheduledStart (AC-PY.7, RN-PY6)', () => {
  it('refuses a payment and a proof once the departure started, by the demo clock, and accepts them the day before', async () => {
    demoQuery('?demoNow=2026-11-07T08:00:00-05:00');
    TestBed.configureTestingModule({ providers: demoProviders() });
    expect(await refusal(register(TRANSFER, 100, pdf(), 'k-1'))).toBe('La salida ya inició: no se aceptan pagos ni comprobantes.');
    expect((await stored(TRANSFER)).payments ?? []).toHaveLength(0);
    demoQuery('?demoNow=2026-11-06T20:00:00-05:00');
    expect((await register(TRANSFER, 100, pdf(), 'k-2')).payments).toHaveLength(1);
  });

  it('says why on screen 13', async () => {
    demoQuery('?demoNow=2026-11-20T08:00:00-05:00');
    const { element, type, click } = await managementOf('TENANT_ADMINISTRATOR', CASH);
    await type('amount', '50000'); await click('Registrar pago recibido');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Se alcanzó la hora programada de inicio');
  });
});

describe('screen 13, Gestión de pago', () => {
  it('everyPaymentScreenShowsOneOfTheFourStates', async () => {
    const reservations = new ControllableReservations();
    const { element, settle, click } = await screenOf(PaymentManagementPageComponent, [...demoProviders(), { provide: ReservationsSource, useValue: reservations }]);
    expect(element.querySelector('[data-state="loading"]')).not.toBeNull();
    reservations.inner.requests[0].fail(); await settle();
    expect(element.querySelector('[data-state="error"]')).not.toBeNull();
    await click('Reintentar'); reservations.inner.requests[1].reply([reservationOf('RES-9')]); await settle();
    expect(element.querySelector('[data-state="empty"]')?.textContent).toContain('No se encontró la reserva seleccionada');
    await click('Reintentar'); reservations.inner.requests[2].reply([reservationOf(TRANSFER)]); await settle();
    expect(element.querySelector('[data-state="data"]')?.textContent).toContain(`#${TRANSFER}`);
  });

  it('draws the header, the payment information with the reservation Modalidad as Tipo · Medio and no selector (T-02)', async () => {
    const { element } = await managementOf();
    expect(element.querySelector('h1')?.textContent).toContain('Gestión de pago');
    const text = element.textContent!;
    for (const label of ['Seguimiento de reserva', 'Información de pago', 'Pago total · Transferencia', 'Estado del comprobante', 'Sin comprobante',
      'Situación financiera', 'Sin pago', 'Estado económico', 'Valor final', 'Saldo pendiente', '$850.000', 'Acción de pago', 'Laura Gómez (demo)',
      'Registra el pago de esta reserva', 'El comprobante no es ingreso de caja hasta su validación y la reserva permanece Pendiente de pago']) {
      expect(text, label).toContain(label);
    }
    expect(element.querySelector('select')).toBeNull();
    expect(element.querySelector('label[for="crp-payments-proof"]')?.textContent).toContain('Comprobante de transferencia');
    expect(element.querySelector('label[for="crp-payments-amount"]')?.textContent).toContain('Monto recibido');
  });

  it('names the action by the modality: Registrar comprobante, Registrar abono or Registrar pago', async () => {
    expect((await managementOf()).submit()?.textContent?.trim()).toBe('Registrar comprobante');
    TestBed.resetTestingModule();
    const cash = await managementOf('TENANT_ADMINISTRATOR', CASH);
    expect(cash.submit()?.textContent?.trim()).toBe('Registrar pago recibido');
    expect(cash.element.querySelector('input[type="file"]')).toBeNull();
    expect(cash.element.textContent).toContain('Abono · Efectivo');
  });

  it('never says that registering updates the payment state or the balance (RN-PY1)', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    expect(element.textContent).not.toMatch(/actualizar el estado de pago|Confirmada con pago completo/);
    await type('amount', '300000'); await attach(pdf()); submit()!.click(); await settle();
    expect(element.querySelector('[role="status"].crp-payments-feedback')?.textContent)
      .toBe('Comprobante registrado en nombre del cliente. Queda En validación y la reserva sigue Pendiente de pago hasta su aprobación.');
  });

  it('refuses to register on a reservation without a modality, with the message of the mockup', async () => {
    const reservations = new DemoReservationsStore([reservationOf('RES-77', { departureId: 'demo-dep-1' })]);
    const { element, submit } = await managementOf('TENANT_ADMINISTRATOR', 'RES-77', [{ provide: ReservationsSource, useValue: reservations }]);
    expect(element.textContent).toContain('Sin modalidad definida');
    expect(element.textContent).toContain('No hay un medio de pago definido para esta reserva. Defínelo antes de registrar dinero.');
    expect(submit()?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')?.disabled).toBe(true);
  });

  it('missingAmountOrProofIsShownBesideItsFieldAndNothingIsSent (AC-PY.10)', async () => {
    const { element, submit, settle } = await managementOf();
    submit()!.click(); await settle();
    const messages: Record<string, string> = { amount: 'Registra un monto mayor a $0.', proof: 'Adjunta el comprobante de transferencia para enviarlo a validación.' };
    for (const name of ['amount', 'proof']) {
      const field = element.querySelector(`[name="${name}"]`)!;
      expect(field.getAttribute('aria-invalid'), name).toBe('true');
      expect(element.querySelector(`#${field.getAttribute('aria-describedby')}`)?.textContent?.trim(), name).toBe(messages[name]);
    }
    expect(document.activeElement).toBe(element.querySelector('[name="amount"]'));
    expect((await stored(TRANSFER)).payments ?? []).toHaveLength(0);
  });

  it('amountTextIsReadInCents (0.07 is 7 cents) and the payment stays pending, the proof En validación (AC-PY.1)', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    await type('amount', '0.07'); await attach(pdf()); submit()!.click(); await settle();
    const r = await stored(TRANSFER);
    expect(r.payments![0].amountCents).toBe(7);
    expect(r.status).toBe('PENDIENTE_DE_PAGO');
    expect(element.textContent).toContain('En validación');
    expect(element.textContent).toContain('Pendiente de pago');
  });

  it('a double click registers one payment under one key, and a click after success none', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    await type('amount', '300000'); await attach(pdf());
    submit()!.click(); submit()!.click(); await settle();
    submit()!.click(); await settle();
    expect((await stored(TRANSFER)).payments).toHaveLength(1);
    expect(element.querySelectorAll('.crp-payments-lines li')).toHaveLength(1);
  });

  it('paymentLineShowsTheUserWhoRegisteredIt (AC-PY.8)', async () => {
    const { element, type, click } = await managementOf('OPERATIONAL_COLLABORATOR', CASH);
    await type('amount', '300000'); await click('Registrar pago recibido');
    const line = element.querySelector('.crp-payments-lines li')?.textContent;
    expect(line).toContain('$300.000');
    expect(line).toContain('Registrado por Colaborador operativo (demo)');
  });

  it('paymentManagementDrawsNoValidateOrRejectAction, and offers PAYMENT_MANAGEMENT_ACTIONS in Acción de pago', async () => {
    const plain = await managementOf();
    expect(plain.element.textContent).not.toMatch(/Validar comprobante|Rechazar comprobante|24 horas|Historial/);
    TestBed.resetTestingModule();
    @Component({ selector: 'crp-test-action', template: '<button type="button">Acción {{ reservation()?.id }}</button>' })
    class ActionDouble { readonly reservation = input<Reservation>(); }
    const { element } = await managementOf('TENANT_ADMINISTRATOR', TRANSFER, [contribute(PAYMENT_MANAGEMENT_ACTIONS, { component: ActionDouble, order: 1 })]);
    expect(element.querySelector('.crp-payments-action crp-test-action')?.textContent?.trim()).toBe(`Acción ${TRANSFER}`);
  });

  it('readOnlyAndUnknownRolesGetNoRegisterAction (AC-PY.9)', async () => {
    for (const role of ['MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'SOMETHING_ELSE']) {
      const { element, button, submit } = await managementOf(role);
      expect(element.querySelector('form'), role).toBeNull();
      expect(submit(), role).toBeNull();
      expect(button('Volver a la reserva'), role).toBeDefined();
      TestBed.resetTestingModule();
    }
  });

  it('paymentTextsAreSpanishWithAccentsAndNoRawCodes', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    await type('amount', '300000'); await attach(pdf()); submit()!.click(); await settle();
    for (const raw of ['PENDIENTE_DE_PAGO', 'SIN_PAGO', 'EN_VALIDACION', 'BANK_TRANSFER', 'TOTAL', 'demo-dep', 'undefined']) expect(element.textContent).not.toContain(raw);
  });
});

describe('the Pagos y comprobantes block of 10A and the Gestionar pago action of 10C', () => {
  async function viewOf(role: string, fresh: boolean, reservation: Reservation, methods: PaymentMethodsSource = new DemoPaymentMethods()) {
    TestBed.configureTestingModule({ providers: [...demoProviders(role), { provide: PaymentMethodsSource, useValue: methods },
      contribute(RESERVATION_DETAIL_BLOCKS, PAYMENTS_DETAIL_BLOCK)] });
    const fixture = TestBed.createComponent(ReservationViewComponent);
    fixture.componentRef.setInput('reservation', reservation); fixture.componentRef.setInput('fresh', fresh);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle();
    const element: HTMLElement = fixture.nativeElement;
    const press = (text: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    return { element, settle, press, manage: () => press('Gestionar pago') };
  }
  const paid: Reservation = { ...reservationOf(TRANSFER), paymentType: 'PARTIAL', paymentMethod: 'BANK_TRANSFER', validatedCents: 0,
    payments: [{ id: 'p-1', method: 'BANK_TRANSFER', amountCents: 30_000_000, proofName: 'a.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Demo' }] };

  it('draws Tipo, Medio, Estado del comprobante, Situación financiera, Valores validados and Saldo pendiente on 10A', async () => {
    const { element, manage } = await viewOf('TENANT_ADMINISTRATOR', false, paid);
    const block = element.querySelector('.crp-payments-block')!;
    expect(block.textContent).toContain('Pagos y comprobantes');
    expect(block.textContent).toContain('Seguimiento económico');
    expect(Array.from(block.querySelectorAll('th'), (th) => th.textContent?.trim()))
      .toEqual(['Tipo', 'Medio', 'Estado del comprobante', 'Situación financiera', 'Valores validados', 'Saldo pendiente']);
    expect(Array.from(block.querySelectorAll('td'), (td) => td.textContent?.trim())).toEqual(['Abono', 'Transferencia', 'En validación', 'Sin pago', '$0', '$50']);
    expect(manage()).toBeDefined();
  });

  it('offers Reintentar when the enabled types and methods fail to load', async () => {
    let calls = 0;
    const flaky = new (class extends DemoPaymentMethods {
      override listTypes() { calls += 1; if (calls === 1) throw new Error('down'); return super.listTypes(); }
    })();
    const { element, press, settle } = await viewOf('TENANT_ADMINISTRATOR', false, paid, flaky);
    expect(element.querySelector('.crp-payments-block [role="alert"]')?.textContent).toContain('No se pudo completar la solicitud.');
    press('Reintentar')!.click(); await settle();
    expect(element.querySelector('.crp-payments-block td')?.textContent?.trim()).toBe('Abono');
  });

  it('opens screen 13 for the reservation from 10A and from 10C', async () => {
    for (const fresh of [false, true]) {
      const { manage } = await viewOf('OPERATIONAL_COLLABORATOR', fresh, paid);
      const nav = TestBed.inject(PortalNavigation), open = vi.spyOn(nav, 'open');
      manage()!.click();
      expect(open).toHaveBeenCalledWith('payment-management', { reservation: TRANSFER });
      TestBed.resetTestingModule();
    }
  });

  it('offers no Gestionar pago to read-only and unknown roles', async () => {
    for (const role of ['MANAGER', 'ANALYST', 'ACCOUNTANT', 'SOMETHING_ELSE']) {
      const { element, manage } = await viewOf(role, false, paid);
      expect(element.querySelector('.crp-payments-block'), role).not.toBeNull();
      expect(manage(), role).toBeUndefined();
      TestBed.resetTestingModule();
    }
  });
});

describe('payment capabilities and wiring', () => {
  it('lets only the administrator and the collaborator register a payment', () => {
    const allowed = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'SOMETHING_ELSE']
      .filter((role) => PortalCapabilities.for(role).canRegisterPayment());
    expect(allowed).toEqual(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR']);
  });

  it('registers screen 13 as a sub-screen of Reservas, with no sidebar item of its own', () => {
    expect(PORTAL_AREAS.find((area) => area.key === 'payment-management')).toMatchObject({ label: 'Gestión de pago', menu: false, parent: 'reservations' });
  });

  it('portalDeclaresNoHttpClientOfItsOwn covers src/app/payments/', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/payments/'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(withoutComments(readFileSync(file, 'utf8')), file).not.toMatch(/HttpClient|provideHttpClient|fetch\(|XMLHttpRequest|location\./);
  });

  it('registers a payment from 10A in the demo module and goes back to the same 10A, which shows it', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const props = { apiClient: { request: vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } })) },
      session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } } as unknown as MountProps;
    const cleanup = entry.mountWith(host, props, demoSources);
    try {
      const press = (text: string, scope: ParentNode = host) => {
        const found = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
        if (!found) throw new Error(`no ${text} in ${host.textContent}`);
        found.click();
      };
      await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
      expect(Array.from(host.querySelectorAll('nav button'), (b) => b.textContent?.trim())).not.toContain('Gestión de pago');
      // Reservas is the landing of the operator since the mockup v1.9 (AC-P1.17): no click needed.
      await vi.waitFor(() => expect(host.querySelector('[data-state="data"]')?.textContent).toContain(`#${CASH}`));
      press('Ver detalle', Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(`#${CASH}`))!);
      await vi.waitFor(() => expect(host.querySelector('.crp-payments-block')).toBeTruthy());
      press('Gestionar pago');
      await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain('Gestión de pago'));
      expect(host.querySelector('nav .crp-is-active')?.textContent?.trim()).toBe('Reservas');
      const amount = host.querySelector<HTMLInputElement>('[name="amount"]')!;
      amount.value = '50000'; amount.dispatchEvent(new Event('input'));
      press('Registrar pago recibido');
      await vi.waitFor(() => expect(host.querySelector('.crp-payments-lines li')?.textContent).toContain('$50.000'));
      press('Volver a la reserva');
      await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain('Detalle de reserva'));
      expect(host.querySelector('.crp-reservations-detail')?.textContent).toContain(`#${CASH}`);
      await vi.waitFor(() => expect(host.querySelector('.crp-payments-block td:nth-child(3)')?.textContent?.trim()).toBe('Sin comprobante'));
      expect(host.querySelector('.crp-payments-block')?.textContent).toContain('Efectivo');
    } finally { cleanup(); host.remove(); }
  });
});

describe('screen 13 registers money only for a payable reservation (mockup app.js 6700-6744, spec 009- section 5)', () => {
  const CANCELLED_NOTE = 'Esta reserva está cancelada: no se pueden registrar nuevos pagos ni comprobantes. Se conserva la trazabilidad existente.';
  const closedNote = (status: string) => `Esta reserva está en estado "${status}" y ya no admite modificaciones.`;
  const inValidation = (over: Partial<Reservation> = {}) => new DemoReservationsStore([reservationOf('RES-78', { departureId: 'demo-dep-1', paymentType: 'TOTAL',
    paymentMethod: 'BANK_TRANSFER', payments: [{ id: 'p-1', method: 'BANK_TRANSFER', amountCents: 100, proofName: 'a.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Demo' }], ...over })]);

  it('a cancelled reservation (RES-1836) shows Reserva cancelada with the note of the mockup and no form', async () => {
    const { element, button } = await managementOf('TENANT_ADMINISTRATOR', 'RES-1836');
    expect(element.querySelector('.crp-payments-action h2')?.textContent?.trim()).toBe('Reserva cancelada');
    expect(element.querySelector('.crp-payments-action')?.textContent).toContain(CANCELLED_NOTE);
    expect(element.querySelector('form')).toBeNull();
    expect(button('Volver a la reserva')).toBeDefined();
  });

  it('a reservation in execution (RES-1838) or finished (RES-1837) offers no form and says why', async () => {
    for (const [id, status] of [['RES-1838', 'En ejecución'], ['RES-1837', 'Finalizada']]) {
      const { element } = await managementOf('TENANT_ADMINISTRATOR', id);
      expect(element.querySelector('.crp-payments-action')?.textContent, id).toContain(closedNote(status));
      expect(element.querySelector('form'), id).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('a reservation without balance shows Pago registrado and no form', async () => {
    const reservations = new DemoReservationsStore([reservationOf('RES-79', { status: 'CONFIRMADA', balanceCents: 0, paymentType: 'TOTAL', paymentMethod: 'CASH_AT_OFFICE' })]);
    const { element } = await managementOf('TENANT_ADMINISTRATOR', 'RES-79', [{ provide: ReservationsSource, useValue: reservations }]);
    expect(element.querySelector('.crp-payments-action h2')?.textContent?.trim()).toBe('Pago registrado');
    expect(element.textContent).toContain('No existen valores pendientes por registrar para esta reserva.');
    expect(element.querySelector('form')).toBeNull();
  });

  it('the demo writer refuses cancelled, executed, finished and settled reservations, registering nothing', async () => {
    TestBed.configureTestingModule({ providers: demoProviders() });
    expect(await refusal(register('RES-1836', 100, null, 'k-1'))).toBe(CANCELLED_NOTE);
    expect(await refusal(register('RES-1838', 100, null, 'k-2'))).toBe(closedNote('En ejecución'));
    expect(await refusal(register('RES-1837', 100, null, 'k-3'))).toBe(closedNote('Finalizada'));
    for (const id of ['RES-1836', 'RES-1838', 'RES-1837']) expect((await stored(id)).payments ?? [], id).toHaveLength(0);
    const store = TestBed.inject(ReservationsSource) as DemoReservationsStore;
    store.items = [...store.items, reservationOf('RES-79', { status: 'CONFIRMADA', balanceCents: 0, paymentType: 'TOTAL', paymentMethod: 'CASH_AT_OFFICE' })];
    expect(await refusal(register('RES-79', 100, null, 'k-4'))).toBe('No existen valores pendientes por registrar para esta reserva.');
  });

  it('while a transfer proof is En validación the amount, the proof and the action are disabled', async () => {
    const { element, submit } = await managementOf('TENANT_ADMINISTRATOR', 'RES-78', [{ provide: ReservationsSource, useValue: inValidation() }]);
    expect(element.querySelector('.crp-payments-action h2')?.textContent?.trim()).toBe('Registra el pago de esta reserva');
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[name="proof"]')?.disabled).toBe(true);
    expect(submit()?.disabled).toBe(true);
  });

  it('a transfer registered on 13 locks the form at once, as the proof is now En validación', async () => {
    const { element, type, attach, submit, settle } = await managementOf();
    expect(submit()?.disabled).toBe(false);
    await type('amount', '300000'); await attach(pdf()); submit()!.click(); await settle();
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')?.disabled).toBe(true);
    expect(element.querySelector<HTMLInputElement>('[name="proof"]')?.disabled).toBe(true);
    expect(submit()?.disabled).toBe(true);
  });
});

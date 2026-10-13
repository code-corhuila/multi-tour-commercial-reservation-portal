import { Injector, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { DemoMyPayments, myPaymentsDemoProviders } from '../src/app/demo/my-payments-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { selfServiceDemoProviders } from '../src/app/demo/self-service-reservation-demo';
import { ContinuePaymentActionComponent, MY_PAYMENTS_CONTRIBUTIONS, MyPaymentsActionComponent, PaymentNoticesComponent } from '../src/app/my-payments/components/my-payments-panel.component';
import { ReservationEconomicLinesComponent } from '../src/app/my-payments/components/reservation-economic-lines.component';
import { ContinuePaymentTarget, CustomerPaymentSummary, MyPaymentsSource, PaymentNotice } from '../src/app/my-payments/data/my-payments-source';
import { MyPaymentsPageComponent } from '../src/app/my-payments/pages/my-payments-page.component';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { CLIENT_AREA, PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import type { MountProps } from '../src/app/shell-contract';
import { listSourceFiles, withoutComments } from './source-files';

// HU-COM-014 (spec 014-, tasks T-01 to T-05): Mis pagos, the economic lines of Mis reservas and the panel contributions.
// Demo store: RES-1842 belongs to the demo final customer (Laura Gómez), Pendiente de pago, Pago total · Transferencia, $850.000;
// RES-1841 (Mateo Ríos), RES-1839 (Camila Ortega) and RES-1835 (Andrés Pinto) belong to other customers.
// The demo customer also owns RES-1840, RES-1832, RES-1831 and RES-1830, the four situations of the mockup's demo data (app.js 2621-2626).
const SUMMARY: CustomerPaymentSummary = {
  reservationId: 'RES-1842', tourName: 'Desierto de la Tatacoa al atardecer', departureAt: '2026-11-07', reservationStatus: 'PENDING_PAYMENT',
  paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER', proofStatus: 'EN_VALIDACION', financialStatus: 'SIN_PAGO', validatedCents: 0, balanceCents: 85_000_000,
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const pdf = () => Object.defineProperty(new File(['x'], 'soporte.pdf', { type: 'application/pdf' }), 'size', { value: 1024 });

/** The port with the list under the test's control: each read waits for next or error. */
class SourceDouble extends MyPaymentsSource {
  readonly reads: Subject<readonly CustomerPaymentSummary[]>[] = [];
  constructor(private readonly target: ContinuePaymentTarget | null = null, private readonly pending: readonly PaymentNotice[] = []) { super(); }
  override listMine(): Observable<readonly CustomerPaymentSummary[]> { const read = new Subject<readonly CustomerPaymentSummary[]>(); this.reads.push(read); return read; }
  override notices(): Observable<readonly PaymentNotice[]> { return of(this.pending); }
  override continuePaymentTarget(): Observable<ContinuePaymentTarget | null> { return of(this.target); }
}

afterEach(() => TestBed.resetTestingModule());

async function render<T>(component: Type<T>, source: MyPaymentsSource, options: { params?: Record<string, string>; areas?: string[]; roles?: string[] } = {}) {
  const navigation = new PortalNavigation();
  navigation.register(options.areas ?? [CLIENT_AREA.panel, CLIENT_AREA.payments, 'transfer-payment']);
  navigation.params.set(options.params ?? {});
  const open = vi.spyOn(navigation, 'open');
  TestBed.configureTestingModule({ providers: [{ provide: MyPaymentsSource, useValue: source }, { provide: PortalNavigation, useValue: navigation },
    { provide: CustomerContext, useValue: customerContextFor(options.roles ?? ['FINAL_CUSTOMER'], () => undefined) }] });
  const fixture = TestBed.createComponent(component);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  return { host, settle, open, fixture, text: () => flat(host.textContent) };
}

async function pageWith(items: readonly CustomerPaymentSummary[], params: Record<string, string> = {}) {
  const source = new SourceDouble();
  const view = await render(MyPaymentsPageComponent, source, { params });
  source.reads[0].next(items); source.reads[0].complete();
  await view.settle();
  return view;
}

describe('everyMyPaymentsScreenShowsOneOfTheFourStates', () => {
  it('shows loading, then error with a retry, then the empty text of mis-pagos.html, then the data', async () => {
    const source = new SourceDouble();
    const view = await render(MyPaymentsPageComponent, source);
    expect(view.host.querySelector('[data-state="loading"]')?.textContent).toBe('Cargando…');
    source.reads[0].error(new Error('down')); await view.settle();
    const alert = view.host.querySelector('[role="alert"]');
    expect(flat(alert?.textContent)).toBe('No pudimos cargar esta información. Reintentar');
    alert!.querySelector('button')!.click(); await view.settle();
    expect(source.reads).toHaveLength(2);
    source.reads[1].next([]); await view.settle();
    expect(view.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('Todavía no tienes pagos ni reservas registradas.');
  });

  it('draws the header and the section of mis-pagos.html', async () => {
    const view = await pageWith([SUMMARY]);
    expect(view.host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Portal cliente');
    expect(view.host.querySelector('h1')?.textContent).toBe('Mis pagos');
    expect(view.host.querySelector('.crp-page-header-desc')?.textContent)
      .toBe('Consulta pagos, abonos, saldos y soportes de tus reservas propias. Esta consulta no permite validar ni rechazar soportes.');
    expect(view.host.querySelector('h2')?.textContent).toBe('Estado económico de mis reservas');
  });
});

describe('aVisitorInMyPaymentsSeesTheSignInNoticeOfMyReservations', () => {
  it('without a final-customer session, writes the notice of Mis reservas instead of the empty state, and reads nothing', async () => {
    const source = new SourceDouble();
    const view = await render(MyPaymentsPageComponent, source, { roles: ['UNKNOWN'] });
    expect(view.host.querySelector('h1')?.textContent).toBe('Mis pagos');
    expect(view.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Inicia sesión como cliente para ver tus reservas.');
    expect(view.host.querySelector('[data-state]')).toBeNull();
    expect(view.text()).not.toContain('Todavía no tienes pagos ni reservas registradas.');
    expect(source.reads).toHaveLength(0);
  });
});

describe('myPaymentsShowsTypeMethodProofSituationValidatedAndBalance', () => {
  it('draws one card per own reservation with code, tour, departure and the six economic fields, as the port holds them', async () => {
    const view = await pageWith([SUMMARY, { ...SUMMARY, reservationId: 'RES-1850', paymentType: 'PARTIAL', paymentMethod: 'CASH_AT_OFFICE',
      proofStatus: 'SIN_COMPROBANTE', financialStatus: 'PARCIAL', validatedCents: 30_000_000, balanceCents: 11_800_000 }]);
    const cards = Array.from(view.host.querySelectorAll('[data-state="data"] li.crp-my-payments-card'), (card) => flat(card.textContent));
    expect(cards).toEqual([
      'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Tipo: Pago total Medio: Transferencia Comprobante: En validación Situación financiera: Sin pago Valores validados: $0 Saldo pendiente: $850.000',
      'RES-1850 Desierto de la Tatacoa al atardecer 07 nov 2026 Tipo: Abono Medio: Efectivo Comprobante: Sin comprobante Situación financiera: Parcial Valores validados: $300.000 Saldo pendiente: $118.000',
    ]);
    expect(view.host.querySelector('li.crp-my-payments-card h3')?.textContent).toBe('Desierto de la Tatacoa al atardecer');
  });

  it('writes the mockup text for a cancelled reservation without a financial situation, and Por definir for what is missing', async () => {
    const view = await pageWith([{ ...SUMMARY, reservationStatus: 'CANCELLED', paymentType: undefined, paymentMethod: undefined, proofStatus: 'SIN_COMPROBANTE', financialStatus: null }]);
    expect(view.text()).toContain('Tipo: Por definir Medio: Por definir Comprobante: Sin comprobante Situación financiera: No aplica por reserva cancelada');
  });

  it('writes the departure as mis-pagos.html and Mis reservas do: date and time', async () => {
    const view = await pageWith([{ ...SUMMARY, departureAt: '2026-09-18T06:30:00' }]);
    expect(view.text()).toContain('RES-1842 Desierto de la Tatacoa al atardecer 18 sep 2026 · 06:30 Tipo: Pago total');
  });
});

describe('myPaymentsTextsAreSpanishWithAccentsAndNoRawCodes', () => {
  it('never shows a code, an id of the port or an unformatted amount', async () => {
    const view = await pageWith([SUMMARY, { ...SUMMARY, reservationId: 'RES-1851', proofStatus: 'APROBADO', financialStatus: 'PAGO_COMPLETO', paymentType: 'OTRO_TIPO' }]);
    const text = view.text();
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}|PENDING|TOTAL\b|85000000/);
    expect(text).toContain('Comprobante: Aprobado'); expect(text).toContain('Situación financiera: Pago completo'); expect(text).toContain('Tipo: Por definir');
    expect(text).toMatch(/Situación financiera: Sin pago/);
  });
});

describe('anotherCustomersReservationCodeGivesTheEmptyState', () => {
  it('opened with a code that is not among the own reservations, shows the empty state and no field of it', async () => {
    const view = await pageWith([SUMMARY], { reservation: 'RES-1841' });
    expect(view.host.querySelector('[data-state="empty"]')).toBeTruthy();
    expect(view.text()).not.toMatch(/RES-1841|RES-1842|Saldo pendiente:/);
  });

  it('opened with an own code, shows only that reservation', async () => {
    const view = await pageWith([SUMMARY, { ...SUMMARY, reservationId: 'RES-1850' }], { reservation: 'RES-1850' });
    expect(Array.from(view.host.querySelectorAll('li.crp-my-payments-card p:first-child'), (p) => p.textContent)).toEqual(['RES-1850']);
  });

  it('the demo source reads only the reservations of the session customer, and nothing for another standing', async () => {
    const mine = await firstValueFrom(demo().inject(MyPaymentsSource).listMine());
    expect(mine.map((r) => r.reservationId)).toEqual(['RES-1842', 'RES-1840', 'RES-1832', 'RES-1831', 'RES-1830']);
    TestBed.resetTestingModule();
    const visitor = await firstValueFrom(demo(['UNKNOWN']).inject(MyPaymentsSource).listMine());
    expect(visitor).toEqual([]);
  });
});

/** The demo build over fresh stores, as sources.demo.ts registers them. */
function demo(roles: string[] = ['FINAL_CUSTOMER'], seed?: (store: ReservationsSource & { items: Reservation[] }) => void) {
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: customerContextFor(roles, () => undefined) },
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...selfServiceDemoProviders(), ...paymentsDemoProviders(), ...myPaymentsDemoProviders(),
  ] });
  seed?.(TestBed.inject(ReservationsSource) as ReservationsSource & { items: Reservation[] });
  return TestBed;
}

describe('aPaymentRegisteredOn24AppearsInMyPayments', () => {
  it('maps the shared store: no proof first, then the transfer registered through the writer of 009 En validación, values unchanged', async () => {
    const bed = demo();
    expect(bed.inject(MyPaymentsSource)).toBeInstanceOf(DemoMyPayments);
    const before = (await firstValueFrom(bed.inject(MyPaymentsSource).listMine()))[0];
    expect(before).toEqual({ ...SUMMARY, proofStatus: 'SIN_COMPROBANTE' });
    expect(await firstValueFrom(bed.inject(MyPaymentsSource).notices())).toEqual([{ reservationId: 'RES-1840', proofStatus: 'EN_VALIDACION' }]);
    await firstValueFrom(bed.inject(PaymentsWriter).register({ reservationId: 'RES-1842', amountCents: 85_000_000, proof: pdf() }, 'k-1'));
    const after = (await firstValueFrom(bed.inject(MyPaymentsSource).listMine()))[0];
    expect(after).toEqual(SUMMARY);
    expect(await firstValueFrom(bed.inject(MyPaymentsSource).notices()))
      .toEqual([{ reservationId: 'RES-1842', proofStatus: 'EN_VALIDACION' }, { reservationId: 'RES-1840', proofStatus: 'EN_VALIDACION' }]);
  });

  it('reads the cancellation cause the store holds, and no financial situation for a cancelled reservation without validated values', async () => {
    const bed = demo(['FINAL_CUSTOMER'], (store) => {
      store.items = store.items.map((r) => (r.id === 'RES-1842' ? { ...r, status: 'CANCELADA', cancellation: { cause: 'El cliente desiste del viaje (demo)', by: 'x', at: 'y' } } : r));
    });
    const [cancelled] = await firstValueFrom(bed.inject(MyPaymentsSource).listMine());
    expect(cancelled).toMatchObject({ reservationStatus: 'CANCELLED', financialStatus: null, cancellationCause: 'El cliente desiste del viaje (demo)' });
    expect(await firstValueFrom(bed.inject(MyPaymentsSource).continuePaymentTarget())).toBeNull();
  });
});

describe('myReservationsCardAddsTheEconomicLines', () => {
  async function linesOf(summary: CustomerPaymentSummary) {
    const source = new SourceDouble();
    const view = await render(ReservationEconomicLinesComponent, source);
    view.fixture.componentRef.setInput('reservationId', summary.reservationId); await view.settle();
    source.reads.at(-1)!.next([summary]); await view.settle();
    return Array.from(view.host.querySelectorAll('small'), (line) => flat(line.textContent));
  }

  it('adds Tipo de pago · Medio de pago, Estado del comprobante · Situación financiera and Saldo to the card', async () => {
    expect(await linesOf(SUMMARY)).toEqual([
      'Tipo de pago: Pago total · Medio de pago: Transferencia', 'Estado del comprobante: En validación · Situación financiera: Sin pago', 'Saldo: $850.000',
    ]);
  });

  it('adds the cancellation cause and the refund treatment when the store holds them, and drops the situation as the mockup does', async () => {
    expect(await linesOf({ ...SUMMARY, reservationStatus: 'CANCELLED', financialStatus: null, cancellationCause: 'Causal (demo)', refundTreatment: 'Tratamiento (demo)' })).toEqual([
      'Tipo de pago: Pago total · Medio de pago: Transferencia', 'Estado del comprobante: En validación', 'Saldo: $850.000', 'Causal (demo)', 'Tratamiento (demo)',
    ]);
  });

  it('is drawn in each card of Mis reservas of the demo build, only for the own reservations', async () => {
    const { host, cleanup } = mountDemo();
    try {
      await vi.waitFor(() => press(host, 'Ver mis reservas'));
      await vi.waitFor(() => expect(host.querySelector('.self-service-card crp-my-payments-card-lines small')).toBeTruthy());
      expect(flat(host.querySelector('.self-service-card-copy')?.textContent)).toContain(
        'Tipo de pago: Pago total · Medio de pago: Transferencia Estado del comprobante: Sin comprobante · Situación financiera: Sin pago Saldo: $850.000');
      expect(host.textContent).not.toMatch(/RES-1841|RES-1839/);
      const cancelled = Array.from(host.querySelectorAll('.self-service-card-copy')).find((c) => c.textContent?.startsWith('RES-1831'))!;
      expect(flat(cancelled.querySelector('p')?.textContent)).toBe('Salida: 22 sep 2026 · 06:30 · 2 viajeros');
      expect(Array.from(cancelled.querySelectorAll('small'), (line) => flat(line.textContent))).toEqual(['Tipo de pago: Abono · Medio de pago: Transferencia',
        'Estado del comprobante: Aprobado · Situación financiera: Parcial', 'Saldo: $0', 'Cancelada por falta de pago']);
    } finally { cleanup(); }
  });
});

describe('aProofInValidationRaisesOneNoticeInNotifications', () => {
  it('writes one notice per reservation the port names, with the text of panel-cliente.html', async () => {
    const view = await render(PaymentNoticesComponent, new SourceDouble(null, [{ reservationId: 'RES-1842', proofStatus: 'EN_VALIDACION' }, { reservationId: 'RES-1850', proofStatus: 'EN_VALIDACION' }]));
    expect(Array.from(view.host.querySelectorAll('p'), (p) => flat(p.textContent))).toEqual([
      'Reserva RES-1842: comprobante En validación. La revisión puede tardar hasta 24 horas.',
      'Reserva RES-1850: comprobante En validación. La revisión puede tardar hasta 24 horas.',
    ]);
    expect(view.host.querySelector('p strong')?.textContent).toBe('Reserva RES-1842:');
  });
});

describe('continuePaymentFollowsThePortTargetAndOpensScreen24', () => {
  const TARGET: ContinuePaymentTarget = { reservationId: 'RES-1842', paymentType: 'TOTAL', amountCents: 85_000_000 };

  it('offers Continuar pago for the reservation the port names and opens screen 24 with it', async () => {
    const view = await render(ContinuePaymentActionComponent, new SourceDouble(TARGET));
    const button = view.host.querySelector('button')!;
    expect(flat(button.textContent)).toBe('CP Continuar pago Continúa el pago pendiente de una de tus reservas.');
    button.click();
    expect(view.open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1842', type: 'TOTAL', amount: '85000000' });
  });

  it('is not drawn without a target, nor when the build has no screen 24', async () => {
    expect((await render(ContinuePaymentActionComponent, new SourceDouble(null))).host.querySelector('button')).toBeNull();
    TestBed.resetTestingModule();
    expect((await render(ContinuePaymentActionComponent, new SourceDouble(TARGET), { areas: [CLIENT_AREA.panel] })).host.querySelector('button')).toBeNull();
  });
});

describe('continuePaymentClickedTwiceOpensScreen24OnceAndRecordsNothing', () => {
  it('opens 24 once and calls no writer', async () => {
    const view = await render(ContinuePaymentActionComponent, new SourceDouble({ reservationId: 'RES-1842', amountCents: 85_000_000 }));
    const button = view.host.querySelector('button')!;
    button.click(); button.click();
    expect(view.open).toHaveBeenCalledTimes(1);
    expect(view.open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1842', amount: '85000000' });
    const code = withoutComments(readFileSync('src/app/my-payments/components/my-payments-panel.component.ts', 'utf8'));
    expect(code).not.toMatch(/Writer|IdempotencyKeys|register\(/);
  });
});

describe('demoContinuePaymentTargetIsThePendingReservationWithTheNearestDeparture', () => {
  it('names the own Pendiente de pago transfer reservation with the nearest departure, with its pending balance', async () => {
    const bed = demo(['FINAL_CUSTOMER'], (store) => {
      const own = store.items.find((r) => r.id === 'RES-1842')!;
      store.items = [...store.items,
        { ...own, id: 'RES-1860', departureDate: '2026-12-01' },
        { ...own, id: 'RES-1861', departureDate: '2026-10-20', balanceCents: 20_000_000, paymentType: 'PARTIAL' },
        { ...own, id: 'RES-1862', departureDate: '2026-10-15', paymentMethod: 'CASH_AT_OFFICE' },
        { ...own, id: 'RES-1863', departureDate: '2026-10-14', status: 'CONFIRMADA' },
        { ...own, id: 'RES-1864', departureDate: '2026-10-14', leadCustomerName: 'Mateo Ríos (demo)' }];
    });
    expect(await firstValueFrom(bed.inject(MyPaymentsSource).continuePaymentTarget()))
      .toEqual({ reservationId: 'RES-1861', paymentType: 'PARTIAL', amountCents: 20_000_000 });
  });

  it('skips an own pending reservation whose proof is already En validación, though it departs first (RES-1840)', async () => {
    expect(await firstValueFrom(demo().inject(MyPaymentsSource).continuePaymentTarget()))
      .toEqual({ reservationId: 'RES-1842', paymentType: 'TOTAL', amountCents: 85_000_000 });
  });
});

describe('quickActionsShowMyPaymentsWhenTheAreaExists', () => {
  it('draws Mis pagos with the texts of panel-cliente.html and opens the area', async () => {
    const view = await render(MyPaymentsActionComponent, new SourceDouble());
    const button = view.host.querySelector('button')!;
    expect(flat(button.textContent)).toBe('MP Mis pagos Consulta pagos, abonos, saldos y soportes de tus reservas.');
    button.click();
    expect(view.open).toHaveBeenCalledWith(CLIENT_AREA.payments);
    TestBed.resetTestingModule();
    expect((await render(MyPaymentsActionComponent, new SourceDouble(), { areas: [CLIENT_AREA.panel] })).host.querySelector('button')).toBeNull();
  });

  it('registers Mis pagos as a customer area of the panel, opened from 17 and offered only with its port', () => {
    const area = PORTAL_AREAS.find((a) => a.key === CLIENT_AREA.payments)!;
    expect(CLIENT_AREA.payments).toBe('my-payments');
    expect(area).toMatchObject({ label: 'Mis pagos', component: MyPaymentsPageComponent, audience: 'customer', clientChrome: 'panel', menu: false });
    demo();
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) }] });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(false);
  });

  it('draws, in the demo build, Continuar pago then Mis pagos in Acciones rápidas, and opens Mis pagos with the own card', async () => {
    const { host, cleanup } = mountDemo();
    try {
      const items = () => Array.from(host.querySelectorAll('.crp-panel-quick li'), (li) => flat(li.textContent)).filter(Boolean);
      await vi.waitFor(() => expect(items()).toHaveLength(2));
      expect(items()).toEqual(['CP Continuar pago Continúa el pago pendiente de una de tus reservas.',
        'MP Mis pagos Consulta pagos, abonos, saldos y soportes de tus reservas.']);
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos y soportes de tus reservas.');
      await vi.waitFor(() => expect(host.querySelector('app-my-payments-page [data-state="data"]')).toBeTruthy());
      expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toBe(
        'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Tipo: Pago total Medio: Transferencia Comprobante: Sin comprobante Situación financiera: Sin pago Valores validados: $0 Saldo pendiente: $850.000');
      expect(flat(host.querySelector('.crp-client-panel-header')?.textContent)).toContain('Volver al panel');
    } finally { cleanup(); }
  });
});

/** The portal mounted as the final customer over fresh demo stores and the contributions of mount-entry.ts. */
function mountDemo(extra: unknown[] = []) {
  const fresh = [{ provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, ...reservationDemoProviders(), ...selfServiceDemoProviders(),
    ...paymentsDemoProviders(), ...myPaymentsDemoProviders(), ...extra];
  const host = document.createElement('div'); document.body.append(host);
  const props = { apiClient: { request: vi.fn() }, session: { roles: ['FINAL_CUSTOMER'], open: () => undefined, close: () => undefined } } as unknown as MountProps;
  const stop = entry.mountWith(host, props, () => fresh as never);
  return { host, fresh, cleanup: () => { stop(); host.remove(); } };
}
function press(host: HTMLElement, label: string): void {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((b) => flat(b.textContent) === label);
  if (!found) throw new Error(`no ${label} in ${flat(host.textContent)}`);
  found.click();
}

describe('theProofSentOn24ReachesThePanelAndMisPagos', () => {
  it('Continuar pago opens 24 of RES-1842; after the proof, Notificaciones and Mis pagos read it En validación with the same balance', async () => {
    const { host, cleanup } = mountDemo();
    try {
      await vi.waitFor(() => press(host, 'CP Continuar pago Continúa el pago pendiente de una de tus reservas.'));
      await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toBe('Pago por transferencia'));
      expect(flat(host.textContent)).toContain('Código de referencia: #RES-1842');
      const proof = host.querySelector<HTMLInputElement>('#crp-transfer-proof')!;
      Object.defineProperty(proof, 'files', { value: [pdf()], configurable: true }); proof.dispatchEvent(new Event('change'));
      press(host, 'Enviar comprobante para validación');
      await vi.waitFor(() => expect(Array.from(host.querySelectorAll('.crp-panel-notices .crp-operator-panel p'), (p) => flat(p.textContent))).toEqual([
        'Reserva RES-1842: comprobante En validación. La revisión puede tardar hasta 24 horas.',
        'Reserva RES-1840: comprobante En validación. La revisión puede tardar hasta 24 horas.']));
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos y soportes de tus reservas.');
      await vi.waitFor(() => expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toContain('Comprobante: En validación'));
      expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toContain('Valores validados: $0 Saldo pendiente: $850.000');
    } finally { cleanup(); }
  });
});

describe('theDemoCustomerSeesEveryPaymentSituationOfTheMockup', () => {
  it('Mis pagos of the demo build shows Sin comprobante, En validación, Abono recibido, Pago completo and a cancelled reservation', async () => {
    const { host, cleanup } = mountDemo();
    try {
      await vi.waitFor(() => expect(flat(host.querySelector('.crp-panel-notices .crp-operator-panel')?.textContent))
        .toBe('Reserva RES-1840: comprobante En validación. La revisión puede tardar hasta 24 horas.'));
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos y soportes de tus reservas.');
      await vi.waitFor(() => expect(host.querySelectorAll('li.crp-my-payments-card')).toHaveLength(5));
      expect(Array.from(host.querySelectorAll('li.crp-my-payments-card'), (c) => flat(c.textContent))).toEqual([
        'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Tipo: Pago total Medio: Transferencia Comprobante: Sin comprobante Situación financiera: Sin pago Valores validados: $0 Saldo pendiente: $850.000',
        'RES-1840 Ruta Andina 18 sep 2026 · 06:30 Tipo: Pago total Medio: Transferencia Comprobante: En validación Situación financiera: Sin pago Valores validados: $0 Saldo pendiente: $1.299.000',
        'RES-1832 Tour de ejemplo 20 sep 2026 · 07:00 Tipo: Abono Medio: Transferencia Comprobante: Aprobado Situación financiera: Abono recibido Valores validados: $100.000 Saldo pendiente: $200.000',
        'RES-1831 Ruta Andina 22 sep 2026 · 06:30 Tipo: Abono Medio: Transferencia Comprobante: Aprobado Situación financiera: Parcial Valores validados: $1.200.000 Saldo pendiente: $0',
        'RES-1830 Ruta Andina 18 sep 2026 · 06:30 Tipo: Pago total Medio: Transferencia Comprobante: Aprobado Situación financiera: Pago completo Valores validados: $1.299.000 Saldo pendiente: $0',
      ]);
    } finally { cleanup(); }
  });

  it('the seeded Abono with a balance of another customer (RES-1839, Confirmada) reads Abono recibido, as the mockup rule (app.js 6879)', async () => {
    const all = await firstValueFrom(demo().inject(ReservationsSource).list());
    expect(all.find((r) => r.id === 'RES-1839')).toMatchObject({ status: 'CONFIRMADA', paymentType: 'PARTIAL', financialStatus: 'ABONO_RECIBIDO' });
  });
});

describe('clientPagesWithoutContributionsRenderAsBefore', () => {
  it('without the port of this story, 17 has neither Continuar pago, Mis pagos nor Notificaciones, and Mis reservas no economic line', async () => {
    const { host, cleanup } = mountDemo([{ provide: MyPaymentsSource, useValue: null }]);
    try {
      await vi.waitFor(() => expect(host.querySelector('app-client-panel-page .crp-panel-card')).toBeTruthy());
      expect(host.textContent).not.toMatch(/Continuar pago|Mis pagos|Notificaciones/);
      await vi.waitFor(() => press(host, 'Ver mis reservas'));
      await vi.waitFor(() => expect(host.querySelector('.self-service-card')).toBeTruthy());
      expect(host.textContent).not.toMatch(/Tipo de pago|Estado del comprobante/);
    } finally { cleanup(); }
  });
});

// RN-MP4 (AC-MP.6, one test with 008- AC-RS.7): no modify, cancel, reschedule, validate or reject in what this story draws.
// validatedCents and "Valores validados" are values, not actions: the verb alone is the action.
const ACTIONS = /modif|cancel|reschedul|reprogram|\bedit|validar|rechazar|\bvalidate(?!d)|\breject|approve|aprobar/i;
// Not actions: the mockup's description, the read-only Cancelada state and its text, the cause and treatment the store holds.
const INFORMATIVE = /Esta consulta no permite validar ni rechazar soportes\.|No aplica por reserva cancelada|CANCELADA|CANCELLED|cancellationCause|cancellation\b|APROBADO|Aprobado|RECHAZADO|Rechazado|EN_VALIDACION|En validación/g;
const FILES = () => [...listSourceFiles().filter((file) => file.startsWith('src/app/my-payments/')), 'src/app/demo/my-payments-demo.ts'];

describe('myPaymentsDrawsNoValidateOrRejectAction', () => {
  it('finds no change, validate or reject action in any source of the feature or its demo source', () => {
    const files = FILES();
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) expect(withoutComments(readFileSync(file, 'utf8')).replace(INFORMATIVE, ''), file).not.toMatch(ACTIONS);
  });

  it('the detector rejects representative additions', () => {
    for (const sample of ['<button>Validar soporte</button>', 'rejectProof()', 'cancelar', 'reprogramar', 'modifyReservation()']) expect(sample).toMatch(ACTIONS);
  });

  it('declares no writer: the feature reads one port only', () => {
    const code = FILES().map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    expect(code).toMatch(/MyPaymentsSource/);
    expect(code).not.toMatch(/Writer|Requester|IdempotencyKeys/);
  });

  it('Mis pagos with data draws no button at all', async () => {
    const view = await pageWith([SUMMARY]);
    expect(view.host.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('quickActionsKeepTheOrderOfTheMockup', () => {
  it('orders Continuar pago before Mis pagos by their order, not by the order of registration', () => {
    const order = (component: unknown) => (MY_PAYMENTS_CONTRIBUTIONS as { useValue: { component: unknown; order: number } }[])
      .find((p) => p.useValue.component === component)!.useValue.order;
    expect(order(ContinuePaymentActionComponent)).toBeLessThan(order(MyPaymentsActionComponent));
  });
});

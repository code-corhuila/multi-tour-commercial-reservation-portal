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
import { ReservationEconomicActionsComponent, ReservationEconomicLinesComponent } from '../src/app/my-payments/components/reservation-economic-lines.component';
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
      .toBe('Consulta el tipo y medio de pago, el estado de cada comprobante, la situación financiera, el saldo pendiente, los valores devueltos y tu saldo a favor. Esta consulta no permite validar ni rechazar comprobantes.');
    expect(view.host.querySelector('h2')?.textContent).toBe('Estado económico de mis reservas y saldo a favor');
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
      'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Estado de la reserva: Pendiente de pago Tipo de pago: Pago total Medio de pago: Transferencia Estado del comprobante: En validación Situación financiera: Sin pago Valores validados: $0 Saldo pendiente: $850.000',
      'RES-1850 Desierto de la Tatacoa al atardecer 07 nov 2026 Estado de la reserva: Pendiente de pago Tipo de pago: Abono Medio de pago: Efectivo Estado del comprobante: Sin comprobante Situación financiera: Parcial Valores validados: $300.000 Saldo pendiente: $118.000 Comprobantes Sin comprobantes registrados.',
    ]);
    expect(view.host.querySelector('li.crp-my-payments-card h3')?.textContent).toBe('Desierto de la Tatacoa al atardecer');
  });

  it('writes the mockup text for a cancelled reservation without a financial situation, and Por definir for what is missing', async () => {
    const view = await pageWith([{ ...SUMMARY, reservationStatus: 'CANCELLED', paymentType: undefined, paymentMethod: undefined, proofStatus: 'SIN_COMPROBANTE', financialStatus: null }]);
    expect(view.text()).toContain('Estado de la reserva: Cancelada Tipo de pago: Por definir Medio de pago: Por definir Estado del comprobante: Sin comprobante Situación financiera: No aplica por reserva cancelada');
  });

  it('writes the departure as mis-pagos.html and Mis reservas do: date and time', async () => {
    const view = await pageWith([{ ...SUMMARY, departureAt: '2026-09-18T06:30:00' }]);
    expect(view.text()).toContain('RES-1842 Desierto de la Tatacoa al atardecer 18 sep 2026 · 06:30 Estado de la reserva: Pendiente de pago Tipo de pago: Pago total');
  });
});

describe('myPaymentsTextsAreSpanishWithAccentsAndNoRawCodes', () => {
  it('never shows a code, an id of the port or an unformatted amount', async () => {
    const view = await pageWith([SUMMARY, { ...SUMMARY, reservationId: 'RES-1851', proofStatus: 'APROBADO', financialStatus: 'PAGO_COMPLETO', paymentType: 'OTRO_TIPO' }]);
    const text = view.text();
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}|PENDING|TOTAL\b|85000000/);
    expect(text).toContain('Estado del comprobante: Aprobado'); expect(text).toContain('Situación financiera: Pago completo'); expect(text).toContain('Tipo de pago: Por definir');
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
    // HU-COM-018 also gives the demo customer RES-1829 and RES-1828 (rescheduling episodes).
    expect(mine.map((r) => r.reservationId)).toEqual(['RES-1842', 'RES-1840', 'RES-1832', 'RES-1831', 'RES-1830', 'RES-1829', 'RES-1828']);
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
    expect(before).toMatchObject({ ...SUMMARY, proofStatus: 'SIN_COMPROBANTE' });
    const noticed = async () => (await firstValueFrom(bed.inject(MyPaymentsSource).notices())).map((n) => n.reservationId);
    // As setupDashboardNotifications: every own reservation that has something to tell, but not the ones in rescheduling (their notice is HU-COM-018's).
    expect(await noticed()).toEqual(['RES-1842', 'RES-1840', 'RES-1832', 'RES-1831', 'RES-1828']);
    await firstValueFrom(bed.inject(PaymentsWriter).register({ reservationId: 'RES-1842', amountCents: 85_000_000, proof: pdf() }, 'k-1'));
    const after = (await firstValueFrom(bed.inject(MyPaymentsSource).listMine()))[0];
    expect(after).toMatchObject(SUMMARY);
    expect(await noticed()).toEqual(['RES-1842', 'RES-1840', 'RES-1832', 'RES-1831', 'RES-1828']);
    expect((await firstValueFrom(bed.inject(MyPaymentsSource).notices())).filter((n) => n.proofStatus === 'EN_VALIDACION').map((n) => n.reservationId)).toEqual(['RES-1842', 'RES-1840']);
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
      'Comprobante presentado dentro del plazo: la reserva no se cancela mientras se revisa (hasta 24 horas corridas).',
    ]);
  });

  it('adds the cancellation cause and the refund treatment when the store holds them, and drops the situation as the mockup does', async () => {
    expect(await linesOf({ ...SUMMARY, reservationStatus: 'CANCELLED', financialStatus: null, cancellationCause: 'Causal (demo)', refundTreatment: 'Tratamiento (demo)' })).toEqual([
      'Tipo de pago: Pago total · Medio de pago: Transferencia', 'Estado del comprobante: En validación', 'Causal (demo)', 'Tratamiento (demo)',
    ]);
  });

  it('is drawn in each card of Mis reservas of the demo build, only for the own reservations', async () => {
    const { host, cleanup } = mountDemo();
    try {
      await vi.waitFor(() => press(host, 'Ver mis reservas'));
      await vi.waitFor(() => expect(host.querySelector('.self-service-card crp-my-payments-card-lines small')).toBeTruthy());
      expect(flat(host.querySelector('.self-service-card-copy')?.textContent)).toContain(
        'Tipo de pago: Pago total · Medio de pago: Transferencia Estado del comprobante: Sin comprobante · Situación financiera: Sin pago Saldo: $850.000 Plazo de pago');
      expect(host.textContent).not.toMatch(/RES-1841|RES-1839/);
      const cancelled = Array.from(host.querySelectorAll('.self-service-card-copy')).find((c) => c.textContent?.startsWith('RES-1831'))!;
      expect(flat(cancelled.querySelector('p')?.textContent)).toBe('Salida: 22 sep 2026 · 06:30 · 2 viajeros');
      expect(Array.from(cancelled.querySelectorAll('small'), (line) => flat(line.textContent))).toEqual(['Tipo de pago: Abono · Medio de pago: Transferencia',
        'Estado del comprobante: Aprobado · Situación financiera: Parcial', 'Cancelada por falta de pago']);
    } finally { cleanup(); }
  });
});

describe('aProofInValidationRaisesOneNoticeInNotifications', () => {
  it('writes one notice per reservation the port names, with the text of panel-cliente.html', async () => {
    const view = await render(PaymentNoticesComponent, new SourceDouble(null, [{ reservationId: 'RES-1842', proofStatus: 'EN_VALIDACION' }, { reservationId: 'RES-1850', proofStatus: 'EN_VALIDACION' }]));
    expect(Array.from(view.host.querySelectorAll('p'), (p) => flat(p.textContent))).toEqual([
      'Reserva RES-1842: comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.',
      'Reserva RES-1850: comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.',
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
    expect(flat(button.textContent)).toBe('MP Mis pagos Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.');
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
        'MP Mis pagos Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.']);
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.');
      await vi.waitFor(() => expect(host.querySelector('app-my-payments-page [data-state="data"]')).toBeTruthy());
      expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toContain(
        'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Estado de la reserva: Pendiente de pago Tipo de pago: Pago total Medio de pago: Transferencia Estado del comprobante: Sin comprobante Situación financiera: Sin pago Valor final: $850.000 Valores validados: $0 Saldo pendiente: $850.000 Valores devueltos: $0 Saldo a favor: $0');
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
      await vi.waitFor(() => expect(Array.from(host.querySelectorAll('.crp-panel-notices .crp-operator-panel p'), (p) => flat(p.textContent)).filter((t) => t.includes('En validación'))).toEqual([
        'Reserva RES-1842: comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.',
        'Reserva RES-1840: comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.']));
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.');
      await vi.waitFor(() => expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toContain('Estado del comprobante: En validación'));
      expect(flat(host.querySelector('li.crp-my-payments-card')?.textContent)).toContain('Valores validados: $0 Saldo pendiente: $850.000');
    } finally { cleanup(); }
  });
});

describe('theDemoCustomerSeesEveryPaymentSituationOfTheMockup', () => {
  it('Mis pagos of the demo build shows Sin comprobante, En validación, Abono recibido, Pago completo and a cancelled reservation', async () => {
    const { host, cleanup } = mountDemo();
    try {
      await vi.waitFor(() => expect(flat(host.querySelector('.crp-panel-notices .crp-operator-panel')?.textContent))
        .toContain('Reserva RES-1840: comprobante En validación. La revisión puede tardar hasta 24 horas corridas y la reserva no se confirma hasta que el pago sea validado.'));
      press(host, 'MP Mis pagos Consulta pagos, abonos, saldos, comprobantes y saldo a favor de tus reservas.');
      // The five situations of the mockup come first; HU-COM-018 adds the demo customer's RES-1829 and RES-1828 after them.
      await vi.waitFor(() => expect(host.querySelectorAll('li.crp-my-payments-card')).toHaveLength(7));
      const cards = Array.from(host.querySelectorAll('li.crp-my-payments-card'), (c) => flat(c.textContent));
      expect(cards.slice(5).map((card) => card.split(' ')[0])).toEqual(['RES-1829', 'RES-1828']);
      const expected = [
        'RES-1842 Desierto de la Tatacoa al atardecer 07 nov 2026 Estado de la reserva: Pendiente de pago Tipo de pago: Pago total Medio de pago: Transferencia Estado del comprobante: Sin comprobante Situación financiera: Sin pago Valor final: $850.000 Valores validados: $0 Saldo pendiente: $850.000 Valores devueltos: $0 Saldo a favor: $0 Comprobantes Sin comprobantes registrados.',
        'RES-1840 Ruta Andina 18 sep 2026 · 06:30 Estado de la reserva: Pendiente de pago Tipo de pago: Pago total Medio de pago: Transferencia Estado del comprobante: En validación Situación financiera: Sin pago Valor final: $1.299.000 Valores validados: $0 Saldo pendiente: $1.299.000 Valores devueltos: $0 Saldo a favor: $0 Comprobantes comprobante-transferencia-RES-1840.pdf · $1.299.000 · En validación',
        'RES-1832 Tour de ejemplo 20 sep 2026 · 07:00 Estado de la reserva: Confirmada Tipo de pago: Abono Medio de pago: Transferencia Estado del comprobante: Aprobado Situación financiera: Abono recibido Valor final: $300.000 Valores validados: $100.000 Saldo pendiente: $200.000 Valores devueltos: $0 Saldo a favor: $0 Comprobantes comprobante-transferencia-RES-1832.pdf · $100.000 · Aprobado',
        'RES-1831 Ruta Andina 22 sep 2026 · 06:30 Estado de la reserva: Cancelada Tipo de pago: Abono Medio de pago: Transferencia Estado del comprobante: Aprobado Situación financiera: No aplica por reserva cancelada Valor final: $1.200.000 Valores validados: $1.200.000 Saldo pendiente: $0 Valores devueltos: $0 Saldo a favor: $0 Comprobantes comprobante-transferencia-RES-1831.pdf · $1.200.000 · Aprobado',
        'RES-1830 Ruta Andina 18 sep 2026 · 06:30 Estado de la reserva: Confirmada Tipo de pago: Pago total Medio de pago: Transferencia Estado del comprobante: Aprobado Situación financiera: Pago completo Valor final: $1.299.000 Valores validados: $1.299.000 Saldo pendiente: $0 Valores devueltos: $0 Saldo a favor: $0 Comprobantes comprobante-transferencia-RES-1830.pdf · $1.299.000 · Aprobado',
      ];
      expected.forEach((card, i) => expect(cards[i]).toBe(card));
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
const INFORMATIVE = /Esta consulta no permite validar ni rechazar comprobantes\.|Si una modificación, cancelación o pago validado genera|la reserva no se cancela mientras se revisa|respuesta de reprogramación\.|reschedulingPending|rejectionReason|Cancelada|No aplica por reserva cancelada|CANCELADA|CANCELLED|cancellationCause|cancellation\b|APROBADO|Aprobado|RECHAZADO|Rechazado|EN_VALIDACION|En validación/g;
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

// Parity with the CURRENT mockup (PDR v1.9): mis-pagos.html (app.js 9613), mis-reservas.html (app.js 4486) and the notices of 17 (app.js 4758).
const FULL: CustomerPaymentSummary = { ...SUMMARY, proofStatus: 'SIN_COMPROBANTE', finalValueCents: 85_000_000, refundedCents: 0, creditBalanceCents: 0, people: 2 };
const gridOf = (view: { host: HTMLElement }) => Array.from(view.host.querySelectorAll('.crp-my-payments-meta span'), (s) => flat(s.textContent));

describe('myPaymentsGridWritesEveryFieldOfTheMockupCard', () => {
  it('draws, in the order of mis-pagos.html, the reservation state, payment type and method, proof, situation and the five values', async () => {
    expect(gridOf(await pageWith([FULL]))).toEqual([
      'Estado de la reserva: Pendiente de pago', 'Tipo de pago: Pago total', 'Medio de pago: Transferencia', 'Estado del comprobante: Sin comprobante',
      'Situación financiera: Sin pago', 'Valor final: $850.000', 'Valores validados: $0', 'Saldo pendiente: $850.000', 'Valores devueltos: $0', 'Saldo a favor: $0',
    ]);
  });

  it('adds En tratamiento pendiente only when there is one, and never draws a value the port does not hold', async () => {
    const withTreatment = gridOf(await pageWith([{ ...FULL, reservationStatus: 'CANCELLED', financialStatus: null, pendingTreatmentCents: 5_000_000, refundedCents: 1_000_000 }]));
    expect(withTreatment).toContain('Situación financiera: No aplica por reserva cancelada');
    expect(withTreatment).toContain('Valores devueltos: $10.000');
    expect(withTreatment.at(-1)).toBe('En tratamiento pendiente: $50.000');
    TestBed.resetTestingModule();
    const bare = gridOf(await pageWith([SUMMARY]));
    expect(bare.join(' ')).not.toMatch(/Valor final|Valores devueltos|Saldo a favor|En tratamiento/);
  });
});

describe('myPaymentsListsTheProofsOfEachReservation', () => {
  const receipts = [{ support: 'comprobante-1.pdf', amountCents: 85_000_000, status: 'RECHAZADO', rejectionReason: 'El monto no coincide' },
    { support: 'comprobante-2.pdf', amountCents: 85_000_000, status: 'EN_VALIDACION' }];

  it('writes support, amount, state and, if rejected, the reason; with no Descargar because the port holds no file', async () => {
    const view = await pageWith([{ ...FULL, receipts }]);
    expect(view.host.querySelector('.crp-my-payments-receipts strong')?.textContent).toBe('Comprobantes');
    expect(Array.from(view.host.querySelectorAll('.crp-my-payments-receipts li'), (li) => flat(li.textContent))).toEqual([
      'comprobante-1.pdf · $850.000 · Rechazado (motivo: El monto no coincide)', 'comprobante-2.pdf · $850.000 · En validación']);
    expect(view.text()).not.toContain('Descargar');
    expect(view.host.querySelectorAll('a, button')).toHaveLength(0);
  });
});

describe('myPaymentsShowsTheCreditBalancePanelOnlyWithTheValuesOfThePort', () => {
  it('says there is no credit balance when every reservation reports none', async () => {
    const view = await pageWith([FULL]);
    expect(flat(view.host.querySelector('.crp-my-payments-credit')?.textContent))
      .toBe('No tienes saldo a favor. Si una modificación, cancelación o pago validado genera un excedente a tu favor, aparecerá aquí.');
  });

  it('writes the available credit with its origin and offers no apply or refund action (HU-017 has no portal)', async () => {
    const view = await pageWith([{ ...FULL, creditBalanceCents: 5_000_000 }]);
    expect(flat(view.host.querySelector('.crp-my-payments-credit')?.textContent)).toBe(
      'Saldo a favor disponible: $50.000 (origen: reserva RES-1842). No vence en Fase 1.');
    expect(view.host.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('draws no panel when the port does not report the credit', async () => {
    expect((await pageWith([SUMMARY])).host.querySelector('.crp-my-payments-credit')).toBeNull();
  });
});

describe('theCardOfMisReservasWritesTheDeadlinesOfTheMockup', () => {
  async function smalls(summary: CustomerPaymentSummary) {
    const source = new SourceDouble();
    const view = await render(ReservationEconomicLinesComponent, source);
    view.fixture.componentRef.setInput('reservationId', summary.reservationId); await view.settle();
    source.reads.at(-1)!.next([summary]); await view.settle();
    return { lines: Array.from(view.host.querySelectorAll('small'), (line) => flat(line.textContent)), host: view.host };
  }

  it('Pendiente de pago: the dated deadline when the port gives it, the generic one when not', async () => {
    const dated = await smalls({ ...FULL, deadlineAt: '2026-10-20T18:00:00-05:00' });
    expect(dated.lines.at(-1)).toBe('Plazo de pago vigente hasta 20 oct 2026 · 18:00 (una única ampliación posible; nunca después de la hora de inicio de la salida).');
    TestBed.resetTestingModule();
    expect((await smalls(FULL)).lines.at(-1)).toBe('Plazo de pago: según la configuración del operador, sin superar la hora de inicio de la salida.');
  });

  it('Confirmada with balance: the deadline to complete it; a reservation in rescheduling: the frozen deadlines', async () => {
    const confirmed = { ...FULL, reservationStatus: 'CONFIRMED', financialStatus: 'ABONO_RECIBIDO', balanceCents: 20_000_000 };
    expect((await smalls({ ...confirmed, deadlineAt: '2026-10-20T06:00:00-05:00' })).lines.at(-1))
      .toBe('Plazo para completar el saldo: hasta 20 oct 2026 · 06:00 (antes de la hora de inicio de la salida).');
    TestBed.resetTestingModule();
    expect((await smalls(confirmed)).lines.at(-1)).toBe('Debes completar el saldo antes de la hora de inicio de la salida.');
    TestBed.resetTestingModule();
    expect((await smalls({ ...confirmed, reschedulingPending: true })).lines.at(-1))
      .toBe('Tus plazos económicos están congelados mientras esperas tu respuesta de reprogramación.');
  });

  it('a cancelled reservation shows no balance and no deadline; a paid one no deadline either', async () => {
    expect((await smalls({ ...FULL, reservationStatus: 'CANCELLED', financialStatus: null })).lines.join(' ')).not.toMatch(/Saldo:|Plazo/);
    TestBed.resetTestingModule();
    expect((await smalls({ ...FULL, reservationStatus: 'CONFIRMED', financialStatus: 'PAGO_COMPLETO', balanceCents: 0 })).lines.join(' ')).not.toMatch(/Plazo|Debes completar/);
  });

  it('adds the Ver detalle de la reserva disclosure with the rows of the mockup', async () => {
    const { host } = await smalls({ ...FULL, deadlineAt: '2026-10-20T18:00:00-05:00', departureAt: '2026-09-18T06:30:00' });
    expect(host.querySelector('details summary')?.textContent).toBe('Ver detalle de la reserva');
    expect(Array.from(host.querySelectorAll('details dl div'), (row) => flat(row.textContent))).toEqual([
      'Salida 18 sep 2026 · 06:30', 'Viajeros 2', 'Tipo de pago Pago total', 'Medio de pago Transferencia', 'Estado de la reserva Pendiente de pago',
      'Estado del comprobante Sin comprobante', 'Situación financiera Sin pago', 'Valor final $850.000', 'Valores validados $0', 'Saldo pendiente $850.000',
      'Plazo Plazo de pago vigente hasta 20 oct 2026 · 18:00 (una única ampliación posible; nunca después de la hora de inicio de la salida).']);
  });
});

describe('theCardOfMisReservasOffersTheActionsOfTheMockupToTheAreasThatExist', () => {
  async function actionsOf(summary: CustomerPaymentSummary, areas?: string[]) {
    const source = new SourceDouble();
    const view = await render(ReservationEconomicActionsComponent, source, areas ? { areas } : {});
    view.fixture.componentRef.setInput('reservationId', summary.reservationId); await view.settle();
    source.reads.at(-1)!.next([summary]); await view.settle();
    return { ...view, labels: Array.from(view.host.querySelectorAll('button'), (b) => flat(b.textContent)) };
  }
  const pay = { ...FULL, paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER' };

  it('Continuar pago opens screen 24 with the balance, and Ver pagos y comprobantes opens Mis pagos with the reservation', async () => {
    const view = await actionsOf(pay);
    expect(view.labels).toEqual(['Continuar pago', 'Ver pagos y comprobantes']);
    view.host.querySelectorAll('button')[0].click();
    expect(view.open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1842', type: 'TOTAL', amount: '85000000' });
    view.host.querySelectorAll('button')[1].click();
    expect(view.open).toHaveBeenCalledWith(CLIENT_AREA.payments, { reservation: 'RES-1842' });
  });

  it('a Rechazado proof offers Presentar nuevo comprobante instead of Continuar pago', async () => {
    expect((await actionsOf({ ...pay, proofStatus: 'RECHAZADO' })).labels).toEqual(['Presentar nuevo comprobante', 'Ver pagos y comprobantes']);
  });

  it('offers no payment action while the proof is En validación, when cancelled, in rescheduling or with nothing to pay', async () => {
    expect((await actionsOf({ ...pay, proofStatus: 'EN_VALIDACION' })).labels).toEqual(['Ver pagos y comprobantes']);
    TestBed.resetTestingModule();
    expect((await actionsOf({ ...pay, reservationStatus: 'CANCELLED', proofStatus: 'RECHAZADO' })).labels).toEqual(['Ver pagos y comprobantes']);
    TestBed.resetTestingModule();
    expect((await actionsOf({ ...pay, reschedulingPending: true })).labels).toEqual(['Ver pagos y comprobantes']);
    TestBed.resetTestingModule();
    expect((await actionsOf({ ...pay, reservationStatus: 'CONFIRMED', balanceCents: 0 })).labels).toEqual(['Ver pagos y comprobantes']);
  });

  it('does not draw a button whose destination the build does not have (lesson A4)', async () => {
    expect((await actionsOf(pay, [CLIENT_AREA.panel])).labels).toEqual([]);
    TestBed.resetTestingModule();
    expect((await actionsOf(pay, [CLIENT_AREA.panel, CLIENT_AREA.payments])).labels).toEqual(['Ver pagos y comprobantes']);
  });
});

describe('thePanelNotificationsCarryTheContentOfTheMockup', () => {
  const base = { reservationId: 'RES-1850', proofStatus: 'SIN_COMPROBANTE' };
  async function noticesOf(...pending: PaymentNotice[]) {
    const view = await render(PaymentNoticesComponent, new SourceDouble(null, pending));
    return { ...view, lines: Array.from(view.host.querySelectorAll('p'), (p) => flat(p.textContent)) };
  }

  it('Rechazado: says so and offers Presentar nuevo comprobante on the same reservation', async () => {
    const view = await noticesOf({ ...base, proofStatus: 'RECHAZADO', reservationStatus: 'PENDING_PAYMENT', balanceCents: 85_000_000, paymentType: 'TOTAL' });
    expect(view.lines).toEqual(['Reserva RES-1850: comprobante Rechazado. Puedes presentar un nuevo comprobante sobre la misma reserva mientras el plazo de pago siga vigente.']);
    view.host.querySelector('button')!.click();
    expect(flat(view.host.querySelector('button')?.textContent)).toBe('Presentar nuevo comprobante');
    expect(view.open).toHaveBeenCalledWith('transfer-payment', { reservation: 'RES-1850', type: 'TOTAL', amount: '85000000' });
  });

  it('Confirmada with balance and Pendiente de pago: the balance, the deadline and Continuar pago', async () => {
    const view = await noticesOf(
      { ...base, reservationStatus: 'CONFIRMED', balanceCents: 20_000_000, deadlineAt: '2026-10-20T06:00:00-05:00' },
      { ...base, reservationId: 'RES-1851', reservationStatus: 'PENDING_PAYMENT', balanceCents: 85_000_000 });
    expect(view.lines).toEqual([
      'Reserva RES-1850: Confirmada con saldo pendiente de $200.000. Plazo para completar el saldo: hasta 20 oct 2026 · 06:00 (antes de la hora de inicio de la salida).',
      'Reserva RES-1851: Pendiente de pago. Plazo de pago: según la configuración del operador, sin superar la hora de inicio de la salida.']);
    expect(Array.from(view.host.querySelectorAll('button'), (b) => flat(b.textContent))).toEqual(['Continuar pago', 'Continuar pago']);
  });

  it('Cancelada: the cause and the treatment of the paid values; the credit balance with the link to Mis pagos', async () => {
    const view = await noticesOf(
      { ...base, reservationStatus: 'CANCELLED', cancellationCause: 'Cancelada por vencimiento', pendingTreatmentCents: 5_000_000 },
      { ...base, reservationId: 'RES-1851', reservationStatus: 'CONFIRMED', balanceCents: 0, creditBalanceCents: 3_000_000 });
    expect(view.lines).toEqual([
      'Reserva RES-1850: Cancelada por vencimiento. Los valores abonados ($50.000) quedaron en tratamiento pendiente.',
      'Reserva RES-1851: tienes un saldo a favor de $30.000.']);
    expect(flat(view.host.querySelector('button')?.textContent)).toBe('Consultar saldo a favor');
    view.host.querySelector('button')!.click();
    expect(view.open).toHaveBeenCalledWith(CLIENT_AREA.payments, { reservation: 'RES-1851' });
  });
});

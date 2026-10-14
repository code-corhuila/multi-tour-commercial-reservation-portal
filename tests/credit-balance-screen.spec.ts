import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoCreditBalanceSource, DemoCreditBalanceWriter } from '../src/app/demo/credit-balance-demo';
import { DemoProofReviewWriter } from '../src/app/demo/proof-review-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { CREDIT_BALANCE_AREA, CreditBalance, CreditBalanceSource, CreditBalanceWriter } from '../src/app/credit-balance/data/credit-balance-ports';
import { CREDIT_BALANCE_COPY } from '../src/app/credit-balance/credit-balance-copy';
import { CreditBalancePageComponent } from '../src/app/credit-balance/pages/credit-balance-page.component';
import { CreditBalanceDetailLinkComponent, CreditBalancePaymentsLinkComponent } from '../src/app/credit-balance/components/credit-balance-links.component';
import { formatDateTime } from '../src/app/refunds/refunds-copy';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-017 amendment 2026-10-14 (admin-saldo-favor.html of the mockup f6ba1c4). Invented data only.
const NOW = '2026-10-14T10:00:00-05:00';
const ANA = 'Ana Prueba (demo)';
const line = (id: string, reservationId: string, amountCents: number, origin: CreditBalance['origin'] = 'TRATAMIENTO'): CreditBalance =>
  ({ id, reservationId, tenant: 'tenant-demo', amountCents, origin, status: 'PENDIENTE', recordedBy: 'Administrador del tenant', recordedAt: '2026-10-13T09:00:00-05:00', appliedTo: null });
/** Ana: $300.000 of credit from RES-O1; RES-T1 owes $200.000 (dep-1, 10 seats), RES-T2 is cancelled, RES-T3 owes $100.000 on dep-2 whose 2 seats RES-F1 holds. */
const fixtures = (withCredit = true) => {
  const store = new DemoReservationsStore([
    reservationOf('RES-O1', { leadCustomerName: ANA, status: 'CANCELADA', balanceCents: 0, validatedCents: 30_000_000 }),
    reservationOf('RES-T1', { leadCustomerName: ANA, departureId: 'demo-dep-1', departureDate: '2026-11-07', balanceCents: 20_000_000, validatedCents: 0 }),
    reservationOf('RES-T2', { leadCustomerName: ANA, status: 'CANCELADA', balanceCents: 5_000_000 }),
    reservationOf('RES-T3', { leadCustomerName: ANA, departureId: 'demo-dep-2', departureDate: '2026-11-14', balanceCents: 10_000_000 }),
    reservationOf('RES-F1', { leadCustomerName: 'Otro Cliente (demo)', departureId: 'demo-dep-2', departureDate: '2026-11-14', seatHeld: true, people: 2, balanceCents: 1_000_000 }),
    reservationOf('RES-D1', { leadCustomerName: ANA, departureId: 'demo-dep-1', departureDate: '2026-10-01', balanceCents: 1_000_000 }),
  ]);
  if (withCredit) store.creditBalances = [line('SAF-1', 'RES-O1', 30_000_000)];
  return store;
};
const demo = (role = 'TENANT_ADMINISTRATOR', store = fixtures(), now = NOW) => {
  const clock = new FixedClock(now), can = PortalCapabilities.for(role);
  return { store, source: new DemoCreditBalanceSource(store, clock), writer: new DemoCreditBalanceWriter(store, clock, can, 'tenant-demo', new Map(), new DemoDeparturesStore()) };
};
const overview = async (source: CreditBalanceSource) => firstValueFrom(source.list());

class SpyWriter extends DemoCreditBalanceWriter {
  readonly applied: unknown[][] = [];
  override apply(...args: Parameters<DemoCreditBalanceWriter['apply']>) { this.applied.push(args); return super.apply(...args); }
}

async function screen(role = 'TENANT_ADMINISTRATOR', withCredit = true) {
  const d = demo(role, fixtures(withCredit)), spy = new SpyWriter(d.store, new FixedClock(NOW), PortalCapabilities.for(role), 'tenant-demo', new Map(), new DemoDeparturesStore());
  const navigation = new PortalNavigation();
  navigation.register(['payments', CREDIT_BALANCE_AREA]);
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: CreditBalanceSource, useValue: d.source },
    { provide: CreditBalanceWriter, useValue: spy }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }] as Provider[] });
  const fixture = TestBed.createComponent(CreditBalancePageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const texts = (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const type = async (selector: string, value: string) => { const i = host.querySelector<HTMLInputElement>(selector)!; i.value = value; i.dispatchEvent(new Event('input')); await settle(); };
  return { ...d, spy, navigation, host, settle, button, texts, type };
}

describe('creditScreenDrawsSummaryCustomersAndRequestsAsTheMockup', () => {
  it('writes the header, the note, the summary, the customer panel and the empty requests row', async () => {
    const s = await screen();
    expect(s.host.querySelector('h1')?.textContent?.trim()).toBe('Saldo a favor');
    expect(s.host.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe('RN-RES-009 · GAP-014 · GAP-015');
    expect(s.host.querySelector('.crp-operator-access-note')?.textContent).toContain('no vence y no se transfiere a otros tenants');
    expect(s.host.querySelector('.crp-operator-access-note')?.textContent).toContain('se ejecuta en máximo 5 días hábiles.');
    expect(s.texts('[data-credit-summary] .crp-summary-metric')).toEqual(['$300.000 Saldo disponible del tenant', '1 Clientes con saldo', '0 Devoluciones por decidir (24 h)']);
    const panel = s.host.querySelector('[data-credit-customer]')!;
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe(ANA);
    expect(panel.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('Disponible $300.000');
    expect(Array.from(panel.querySelectorAll('thead th'), (h) => h.textContent?.trim())).toEqual(['Reserva de origen', 'Saldo neto', 'En devolución', 'Disponible', '']);
    expect(Array.from(panel.querySelectorAll('tbody td'), (c) => c.textContent?.trim()).slice(0, 4)).toEqual(['#RES-O1', '$300.000', '$0', '$300.000']);
    expect(panel.querySelector('summary')?.textContent?.trim()).toBe('Historial de aplicaciones y devoluciones (1)');
    expect(s.texts('[data-credit-requests] tr')).toEqual(['Sin solicitudes de devolución de saldo a favor.']);
    expect(s.host.querySelector('h2:last-of-type, section:last-of-type h2')?.textContent?.trim()).toBe('Solicitudes de devolución de saldo a favor');
  });

  it('writes the empty text when no customer has credit', async () => {
    const s = await screen('TENANT_ADMINISTRATOR', false);
    expect(s.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe(CREDIT_BALANCE_COPY.empty);
    expect(CREDIT_BALANCE_COPY.empty).toBe('Ningún cliente del tenant tiene saldo a favor. Se genera por excedentes de pago, reducciones de valor o decisiones del Administrador sobre valores en tratamiento.');
  });

  it('returns to Pagos through the navigation, never an address', async () => {
    const s = await screen();
    s.button('Volver a Pagos')!.click();
    expect(s.navigation.selected()).toBe('payments');
  });

  it('offers the apply form with its eligible reservations and the amount as text', async () => {
    const s = await screen();
    expect(s.texts('[data-credit-target] option')).toEqual(['#RES-T1 · saldo $200.000', '#RES-T3 · saldo $100.000', '#RES-D1 · saldo $10.000']);
    const amount = s.host.querySelector<HTMLInputElement>('[data-credit-amount]')!;
    expect(amount.type).toBe('text');
    expect(amount.value).toBe('200000');
    expect(s.button('Aplicar como pago validado')).toBeTruthy();
  });
});

describe('readOnlyRolesSeeTheCreditScreenWithoutForms', () => {
  it('draws the same data without apply form, refund buttons or request form for Analyst and an unknown role', async () => {
    for (const role of ['ANALYST', 'SOMETHING_ELSE']) {
      const s = await screen(role);
      expect(s.host.querySelector('[data-credit-customer]')).toBeTruthy();
      expect(s.host.querySelector('form, [data-credit-refund-form]')).toBeNull();
      expect(s.button('Solicitar devolución')).toBeUndefined();
      TestBed.resetTestingModule();
    }
  });
});

describe('aRoleWithoutTheCapabilityIsRefusedByTheWriter', () => {
  it('grants both capabilities to the Administrator and the Collaborator only', () => {
    const roles = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY', 'SOMETHING_ELSE'];
    expect(roles.map((r) => PortalCapabilities.for(r).canApplyCreditBalance())).toEqual([true, true, false, false, false, false, false]);
    expect(roles.map((r) => PortalCapabilities.for(r).canRequestCreditRefund())).toEqual([true, true, false, false, false, false, false]);
  });

  it('refuses a direct apply and a direct request with 403 and changes nothing', async () => {
    const d = demo('ANALYST');
    await expect(firstValueFrom(d.writer.apply('RES-T1', 1_000_000, 'k1'))).rejects.toMatchObject({ status: 403 });
    await expect(firstValueFrom(d.writer.requestRefund('RES-O1', 1_000_000, 'Pedido por correo', 'k2'))).rejects.toMatchObject({ status: 403 });
    expect(d.store.items.find((r) => r.id === 'RES-T1')!.balanceCents).toBe(20_000_000);
    expect((await overview(d.source)).requests).toEqual([]);
  });
});

describe('applyingCreditCountsAsAValidatedPaymentWithoutProof', () => {
  it('raises the validated values, lowers the balance and the credit, holds the seat and adds no proof', async () => {
    const d = demo();
    const out = await firstValueFrom(d.writer.apply('RES-T1', 10_000_000, 'k1'));
    expect(out).toEqual({ ok: true, appliedCents: 10_000_000, firstPayment: true });
    const t1 = d.store.items.find((r) => r.id === 'RES-T1')!;
    expect(t1).toMatchObject({ validatedCents: 10_000_000, balanceCents: 10_000_000, seatHeld: true });
    expect(t1.payments ?? []).toEqual([]);
    const ana = (await overview(d.source)).customers[0];
    expect(ana.availableCents).toBe(20_000_000);
    expect(ana.history[0]).toMatchObject({ kind: 'APLICACION', reservationId: 'RES-T1', amountCents: -10_000_000, actor: 'Administrador del tenant' });
  });

  it('answers the same for the same Idempotency-Key and applies once', async () => {
    const d = demo();
    await firstValueFrom(d.writer.apply('RES-T1', 10_000_000, 'k1'));
    await firstValueFrom(d.writer.apply('RES-T1', 10_000_000, 'k1'));
    expect(d.store.items.find((r) => r.id === 'RES-T1')!.balanceCents).toBe(10_000_000);
  });
});

describe('applyingCreditRefusesACancelledReservationAndAnAmountAbovePendingOrAvailable', () => {
  const refusal = async (target: string, cents: number, store = fixtures()) => (await firstValueFrom(demo('TENANT_ADMINISTRATOR', store).writer.apply(target, cents, `k-${target}-${cents}`)));
  it.each([
    ['RES-T2', 1_000_000, 'La reserva está Cancelada: no admite pagos nuevos.'],
    ['RES-D1', 500_000, 'Desde la hora programada de inicio de la salida no se admiten pagos.'],
    ['RES-T1', 0, 'Indica un monto mayor a cero.'],
    ['RES-T1', 30_100_000, 'El monto supera el saldo a favor disponible ($300.000).'],
    ['RES-T3', 10_100_000, 'El monto supera el saldo pendiente de la reserva ($100.000).'],
    ['RES-NOPE', 100, 'No se encontró la reserva.'],
    ['RES-O1', 100, 'La reserva está Cancelada: no admite pagos nuevos.'],
  ])('refuses %s for %i cents with the mockup text', async (target, cents, reason) => {
    expect(await refusal(target, cents)).toEqual({ ok: false, reason });
  });

  it('refuses a reservation without pending balance', async () => {
    const store = fixtures();
    store.items = [...store.items, reservationOf('RES-Z', { leadCustomerName: ANA, balanceCents: 0 })];
    expect(await refusal('RES-Z', 100, store)).toEqual({ ok: false, reason: 'La reserva no tiene saldo pendiente.' });
  });
});

describe('applyingCreditAsFirstPaymentHoldsTheSeatOrAppliesNothing', () => {
  it('applies nothing when the departure has no seats left for a first payment', async () => {
    const d = demo();
    const out = await firstValueFrom(d.writer.apply('RES-T3', 5_000_000, 'k1'));
    expect(out).toEqual({ ok: false, reason: 'No hay cupo suficiente en esta salida: quedan 0 cupos. No se aplicó el saldo a favor.' });
    expect(d.store.items.find((r) => r.id === 'RES-T3')).toMatchObject({ balanceCents: 10_000_000, seatHeld: false });
    expect((await overview(d.source)).customers[0].availableCents).toBe(30_000_000);
  });
});

describe('creditNeverExpiresAndEachLineCarriesTheTenant', () => {
  it('keeps the credit years later, and every application and request carries the session tenant', async () => {
    const d = demo('TENANT_ADMINISTRATOR', fixtures(), '2031-01-01T10:00:00-05:00');
    expect((await overview(d.source)).customers[0].availableCents).toBe(30_000_000);
    await firstValueFrom(d.writer.requestRefund('RES-O1', 5_000_000, 'Pedido por correo', 'k-r'));
    const written = [...d.store.creditBalances, ...d.store.creditApplications, ...d.store.creditRequests];
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written.every((l) => l.tenant === 'tenant-demo')).toBe(true);
  });
});

describe('refundRequestSetsTheAmountAsideAndStartsTheTwentyFourHours', () => {
  it('creates a Pendiente de autorización request due in 24 hours and lowers the available credit', async () => {
    const d = demo('OPERATIONAL_COLLABORATOR');
    const out = await firstValueFrom(d.writer.requestRefund('RES-O1', 10_000_000, ' Pedido por correo ', 'k1'));
    expect(out).toMatchObject({ ok: true, request: { reservationId: 'RES-O1', customer: ANA, amountCents: 10_000_000, state: 'PENDIENTE_DE_AUTORIZACION',
      reason: 'Pedido por correo', requestedBy: 'Colaborador operativo', decisionDueAt: '2026-10-15T10:00:00-05:00' } });
    const o = await overview(d.source);
    expect(o.customers[0].sources[0]).toMatchObject({ balanceCents: 30_000_000, requestedCents: 10_000_000, availableCents: 20_000_000 });
    expect(o).toMatchObject({ availableCents: 20_000_000, pendingDecisions: 1 });
    expect(o.requests).toHaveLength(1);
    await firstValueFrom(d.writer.requestRefund('RES-O1', 10_000_000, 'Pedido por correo', 'k1'));
    expect((await overview(d.source)).requests).toHaveLength(1);
  });
});

describe('refundRequestWithoutReasonOrAboveAvailableIsRefused', () => {
  it.each([
    [0, 'Pedido', 'Indica un monto mayor a cero.'],
    [30_000_100, 'Pedido', 'El monto supera el saldo disponible de la reserva de origen ($300.000).'],
    [1_000_000, '  ', 'Registra el motivo o la referencia de la solicitud del cliente.'],
  ])('refuses %i cents with reason "%s"', async (cents, motive, reason) => {
    const d = demo();
    expect(await firstValueFrom(d.writer.requestRefund('RES-O1', cents, motive, `k-${cents}`))).toEqual({ ok: false, reason });
    expect((await overview(d.source)).requests).toEqual([]);
  });
});

describe('creditHistoryShowsWhoAppliedAndRequested', () => {
  it('applies from the screen with a typed amount, shows the feedback and the history row with the role', async () => {
    const s = await screen();
    await s.type('[data-credit-amount]', '100000');
    s.host.querySelector<HTMLFormElement>('[data-credit-apply-form]')!.dispatchEvent(new Event('submit'));
    await s.settle();
    expect(s.spy.applied[0].slice(0, 2)).toEqual(['RES-T1', 10_000_000]);
    expect(s.host.querySelector('[data-credit-feedback]')?.textContent?.trim()).toBe('Saldo a favor aplicado: $100.000 como pago validado de RES-T1; el cupo quedó apartado en la misma operación. Queda en auditoría.');
    expect(s.host.querySelector('[data-credit-feedback]')?.getAttribute('aria-live')).toBe('polite');
    expect(s.texts('[data-credit-customer] details tbody tr')[0]).toBe(`${formatDateTime(NOW).replace(' · 10:00', '')} · 10:00 Aplicación Aplicado a la reserva RES-T1 #RES-T1 -$100.000 Administrador del tenant`);
    expect(s.host.querySelector('[data-credit-customer] .crp-operator-status')?.textContent?.trim()).toBe('Disponible $200.000');
  });

  it('reads the amount with parseMoney: 0.07 is 7 cents, and a refusal focuses the field with the error beside it', async () => {
    const s = await screen();
    await s.type('[data-credit-amount]', '0.07');
    s.host.querySelector<HTMLFormElement>('[data-credit-apply-form]')!.dispatchEvent(new Event('submit'));
    await s.settle();
    expect(s.spy.applied[0].slice(0, 2)).toEqual(['RES-T1', 7]);
    await s.type('[data-credit-amount]', '10,5');
    s.host.querySelector<HTMLFormElement>('[data-credit-apply-form]')!.dispatchEvent(new Event('submit'));
    await s.settle();
    const field = s.host.querySelector<HTMLInputElement>('[data-credit-amount]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(s.host.querySelector(`#${field.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Indica un monto mayor a cero.');
    expect(s.spy.applied).toHaveLength(1);
  });

  it('registers a refund request from the screen and lists it with its due time', async () => {
    const s = await screen();
    s.button('Solicitar devolución')!.click(); await s.settle();
    expect(s.host.querySelector<HTMLInputElement>('[data-credit-refund-amount]')!.value).toBe('300000');
    await s.type('[data-credit-refund-motive]', 'Pedido por correo');
    s.button('Registrar solicitud')!.click(); await s.settle();
    expect(s.host.querySelector('[data-credit-feedback]')?.textContent?.trim()).toBe(
      `Solicitud registrada por $300.000. El Administrador del tenant decide hasta el ${formatDateTime('2026-10-15T10:00:00-05:00')}; sin decisión se autoriza automáticamente el monto y se notifica a todos los Administradores. Ejecución en máximo 5 días hábiles.`);
    expect(s.texts('[data-credit-requests] tr')).toEqual([`#RES-O1 ${ANA} $300.000 Pendiente de autorización ${formatDateTime('2026-10-15T10:00:00-05:00')}`]);
    expect(s.texts('[data-credit-summary] .crp-summary-metric')[2]).toBe('1 Devoluciones por decidir (24 h)');
  });

  it('refuses a request without reason on the field, with focus', async () => {
    const s = await screen();
    s.button('Solicitar devolución')!.click(); await s.settle();
    s.button('Registrar solicitud')!.click(); await s.settle();
    const field = s.host.querySelector<HTMLInputElement>('[data-credit-refund-motive]')!;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    expect(s.host.querySelector(`#${field.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Registra el motivo o la referencia de la solicitud del cliente.');
  });
});

describe('approvedExcessIsListedWithItsOriginOnTheCreditScreen', () => {
  it('records the $200.000 excess of an approved $500.000 proof against $300.000 pending and lists it as excedente', async () => {
    const store = new DemoReservationsStore([reservationOf('RES-P', { leadCustomerName: 'Paula Prueba (demo)', status: 'CONFIRMADA', paymentType: 'PARTIAL', balanceCents: 30_000_000, validatedCents: 10_000_000,
      quote: { services: [], transportCents: 0, projectedCents: 40_000_000, discounts: [], discountCents: 0, finalCents: 40_000_000 },
      payments: [{ id: 'RES-P-P1', method: 'BANK_TRANSFER', amountCents: 50_000_000, proofName: 'soporte.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)' }] })]);
    const d = demo('TENANT_ADMINISTRATOR', store);
    const user = new (class extends RegisteringUser { override label() { return 'Admin (demo)'; } })();
    const proof = new DemoProofReviewWriter(store, PortalCapabilities.for('TENANT_ADMINISTRATOR'), user, new FixedClock(NOW) as never, new Map(), d.writer);
    await firstValueFrom(proof.decide({ reservationId: 'RES-P', paymentId: 'RES-P-P1', decision: 'APROBADO', verifiedAmountCents: 50_000_000, reason: '' } as never, 'k1'));
    const [paula] = (await overview(d.source)).customers;
    expect(paula).toMatchObject({ name: 'Paula Prueba (demo)', availableCents: 20_000_000 });
    expect(paula.history[0]).toMatchObject({ kind: 'ORIGEN', detail: 'Excedente de comprobante aprobado', reservationId: 'RES-P', amountCents: 20_000_000 });
  });
});

describe('theCreditScreenIsReachedOnlyThroughTheNavigationLinks', () => {
  it('registers a sub-screen of Pagos with no sidebar item, offered only with the ports and the capability', () => {
    const area = PORTAL_AREAS.find((a) => a.key === CREDIT_BALANCE_AREA)!;
    expect(area).toMatchObject({ label: 'Saldo a favor', menu: false, parent: 'payments' });
    expect(area.component).toBe(CreditBalancePageComponent);
    expect(area.isAvailable).toBeTypeOf('function');
  });

  it('opens it from the header of 13 and from 10A with the reservation', async () => {
    const navigation = new PortalNavigation();
    navigation.register([CREDIT_BALANCE_AREA]);
    TestBed.configureTestingModule({ providers: [{ provide: PortalNavigation, useValue: navigation }] });
    const payments = TestBed.createComponent(CreditBalancePaymentsLinkComponent); payments.detectChanges();
    const button = payments.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Saldo a favor');
    button.click();
    expect(navigation.selected()).toBe(CREDIT_BALANCE_AREA);
    const detail = TestBed.createComponent(CreditBalanceDetailLinkComponent);
    detail.componentRef.setInput('reservation', reservationOf('RES-T1'));
    detail.detectChanges();
    (detail.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(detail.nativeElement.textContent).toContain('Ver saldo a favor del cliente');
    expect(navigation.params()).toEqual({ reservation: 'RES-T1' });
  });
});

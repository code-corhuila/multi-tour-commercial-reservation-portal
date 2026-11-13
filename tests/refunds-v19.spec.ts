import { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { DemoCancellationQuote, DemoCancellationWriter, FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoAdditionalDiscountWriter } from '../src/app/demo/current-discounts-demo';
import { RefundsApiSource } from '../src/app/http/refunds-api-sources';
import { fakeClient, page } from './api-client.double';
import { DemoRefundsSource, DemoRefundsWriter } from '../src/app/demo/refunds-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { CreditRequest } from '../src/app/credit-balance/data/credit-balance-ports';
import { PendingProofsSource } from '../src/app/payments/data/proof-review-ports';
import { REFUND_SCREENS, RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { REFUND_ALERTS, RefundAlertsComponent } from '../src/app/refunds/components/refund-alerts.component';
import { RefundDetailPageComponent } from '../src/app/refunds/pages/refund-detail-page.component';
import { RefundRequestsPageComponent } from '../src/app/refunds/pages/refund-requests-page.component';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 against the current mockup (PDR v1.9): hero, panel alerts, marks, reject, credit balance, treatment list. Invented data only.
type Facts = NonNullable<Reservation['refund']>;
const NOW = '2026-10-13T09:30:00-05:00';
const cancelled = (id: string, refund: Facts) => reservationOf(id, { status: 'CANCELADA', validatedCents: 120_000_000, leadCustomerName: `Cliente ${id}`, refund });
const open = (recognizedAt: string): Facts => ({ origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 120_000_000, recognizedAt });
const authorized = (at: string): Facts => ({ ...open('2026-10-01T08:00:00-05:00'), decision: { by: 'Admin (demo)', at }, authorization: { by: 'Admin (demo)', at, reason: 'Ok (demo)' } });
const fixtures = () => new DemoReservationsStore([
  cancelled('RES-P', open('2026-10-13T04:12:00-05:00')), cancelled('RES-Q', open('2026-10-13T08:00:00-05:00')),
  cancelled('RES-X', open('2026-10-12T08:00:00-05:00')), cancelled('RES-V', authorized('2026-10-02T10:00:00-05:00')),
  cancelled('RES-N', { ...open('2026-10-12T08:00:00-05:00'), origin: 'NOT_ATTRIBUTABLE', reason: 'Cancelación no atribuible al cliente (demo)' }),
  cancelled('RES-B', authorized('2026-10-12T17:00:00-05:00')),
]);
/** D-3: the one refund that can be rejected is a request to refund a credit balance (RN-RES-009). */
const REQUEST: CreditRequest = { id: 'SAR-N', reservationId: 'RES-S', customer: 'Cliente RES-S', amountCents: 10_000_000, state: 'PENDIENTE_DE_AUTORIZACION', reason: 'Solicitud del cliente (demo)', requestedBy: 'Cliente',
  requestedAt: '2026-10-13T04:00:00-05:00', decisionDueAt: '2026-10-14T04:00:00-05:00', tenant: 'tenant-demo' };
const USER = new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })();
const demo = (role = 'TENANT_ADMINISTRATOR') => {
  const store = fixtures(), clock = new FixedClock(NOW);
  store.creditRequests = [REQUEST];
  return { store, source: new DemoRefundsSource(store, clock), writer: new DemoRefundsWriter(store, PortalCapabilities.for(role), clock, USER, new Set<string>()) };
};
const byId = async (source: RefundsSource, id: string) => (await firstValueFrom(source.list())).find((r) => r.id === id)!;

function providers(role = 'TENANT_ADMINISTRATOR', id = 'RES-P') {
  const navigation = new PortalNavigation();
  navigation.register([...Object.values(REFUND_SCREENS), 'payments']);
  navigation.params.set({ refund: id });
  const d = demo(role);
  return { navigation, d, list: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: RefundsSource, useValue: d.source },
    { provide: RefundsWriter, useValue: d.writer }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }] as Provider[] };
}
async function screen<T>(component: Type<T>, role?: string, id?: string) {
  const p = providers(role, id);
  TestBed.configureTestingModule({ providers: p.list });
  const fixture = TestBed.createComponent(component);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const texts = (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const field = (label: string) => Array.from(host.querySelectorAll('dl div')).find((d) => d.querySelector('dt')?.textContent?.trim() === label)?.querySelector('dd')?.textContent?.trim();
  const type = async (text: string, index = 0) => { const t = host.querySelectorAll('textarea')[index]; t.value = text; t.dispatchEvent(new Event('input')); await settle(); };
  const choose = async (id: string, value: string) => { const s = host.querySelector<HTMLSelectElement>(`#${id}`)!; s.value = value; s.dispatchEvent(new Event('change')); await settle(); };
  return { ...p, host, settle, button, texts, field, type, choose };
}

describe('refundRequestsHeroAndPanelAlertsFollowTheCurrentMockup', () => {
  it('writes the hero with the 24-hour decision and the 5-business-day execution', async () => {
    const s = await screen(RefundRequestsPageComponent);
    expect(s.texts('.crp-refunds-hero h2, .crp-refunds-hero > p')).toEqual(['Determinación, autorización y ejecución trazables.',
      'Toda devolución registra causal, monto, responsable, fecha y su relación con la reserva y con el movimiento de caja correspondiente. El Administrador del tenant decide en 24 horas corridas; sin decisión se determina la devolución del 100 %, que debe ejecutarse en máximo 5 días hábiles.']);
  });

  it('lists the overdue execution, the decision about to expire with its limit and the automatic determination', async () => {
    const s = await screen(RefundRequestsPageComponent);
    expect(s.texts('[data-refund-alerts] .crp-operator-eyebrow, [data-refund-alerts] h2')).toEqual(['Alertas del panel', 'Devoluciones que requieren atención']);
    expect(s.texts('[data-refund-alerts] li')).toEqual([
      '#RES-V: la ejecución de la devolución ($1.200.000) superó los 5 días hábiles y está vencida; sigue siendo una obligación pendiente.',
      '#RES-P: decisión del Administrador del tenant pendiente hasta el 14 oct 2026 · 04:12; sin decisión se determina la devolución del 100 %.',
      '#RES-Q: decisión del Administrador del tenant pendiente hasta el 14 oct 2026 · 08:00; sin decisión se determina la devolución del 100 %.',
      '#RES-X: devolución determinada automáticamente ($1.200.000), pendiente de ejecución; no implica que el dinero haya sido devuelto.']);
    s.button('Decidir tratamiento de valores abonados')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.treatment);
  });

  it('the Collaborator sees the alerts without the treatment button', async () => {
    const s = await screen(RefundRequestsPageComponent, 'OPERATIONAL_COLLABORATOR');
    expect(s.host.querySelector('[data-refund-alerts]')).toBeTruthy();
    expect(s.button('Decidir tratamiento de valores abonados')).toBeUndefined();
  });

  it('marks the overdue execution and the automatic determination beside the state, and opens every row in the detail', async () => {
    const s = await screen(RefundRequestsPageComponent);
    const row = (code: string) => Array.from(s.host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(code))!;
    expect(Array.from(row('#RES-V').querySelectorAll('small'), (m) => m.textContent)).toEqual(['Ejecución vencida (5 días hábiles)']);
    expect(Array.from(row('#RES-X').querySelectorAll('small'), (m) => m.textContent)).toEqual(['Determinada por Multitour']);
    expect(row('#RES-V').querySelector('.crp-operator-status')?.classList.contains('crp-is-cancelled')).toBe(true);
    expect(row('#RES-P').querySelector('td:last-child button')?.textContent?.trim()).toBe('Decidir tratamiento');
    row('#RES-P').querySelector<HTMLButtonElement>('td:last-child button')!.click();
    expect([s.navigation.selected(), s.navigation.params()]).toEqual([REFUND_SCREENS.detail, { refund: 'RES-P' }]);
  });
});

describe('refundDetailFollowsTheCurrentMockup', () => {
  it('shows "Observación administrativa" and the rule note with the decision limit', async () => {
    const s = await screen(RefundDetailPageComponent);
    expect(s.field('Observación administrativa')).toBe('Sin observaciones registradas.');
    expect(s.field('Método de devolución')).toBe('No aplica');
    expect(s.texts('.crp-access-note')).toContain('Devolución del 100 % por defecto. Decisión del Administrador del tenant antes del 14 oct 2026 · 04:12; si no decide, Multitour determina la devolución del 100 %.');
    expect(s.host.textContent).not.toContain('parametrizada en el PDR');
  });

  it('shows the overdue note, the execution limit and "Ejecución vencida" in the state', async () => {
    const s = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-V');
    expect(s.field('Estado actual')).toBe('Autorizada · Ejecución vencida');
    expect(s.texts('.crp-access-note')).toEqual(expect.arrayContaining([
      'La ejecución superó el plazo máximo de 5 días hábiles: la devolución está vencida y sigue siendo una obligación pendiente hasta que se ejecute.',
      'Devolución del 100 % por defecto. Ejecución máxima: 09 oct 2026 · 10:00 (5 días hábiles).']));
  });

  it('a refund pending its decision offers the treatment buttons and registers the credit balance with a reason', async () => {
    const s = await screen(RefundDetailPageComponent);
    expect(s.texts('.crp-form-actions button')).toEqual(['Registrar saldo a favor del 100 %', 'Devolver el 100 %']);
    await s.button('Registrar saldo a favor del 100 %')!.click(); await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Registra el motivo de la decisión.');
    await s.type('El cliente prefiere conservar el valor (demo)');
    s.button('Registrar saldo a favor del 100 %')!.click(); await s.settle();
    expect(s.field('Estado actual')).toBe('Saldo a favor');
    expect(s.field('Motivo de la decisión')).toBe('El cliente prefiere conservar el valor (demo)');
    expect(s.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('El 100 % quedó registrado como saldo a favor del cliente dentro del tenant.');
  });

  it('"Devolver el 100 %" records the decision and keeps the refund waiting for its authorization', async () => {
    const s = await screen(RefundDetailPageComponent);
    await s.type('Devolución solicitada por el cliente (demo)');
    s.button('Devolver el 100 %')!.click(); await s.settle();
    expect((await byId(s.d.source, 'RES-P')).state).toBe('PENDIENTE_DE_AUTORIZACION');
  });

  it('the Administrator rejects a refund with a justified reason, and the state reads Rechazada', async () => {
    const s = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'SAR-N');
    s.button('Rechazar devolución')!.click(); await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Registra el motivo del rechazo.');
    await s.type('No corresponde la devolución (demo)');
    s.button('Rechazar devolución')!.click(); await s.settle();
    expect([s.field('Estado actual'), s.field('Motivo de la decisión'), s.field('Responsable')]).toEqual(['Rechazada', 'No corresponde la devolución (demo)', 'Ana Torres (demo)']);
    expect(s.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Devolución rechazada correctamente.');
    expect(s.button('Autorizar devolución')!.disabled).toBe(true);
  });

  it('the Collaborator sees no decision panel', async () => {
    const s = await screen(RefundDetailPageComponent, 'OPERATIONAL_COLLABORATOR', 'RES-N');
    expect(s.button('Rechazar devolución')).toBeUndefined();
  });

  it('execution without a money outflow stays as a credit balance', async () => {
    const s = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-B');
    expect(Array.from(s.host.querySelectorAll('#crp-refunds-outflow option'), (o) => o.textContent?.trim())).toEqual(
      ['Selecciona una opción', 'Sí, se realizó la salida de dinero', 'No, se registra como saldo a favor']);
    expect(s.host.querySelector('.crp-refunds-feedback')?.textContent).toContain('Una devolución en efectivo exige la caja abierta; por transferencia después del cierre se registra sin reabrir la caja.');
    await s.choose('crp-refunds-outflow', 'no');
    expect(s.host.querySelector('#crp-refunds-method')).toBeNull();
    s.host.querySelectorAll('form')[0].dispatchEvent(new Event('submit', { cancelable: true })); await s.settle();
    expect([s.field('Estado actual'), s.field('Movimiento de caja asociado')]).toEqual(['Saldo a favor', 'No aplica']);
    expect(s.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Registrado como saldo a favor del cliente dentro del tenant: no hubo salida efectiva de dinero.');
  });
});

describe('writerRecordsRejectionAndCreditBalance', () => {
  it('rejects only a refund pending authorization, with a reason and from the Administrator', async () => {
    const { writer, source } = demo();
    await expect(firstValueFrom(demo('OPERATIONAL_COLLABORATOR').writer.reject('SAR-N', 'No', 'k1'))).rejects.toMatchObject({ status: 403 });
    await expect(firstValueFrom(writer.reject('SAR-N', '  ', 'k2'))).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(writer.reject('RES-P', 'Antes de decidir', 'k3'))).rejects.toMatchObject({ status: 409 });
    expect(await firstValueFrom(writer.reject('SAR-N', 'No procede (demo)', 'k4'))).toMatchObject({ state: 'RECHAZADA', decisionReason: 'No procede (demo)', owner: 'Ana Torres (demo)' });
    expect((await byId(source, 'SAR-N')).state).toBe('RECHAZADA');
  });

  it('keeps the 100 % as a credit balance only while the decision is open, and never lists it as a pending treatment', async () => {
    const { writer, source } = demo();
    await expect(firstValueFrom(writer.keepAsCreditBalance('RES-N', 'Motivo', 'k1'))).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(writer.keepAsCreditBalance('RES-P', '', 'k2'))).rejects.toMatchObject({ status: 409 });
    expect(await firstValueFrom(writer.keepAsCreditBalance('RES-P', 'Saldo (demo)', 'k3'))).toMatchObject({ state: 'SALDO_A_FAVOR', decisionReason: 'Saldo (demo)', remainingMinutes: null });
    expect((await byId(source, 'RES-P')).state).toBe('SALDO_A_FAVOR');
  });

  it('executing without outflow ends in credit balance with no cash movement', async () => {
    const { writer } = demo();
    const outcome = await firstValueFrom(writer.executeRefund('RES-B', null, 'k1'));
    expect(outcome.kind).toBe('credit-balance');
    expect(outcome.refund).toMatchObject({ state: 'SALDO_A_FAVOR', cashMovement: null, method: null });
    expect(await firstValueFrom(writer.executeRefund('RES-B', null, 'k1'))).toEqual(outcome);
  });
});

describe('pendingTreatmentsAreListedAsCards', () => {
  it('lists every treatment waiting for a decision with the values, the counter and the three actions', async () => {
    const s = await screen(RefundTreatmentPageComponent);
    expect(s.texts('article .crp-operator-eyebrow')).toEqual(['Reserva #RES-P · Cliente RES-P', 'Reserva #RES-Q · Cliente RES-Q']);
    expect(s.texts('article h2')).toEqual(['Valores abonados: $1.200.000', 'Valores abonados: $1.200.000']);
    expect(s.texts('article .crp-operator-status')).toEqual(['Quedan 18 h 42 min', 'Quedan 22 h 30 min']);
    expect(s.texts('article:first-of-type .crp-operator-copy')[0]).toBe('Cancelada por falta de pago');
    expect(s.texts('article:first-of-type button')).toEqual(['Registrar devolución del 100 %', 'Registrar saldo a favor del 100 %', 'Ver detalle']);
    expect(s.host.querySelector('article label')?.textContent).toContain('Motivo de la decisión (obligatorio)');
  });

  it('registers the credit balance of one card with its reason, and the card leaves the list', async () => {
    const s = await screen(RefundTreatmentPageComponent);
    s.host.querySelectorAll<HTMLButtonElement>('article')[0].querySelectorAll('button')[1].click(); await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Registra el motivo de la decisión.');
    await s.type('Saldo a favor (demo)');
    s.host.querySelectorAll<HTMLButtonElement>('article')[0].querySelectorAll('button')[1].click(); await s.settle();
    expect((await byId(s.d.source, 'RES-P')).state).toBe('SALDO_A_FAVOR');
    expect(s.texts('article .crp-operator-eyebrow')).toEqual(['Reserva #RES-Q · Cliente RES-Q']);
    expect(s.host.querySelector('[role="status"]')?.textContent).toContain('El 100 % quedó registrado como saldo a favor del cliente dentro del tenant');
  });

  it('opens the detail from a card, and only the Administrator reaches the list', async () => {
    const s = await screen(RefundTreatmentPageComponent);
    s.host.querySelectorAll<HTMLButtonElement>('article')[1].querySelectorAll('button')[2].click();
    expect([s.navigation.selected(), s.navigation.params()]).toEqual([REFUND_SCREENS.detail, { refund: 'RES-Q' }]);
    TestBed.resetTestingModule();
    const collaborator = await screen(RefundTreatmentPageComponent, 'OPERATIONAL_COLLABORATOR');
    expect(collaborator.host.querySelectorAll('article')).toHaveLength(0);
    expect(collaborator.navigation.selected()).toBe(REFUND_SCREENS.requests);
  });
});

describe('notificationsShowTheRefundAlertsOfTheCurrentMockup', () => {
  it('shows each decision pending with its countdown and each overdue refund', async () => {
    const s = await screen(RefundAlertsComponent);
    expect(s.texts('.crp-refunds-alert-copy')).toEqual(expect.arrayContaining([
      'Devolución pendiente de decisión · RES-P Decisión del Administrador del tenant: quedan 18 h 42 min. Si no decide en 24 horas, Multitour determina la devolución del 100 %. Abrir',
      'Devolución vencida · RES-V Superó los 5 días hábiles para ejecutarse. Sigue siendo una obligación pendiente. Abrir']));
    expect(s.texts('.crp-refunds-alert-icon')[0]).toBe('DV');
    expect(REFUND_ALERTS.isAvailable).toBeTruthy();
  });

  it('adds the priority alert of proofs with an overdue review when the review port exists, before the refund alerts', async () => {
    const proofs = new (class extends PendingProofsSource { override list() { return of({ rows: [{ reservation: reservationOf('RES-Z'), payment: {} as never, overdue: true },
      { reservation: reservationOf('RES-Y'), payment: {} as never, overdue: false }], overdueCount: 1 }); } })();
    const p = providers();
    TestBed.configureTestingModule({ providers: [...p.list, { provide: PendingProofsSource, useValue: proofs }] });
    const fixture = TestBed.createComponent(RefundAlertsComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('.crp-refunds-alert') as HTMLElement;
    expect(first.querySelector('.crp-refunds-alert-icon')?.textContent).toBe('CP');
    expect(first.querySelector('strong')?.textContent).toBe('Alerta prioritaria · Comprobantes con revisión vencida (1)');
    expect(first.textContent).toContain('Reservas RES-Z: llevan más de 24 horas corridas En validación. Siguen pendientes: no cancelan la reserva ni liberan cupos.');
    first.querySelector('button')!.click();
    expect(p.navigation.selected()).toBe('payments');
  });
});

// HU-COM-016 AC-RF.11: the portal has no RefundRecognizer; the money is recognized by the cancellation, the discount or the service, and the portal draws the 24 hours
// from the decision it is handed (demo adapter or service decision), with nobody opening a refund screen. Invented data only.
const RECOGNIZED = '2026-10-13T09:30:00-05:00';
const over = (store: DemoReservationsStore, now = RECOGNIZED) => {
  const clock = new FixedClock(now);
  return { store, clock, source: new DemoRefundsSource(store, clock) };
};
class StoredReservations extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const SERVICE_NOW = Date.parse('2026-11-10T12:00:00Z');
const names = new StoredReservations([reservationOf('r-1', { leadCustomerName: 'Laura Gómez (demo)' }), reservationOf('r-2', { leadCustomerName: 'Carlos Ruiz (demo)' })]);
const decisionOf = (changes: object) => ({ financialDecisionId: 'd-1', reservationId: 'r-1', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 5_000_000, recognizedAt: '2026-11-10T10:00:00Z',
  decisionDueAt: '2026-11-11T10:00:00Z', frozen: false, ...changes });
/** The refunds as the container answers them: the decisions of the service, joined by reservation, at a fixed clock. */
const fromService = (decisions: object[], refunds: object[] = []) => {
  const { client } = fakeClient({ ok: page(decisions) }, { ok: page(refunds) });
  return new RefundsApiSource(client, names, () => SERVICE_NOW);
};
async function mount<T>(component: Type<T>, source: RefundsSource, role = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation();
  navigation.register([...Object.values(REFUND_SCREENS), 'payments']);
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: RefundsSource, useValue: source },
    { provide: RefundsWriter, useValue: demo(role).writer }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return { host, texts: (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim()) };
}

describe('theTwentyFourHoursStartAtTheRecognitionOfTheMoney', () => {
  it('customerCancellationWithTheDemoPenaltyStartsTheTwentyFourHours', async () => {
    const { store, clock, source } = over(new DemoReservationsStore([reservationOf('RES-C', { status: 'CONFIRMADA', validatedCents: 10_000_000, balanceCents: 0, leadCustomerName: 'Cliente RES-C' })]));
    const cancellation = new DemoCancellationWriter(store, new DemoCancellationQuote(store, 20), clock, 'Cliente (demo)');
    await firstValueFrom(cancellation.cancel({ code: 'RES-C', cause: 'El cliente desiste del viaje (demo)', origin: 'customer', idempotencyKey: 'cancel-1' }));
    const refund = (await firstValueFrom(source.list())).find((r) => r.id === 'RES-C')!;
    expect(refund).toMatchObject({ state: 'PENDIENTE_DE_DECISION', amountCents: 8_000_000, reason: 'El cliente desiste del viaje (demo)', remainingMinutes: 24 * 60,
      decisionDueAt: '2026-10-14T09:30:00-05:00', defaulted: false });
    const s = await mount(RefundTreatmentPageComponent, source);
    expect(s.texts('article .crp-operator-eyebrow')).toEqual(['Reserva #RES-C · Cliente RES-C']);
    expect(s.texts('article h2')).toEqual(['Valores abonados: $80.000']);
    expect(s.texts('article .crp-operator-status')).toEqual(['Quedan 24 h 00 min']);
  });

  it('proofApprovedAfterTheCancellationStartsTheTwentyFourHours', async () => {
    const late = () => fromService([decisionOf({ kind: 'PENDING_TREATMENT', reservationId: 'r-2', financialDecisionId: 'd-late' })]);
    const refund = (await firstValueFrom(late().list())).find((r) => r.id === 'r-2')!;
    expect(refund).toMatchObject({ state: 'PENDIENTE_DE_DECISION', reason: 'Tratamiento pendiente de valores abonados', amountCents: 5_000_000, remainingMinutes: 22 * 60,
      decisionDueAt: '2026-11-11T10:00:00Z', defaulted: false });
    const s = await mount(RefundTreatmentPageComponent, late());
    expect(s.texts('article .crp-operator-eyebrow')).toEqual(['Reserva #r-2 · Carlos Ruiz (demo)']);
    expect(s.texts('article h2')).toEqual(['Valores abonados: $50.000']);
    expect(s.texts('article .crp-operator-status')).toEqual(['Quedan 22 h 00 min']);
  });

  it('excessOfALowerValueStartsTheTwentyFourHours', async () => {
    const { store, clock, source } = over(new DemoReservationsStore([reservationOf('RES-L', { status: 'CONFIRMADA', validatedCents: 10_000_000, balanceCents: 0, leadCustomerName: 'Cliente RES-L',
      quote: { services: [{ name: 'Guianza', cents: 10_000_000 }], transportCents: 0, projectedCents: 10_000_000, discounts: [], discountCents: 0, finalCents: 10_000_000 } })]));
    const discount = new DemoAdditionalDiscountWriter(store, clock, new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })());
    await firstValueFrom(discount.register({ reservationId: 'RES-L', percentageBasisPoints: 2000, reason: 'Fidelización (demo)' }, 'discount-1'));
    const refund = (await firstValueFrom(source.list())).find((r) => r.id === 'RES-L')!;
    expect(refund).toMatchObject({ state: 'PENDIENTE_DE_DECISION', amountCents: 2_000_000, remainingMinutes: 24 * 60, decisionDueAt: '2026-10-14T09:30:00-05:00', defaulted: false });
    expect(refund.reason).toContain('Fidelización (demo)');
    const s = await mount(RefundTreatmentPageComponent, source);
    expect(s.texts('article h2')).toEqual(['Valores abonados: $20.000']);
    expect(s.texts('article .crp-operator-status')).toEqual(['Quedan 24 h 00 min']);
    const service = await firstValueFrom(fromService([decisionOf({ kind: 'MODIFICATION_EXCESS', baseAmountCents: 2_000_000 })]).list());
    expect(service[0]).toMatchObject({ state: 'PENDIENTE_DE_DECISION', reason: 'Excedente por modificación', amountCents: 2_000_000, remainingMinutes: 22 * 60 });
  });
});

describe('theRefundListShowsTheCreditBalanceRequestOfTheService', () => {
  it('creditBalanceRequestIsListedWithItsOrigin', async () => {
    const source = fromService([decisionOf({ kind: 'CREDIT_BALANCE_REFUND_REQUEST', reservationId: 'r-2', financialDecisionId: 'd-credit', baseAmountCents: 3_000_000 })]);
    const s = await mount(RefundRequestsPageComponent, source);
    expect(s.texts('.crp-operator-status')[0]).toBe('1 solicitud');
    expect(s.texts('tbody tr:first-child td').slice(0, 4)).toEqual(['#r-2', 'Carlos Ruiz (demo)', 'Solicitud de devolución de saldo a favor', '$30.000']);
  });
});

describe('rejectionIsOfferedOnlyWhilePendingAuthorizationAndToTheAdministrator', () => {
  const rejectOffered = async (id: string, role = 'TENANT_ADMINISTRATOR') => {
    const s = await screen(RefundDetailPageComponent, role, id);
    return s.button('Rechazar devolución') !== undefined;
  };
  it('draws "Rechazar devolución" for a refund pending its authorization, with the Administrator only', async () => {
    expect(await rejectOffered('SAR-N')).toBe(true);
    TestBed.resetTestingModule();
    expect(await rejectOffered('SAR-N', 'OPERATIONAL_COLLABORATOR')).toBe(false);
  });

  it('does not draw it while the 24 hours run (the treatment buttons instead), nor once authorized', async () => {
    const treatment = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-P');
    expect([treatment.button('Rechazar devolución'), treatment.button('Autorizar devolución')]).toEqual([undefined, undefined]);
    expect(treatment.texts('.crp-form-actions button')).toEqual(['Registrar saldo a favor del 100 %', 'Devolver el 100 %']);
    TestBed.resetTestingModule();
    expect(await rejectOffered('RES-B')).toBe(false);
    TestBed.resetTestingModule();
    expect(await rejectOffered('RES-V')).toBe(false);
  });

  it('refuses the rejection of a refund that is not pending its authorization and asks for the reason', async () => {
    const { writer } = demo();
    await expect(firstValueFrom(writer.reject('RES-B', 'No procede (demo)', 'k1'))).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(writer.reject('RES-N', '', 'k2'))).rejects.toMatchObject({ status: 409 });
    expect(await firstValueFrom(writer.reject('SAR-N', 'No procede (demo)', 'k3'))).toMatchObject({ state: 'RECHAZADA' });
  });
});

// HU-COM-016 AC-RF.13: the literals of mockup-pdr-1 v1.9 (admin-solicitudes-devolucion.html, admin-detalle-devolucion.html, admin-tratamiento-pendiente-devolucion.html and app.js), typed here
// as the mockup writes them. Differences declared in the spec (A.2) are not repeated: the reservation-level texts that the screens draw from data are covered above.
describe('refundTextsMatchTheMockupV19', () => {
  const header = (s: { texts: (selector: string) => (string | undefined)[] }) => s.texts('.crp-page-header-eyebrow, h1, .crp-page-header-action');

  it('the list draws the frame, the hero, the columns, the count and the empty text of admin-solicitudes-devolucion.html', async () => {
    const s = await mount(RefundRequestsPageComponent, over(new DemoReservationsStore([])).source);
    expect(header(s)).toEqual(['Control de cobro', 'Solicitudes de devolución', 'Volver a pagos']);
    expect(s.texts('.crp-refunds-hero .crp-operator-eyebrow, .crp-refunds-hero h2')).toEqual(['Devoluciones monetarias', 'Determinación, autorización y ejecución trazables.']);
    expect(s.texts('.crp-operator-panel .crp-operator-eyebrow, .crp-operator-panel h2')).toEqual(['Solicitudes', 'Solicitudes registradas']);
    expect(s.texts('.crp-operator-status')).toEqual(['0 solicitudes']);
    expect(s.texts('thead th')).toEqual(['Reserva', 'Cliente', 'Motivo', 'Monto', 'Estado', 'Fecha', 'Acción']);
    expect(s.texts('[data-state="empty"]')).toEqual(['No hay solicitudes de devolución registradas.']);
    expect(s.host.querySelector('[data-refund-alerts]')).toBeNull();
  });

  it('the detail draws the frame, the notices, the rows and the decision panel of admin-detalle-devolucion.html', async () => {
    const s = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'SAR-N');
    expect(header(s)).toEqual(['Control de cobro', 'Detalle de devolución', 'Volver a solicitudes']);
    expect(s.texts('.crp-access-note')[0]).toBe('Solo el Administrador del tenant puede autorizar o rechazar una devolución o decidir el tratamiento de valores abonados. El Colaborador operativo solo puede registrar la ejecución cuando exista autorización previa y trazable (o una determinación automática, que cuenta como autorización).');
    expect(s.texts('dl dt')).toEqual(['Reserva relacionada', 'Cliente', 'Motivo / causal', 'Observación administrativa', 'Monto', 'Motivo de la decisión', 'Responsable', 'Fecha',
      'Método de devolución', 'Movimiento de caja asociado', 'Estado actual']);
    expect(s.texts('.crp-operator-panel > .crp-operator-eyebrow, .crp-operator-panel > h2')).toEqual(['Solicitud', 'Información de la devolución', 'Decisión', 'Decisión del Administrador del tenant']);
    expect(s.texts('label')).toEqual(['Motivo (obligatorio)']);
    expect(s.texts('.crp-refunds-feedback')).toEqual(['Registra el motivo y toma la decisión.']);
    expect(s.texts('.crp-form-actions button')).toEqual(['Rechazar devolución', 'Autorizar devolución']);
  });

  it('the detail of a refund in treatment offers the two treatment buttons, and the overdue one its notice', async () => {
    const treatment = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-P');
    expect(treatment.texts('.crp-form-actions button')).toEqual(['Registrar saldo a favor del 100 %', 'Devolver el 100 %']);
    TestBed.resetTestingModule();
    const overdue = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-V');
    expect(overdue.texts('.crp-access-note')[1]).toBe('La ejecución superó el plazo máximo de 5 días hábiles: la devolución está vencida y sigue siendo una obligación pendiente hasta que se ejecute.');
  });

  it('the execution panel draws its question, its options, the methods and its note as the mockup does', async () => {
    const s = await screen(RefundDetailPageComponent, 'TENANT_ADMINISTRATOR', 'RES-B');
    expect(s.texts('.crp-operator-panel > .crp-operator-eyebrow, .crp-operator-panel > h2').slice(-2)).toEqual(['Ejecución', 'Registrar ejecución']);
    expect(s.texts('label')).toEqual(['¿Hubo salida efectiva de dinero?']);
    expect(s.texts('#crp-refunds-outflow option')).toEqual(['Selecciona una opción', 'Sí, se realizó la salida de dinero', 'No, se registra como saldo a favor']);
    await s.choose('crp-refunds-outflow', 'yes');
    expect(s.texts('label')).toEqual(['¿Hubo salida efectiva de dinero?', 'Método de devolución']);
    expect(s.texts('#crp-refunds-method option')).toEqual(['Transferencia', 'Efectivo']);
    expect(s.texts('.crp-refunds-feedback')).toEqual(['Registra la ejecución de la devolución autorizada. Una devolución en efectivo exige la caja abierta; por transferencia después del cierre se registra sin reabrir la caja.']);
    expect(s.texts('.crp-form-actions button')).toEqual(['Registrar ejecución de devolución']);
  });

  it('the treatment list draws its empty text and each card its rule, its motive and its counter as app.js does', async () => {
    const empty = await mount(RefundTreatmentPageComponent, over(new DemoReservationsStore([])).source);
    expect(empty.texts('[data-state="empty"]')).toEqual(['No hay valores abonados pendientes de tratamiento.']);
    TestBed.resetTestingModule();
    const s = await screen(RefundTreatmentPageComponent);
    expect(s.texts('article .crp-operator-copy')[1]).toBe('Tratamiento pendiente. Dentro de 24 horas corridas desde el reconocimiento del dinero, decide entre devolver el 100 % o registrar el 100 % como saldo a favor. Sin decisión se aplica la devolución del 100 % (pendiente de ejecución en máximo 5 días hábiles).');
    expect(s.host.querySelector('article textarea')?.getAttribute('placeholder')).toBe('Registra el motivo de la decisión');
  });
});

import { readFileSync } from 'node:fs';
import { ChangeDetectionStrategy, Component, Injector, Provider, Type, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoRefundsSource, DemoRefundsWriter } from '../src/app/demo/refunds-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { Reservation } from '../src/app/reservations/model/reservation';
import { REFUND_SCREENS, Refund, RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { REFUND_ALERTS, RefundAlertsComponent } from '../src/app/refunds/components/refund-alerts.component';
import { REFUND_DETAIL_LINK, RefundLinkComponent } from '../src/app/refunds/components/refund-link.component';
import { RefundManagePageComponent } from '../src/app/refunds/pages/refund-manage-page.component';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { RefundRequestsPageComponent } from '../src/app/refunds/pages/refund-requests-page.component';
import { RefundDetailPageComponent } from '../src/app/refunds/pages/refund-detail-page.component';
import { NotificationsPageComponent } from '../src/app/refunds/pages/notifications-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { OPERATOR_NOTIFICATIONS, REFUND_TREATMENT_ACTIONS, contribute } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 (#182): the 24 hours, the default and its alert (AC-RF.6), the five business days (AC-RF.7), and the screens that lead to them.
type Facts = NonNullable<Reservation['refund']>;
const NOW = '2026-10-13T09:30:00-05:00';
const cancelled = (id: string, refund: Facts, over: Partial<Reservation> = {}) =>
  reservationOf(id, { status: 'CANCELADA', validatedCents: 120_000_000, leadCustomerName: `Cliente ${id}`, refund, ...over });
const open = (recognizedAt: string): Facts => ({ origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 120_000_000, recognizedAt });
const authorizedAt = (at: string): Facts => ({ ...open('2026-10-01T08:00:00-05:00'), decision: { by: 'Admin (demo)', at }, authorization: { by: 'Admin (demo)', at, reason: 'Ok (demo)' } });
const fixtures = () => new DemoReservationsStore([
  cancelled('RES-P', open('2026-10-13T04:12:00-05:00')),
  cancelled('RES-X', open('2026-10-12T08:00:00-05:00')),
  cancelled('RES-V', authorizedAt('2026-10-02T10:00:00-05:00')),
  cancelled('RES-N', { ...open('2026-10-12T08:00:00-05:00'), origin: 'NOT_ATTRIBUTABLE', reason: 'Cancelación no atribuible al cliente (demo)' }),
]);
const USER = new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })();
const demo = (role = 'TENANT_ADMINISTRATOR', now = NOW, store = fixtures()) => ({
  store, source: new DemoRefundsSource(store, new FixedClock(now)),
  writer: new DemoRefundsWriter(store, PortalCapabilities.for(role), new FixedClock(now), USER, new Set<string>()),
});
const byId = async (source: RefundsSource, id: string) => (await firstValueFrom(source.list())).find((r) => r.id === id)!;

class ControllableSource extends RefundsSource {
  readonly requests: Subject<readonly Refund[]>[] = [];
  override list(): Observable<readonly Refund[]> { const s = new Subject<readonly Refund[]>(); this.requests.push(s); return s; }
}

/** Stands in for the credit balance action of HU-COM-017: it shows the inputs the treatment page passes. */
@Component({ selector: 'app-treatment-action-double', changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<button type="button" class="crp-operator-outline" (click)="changed()?.()">Registrar saldo a favor del 100 %</button><i>{{ reservationId() }}|{{ decided() }}</i>' })
class TreatmentActionDouble {
  readonly reservationId = input('');
  readonly decided = input(false);
  readonly changed = input<(() => void) | undefined>(undefined);
}

function providers(o: { role?: string; id?: string; now?: string; source?: RefundsSource; extra?: Provider[] } = {}) {
  const navigation = new PortalNavigation();
  navigation.register(Object.values(REFUND_SCREENS));
  navigation.params.set({ refund: o.id ?? 'RES-P' });
  const d = demo(o.role, o.now);
  return { navigation, d, list: [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'TENANT_ADMINISTRATOR') as never) },
    { provide: RefundsSource, useValue: o.source ?? d.source },
    { provide: RefundsWriter, useValue: d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
    ...(o.extra ?? []),
  ] as Provider[] };
}
async function render<T>(component: Type<T>, list: Provider[], inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: list });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const texts = (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim());
  return { fixture, host, settle, button, texts };
}
const screen = <T>(component: Type<T>, o: Parameters<typeof providers>[0] = {}) => { const p = providers(o); return render(component, p.list).then((s) => ({ ...s, ...p })); };

describe('everyRefundScreenShowsOneOfTheFourStates', () => {
  it.each([RefundManagePageComponent, RefundTreatmentPageComponent])('%o shows loading, error with retry, the unknown refund and data', async (component) => {
    const source = new ControllableSource();
    const s = await screen(component as Type<unknown>, { source, id: 'RES-Z' });
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    source.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    source.requests[1].next(await firstValueFrom(demo().source.list())); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No se encontró la solicitud seleccionada.');
  });

  it('the alerts show loading, error with a retry that asks again, and the empty text when no default applies', async () => {
    const source = new ControllableSource();
    const s = await screen(RefundAlertsComponent, { source });
    expect(s.host.querySelector('[data-state="loading"]')).toBeTruthy();
    source.requests[0].error(new Error('down')); await s.settle();
    s.button('Reintentar')!.click(); await s.settle();
    expect(source.requests).toHaveLength(2);
    source.requests[1].next((await firstValueFrom(demo().source.list())).filter((r) => !r.defaulted)); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No hay alertas pendientes.');
  });

  it('the treatment tag and the execution selects keep the compact size of the mockup', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.crp-refunds-hero > \.crp-operator-status \{[^}]*align-self: start;[^}]*justify-self: end;/);
    expect(css).toMatch(/\.crp-refunds-form select \{[^}]*font-size: 0\.86rem;/);
  });
});

describe('manageAndTreatmentShowTheRefundOf10A', () => {
  it('10A offers "Gestionar devolución" only on a reservation with a refund, and opens the manage screen', async () => {
    const p = providers();
    const s = await render(RefundLinkComponent, p.list, { reservation: fixtures().items[0] });
    s.button('Gestionar devolución')!.click();
    expect(p.navigation.selected()).toBe(REFUND_SCREENS.manage);
    expect(p.navigation.params()).toEqual({ refund: 'RES-P' });
    TestBed.resetTestingModule();
    const none = await render(RefundLinkComponent, providers().list, { reservation: reservationOf('RES-Q') });
    expect(none.host.querySelectorAll('button')).toHaveLength(0);
    TestBed.resetTestingModule();
    const fresh = await render(RefundLinkComponent, providers().list, { reservation: fixtures().items[0], fresh: true });
    expect(fresh.host.querySelectorAll('button')).toHaveLength(0);
    expect(REFUND_DETAIL_LINK.order).toBe(10);
  });

  it('the manage screen shows the treatment, the values, the counter and opens the decision and the detail', async () => {
    const s = await screen(RefundManagePageComponent);
    expect(s.texts('h1, h2, .crp-operator-eyebrow, .crp-page-header-eyebrow')).toEqual(expect.arrayContaining(['RF-015B · D1 · E16', 'Gestionar devolución',
      'Reserva RES-P cancelada por falta de pago', 'Tratamiento pendiente', 'Solicitud de tratamiento']));
    expect(s.texts('p')).toEqual(expect.arrayContaining([
      'Valores abonados: $1.200.000. El Administrador del tenant decide dentro de 24 horas corridas entre devolver el 100 % o registrar el 100 % como saldo a favor.',
      'Sin decisión se aplica la devolución del 100 %. La ejecución debe completarse en máximo 5 días hábiles.']));
    expect(s.host.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('Quedan 18 h 42 min');
    s.button('Abrir decisión')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.treatment);
    s.button('Ver detalle y ejecución')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.detail);
    s.button('Volver a solicitudes')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.requests);
  });

  it('a refund with no 24-hour choice shows its 100 % and its state, without "Abrir decisión"', async () => {
    const s = await screen(RefundManagePageComponent, { id: 'RES-N' });
    expect(s.texts('p')).toContain('Valores abonados: $1.200.000.');
    expect(s.host.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('Pendiente de autorización');
    expect(s.button('Abrir decisión')).toBeUndefined();
  });

  it('the Collaborator manages without "Abrir decisión"', async () => {
    const s = await screen(RefundManagePageComponent, { role: 'OPERATIONAL_COLLABORATOR' });
    expect(s.button('Abrir decisión')).toBeUndefined();
    expect(s.button('Ver detalle y ejecución')).toBeTruthy();
  });

  it('the list opens the manage screen for a refund pending its decision', async () => {
    const s = await screen(RefundRequestsPageComponent);
    s.host.querySelector<HTMLButtonElement>('tbody tr:first-child td:last-child button')!.click();
    expect([s.navigation.selected(), s.navigation.params()]).toEqual([REFUND_SCREENS.manage, { refund: 'RES-P' }]);
  });
});

describe('expiredCounterDeterminesTheFullRefundAsAuthorized', () => {
  it('counts the 24 running hours and, once they end, records the 100 % refund as authorized by "Determinación automática", once', async () => {
    const { source, store } = demo();
    expect(await byId(source, 'RES-P')).toMatchObject({ state: 'PENDIENTE_DE_DECISION', remainingMinutes: 18 * 60 + 42, defaulted: false });
    expect(await byId(source, 'RES-X')).toMatchObject({ state: 'AUTORIZADA', remainingMinutes: null, defaulted: true, owner: 'Determinación automática',
      decisionReason: 'Sin decisión se aplica la devolución del 100 %.', amountCents: 120_000_000 });
    const recorded = store.items.find((r) => r.id === 'RES-X')!.refund!;
    expect(recorded.authorization).toEqual({ by: 'Determinación automática', at: '2026-10-13T08:00:00-05:00', reason: 'Sin decisión se aplica la devolución del 100 %.' });
    await firstValueFrom(source.list());
    expect(store.items.find((r) => r.id === 'RES-X')!.refund).toBe(recorded);
    const later = demo('TENANT_ADMINISTRATOR', '2026-10-14T04:12:00-05:00');
    expect(await byId(later.source, 'RES-P')).toMatchObject({ state: 'AUTORIZADA', defaulted: true });
  });

  it('"Registrar devolución del 100 %" records the decision before the counter ends and hands over to the detail', async () => {
    const p = providers({ extra: [contribute(REFUND_TREATMENT_ACTIONS, { component: TreatmentActionDouble, order: 0 })] });
    const s = await render(RefundTreatmentPageComponent, p.list);
    expect(s.texts('h1, h2, .crp-operator-eyebrow')).toEqual(expect.arrayContaining(['Tratamiento pendiente de devolución', 'Reserva RES-P cancelada por falta de pago',
      'Valores abonados: $1.200.000', 'Decisión del Administrador del tenant', 'Ejecución']));
    expect(s.host.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('Quedan 18 h 42 min');
    expect(s.texts('.crp-form-actions button')).toEqual(['Registrar devolución del 100 %', 'Registrar saldo a favor del 100 %']);
    expect(s.host.querySelector('i')?.textContent).toBe('RES-P|false');
    s.button('Registrar devolución del 100 %')!.click(); s.button('Registrar devolución del 100 %')?.click(); await s.settle();
    expect(p.d.store.items.find((r) => r.id === 'RES-P')!.refund!.decision).toEqual({ by: 'Ana Torres (demo)', at: NOW });
    expect(await byId(p.d.source, 'RES-P')).toMatchObject({ state: 'PENDIENTE_DE_AUTORIZACION' });
    expect([p.navigation.selected(), p.navigation.params()]).toEqual([REFUND_SCREENS.detail, { refund: 'RES-P' }]);
  });

  it('a contribution that records a credit balance closes "Registrar devolución del 100 %", and a closed treatment offers none', async () => {
    const extra = [contribute(REFUND_TREATMENT_ACTIONS, { component: TreatmentActionDouble, order: 0 })];
    const s = await screen(RefundTreatmentPageComponent, { extra });
    s.button('Registrar saldo a favor del 100 %')!.click(); await s.settle();
    expect(s.button('Registrar devolución del 100 %')).toBeUndefined();
    expect(s.host.querySelector('i')?.textContent).toBe('RES-P|true');
    TestBed.resetTestingModule();
    const expired = await screen(RefundTreatmentPageComponent, { id: 'RES-X', extra });
    expect(expired.button('Registrar devolución del 100 %')).toBeUndefined();
    expect(expired.host.querySelector('i')?.textContent).toBe('RES-X|true');
  });

  it('the writer refuses the decision from a Collaborator and after the 24 hours', async () => {
    await expect(firstValueFrom(demo('OPERATIONAL_COLLABORATOR').writer.decideFullRefund('RES-P', 'k1'))).rejects.toMatchObject({ status: 403 });
    await expect(firstValueFrom(demo().writer.decideFullRefund('RES-X', 'k1'))).rejects.toMatchObject({ status: 409 });
    const { writer } = demo();
    expect(await firstValueFrom(writer.decideFullRefund('RES-P', 'k2'))).toEqual(await firstValueFrom(writer.decideFullRefund('RES-P', 'k2')));
  });

  it('only who authorizes reaches the treatment screen', () => {
    const area = PORTAL_AREAS.find((a) => a.key === REFUND_SCREENS.treatment)!;
    const as = (role: string) => Injector.create({ providers: [{ provide: PortalCapabilities, useValue: PortalCapabilities.for(role) },
      { provide: RefundsSource, useValue: demo().source }, { provide: RefundsWriter, useValue: demo().writer }] });
    expect(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'ANALYST', 'SOMEONE'].map((r) => area.isAvailable!(as(r)))).toEqual([true, false, false, false]);
  });
});

describe('everyAdministratorSeesThePendingRefundAlert', () => {
  it('draws the frame of admin-notificaciones.html with the alert: reservation, customer, amount and reason', async () => {
    const p = providers({ extra: [contribute(OPERATOR_NOTIFICATIONS, REFUND_ALERTS)] });
    const s = await render(NotificationsPageComponent, p.list);
    expect(s.texts('.crp-page-header-eyebrow, h1, h2')).toEqual(['RF-019', 'Centro de notificaciones', 'Alertas del tenant']);
    expect(s.texts('.crp-refunds-alert')).toEqual(['DV Devolución pendiente de decisión #RES-X · Cliente RES-X · $1.200.000 · Cancelada por falta de pago']);
  });

  it('is offered to the Administrators only, and the area exists only with an available alert', () => {
    const as = (role: string, alerts = true) => Injector.create({ providers: [{ provide: PortalCapabilities, useValue: PortalCapabilities.for(role) },
      { provide: RefundsSource, useValue: demo().source }, ...(alerts ? [contribute(OPERATOR_NOTIFICATIONS, REFUND_ALERTS)] : [])] });
    expect(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'SOMEONE'].map((r) => REFUND_ALERTS.isAvailable!(as(r)))).toEqual([true, false, false, false]);
    const area = PORTAL_AREAS.find((a) => a.key === 'notifications')!;
    expect([area.label, area.menu]).toEqual(['Notificaciones', undefined]);
    expect([area.isAvailable!(as('TENANT_ADMINISTRATOR')), area.isAvailable!(as('OPERATIONAL_COLLABORATOR')), area.isAvailable!(as('TENANT_ADMINISTRATOR', false))]).toEqual([true, false, false]);
  });
});

describe('fiveBusinessDaysWithoutExecutionMarkItOverdue', () => {
  it('marks Vencida 5 Monday-to-Friday days after the authorization, not before, and keeps it executable', async () => {
    expect(await byId(demo('TENANT_ADMINISTRATOR', '2026-10-09T09:59:00-05:00').source, 'RES-V')).toMatchObject({ state: 'AUTORIZADA', overdue: false });
    expect(await byId(demo('TENANT_ADMINISTRATOR', '2026-10-09T10:00:00-05:00').source, 'RES-V')).toMatchObject({ state: 'AUTORIZADA', overdue: true });
    const { writer } = demo();
    expect((await firstValueFrom(writer.executeRefund('RES-V', 'CASH', 'k1'))).refund).toMatchObject({ state: 'EJECUTADA', overdue: false });
  });

  it('shows the mark in the list and in the detail, with the execution panel still open', async () => {
    const list = await screen(RefundRequestsPageComponent);
    expect(list.texts('tbody tr:nth-child(3) td')[4]).toBe('Autorizada · Vencida');
    TestBed.resetTestingModule();
    const s = await screen(RefundDetailPageComponent, { id: 'RES-V' });
    const state = Array.from(s.host.querySelectorAll('dl div')).find((d) => d.querySelector('dt')?.textContent?.trim() === 'Estado actual');
    expect(state?.querySelector('dd')?.textContent?.trim()).toBe('Autorizada · Vencida');
    expect(s.button('Registrar ejecución de devolución')).toBeTruthy();
  });
});

describe('wiresTheDeadlinesInTheDemoBuild', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); cleanup = undefined; host?.remove(); });
  const click = (selector: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();

  it('shows the seeded alert under Notificaciones and opens the treatment of RES-1821 from 10A', async () => {
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mountWith(host, { apiClient: { request: vi.fn() } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    click('nav button', 'Notificaciones');
    await vi.waitFor(() => expect(host.querySelector('.crp-refunds-alert')).toBeTruthy());
    expect(host.querySelector('app-notifications-page')?.textContent).toContain('#RES-1820 · Diego Castro (demo) · $1.200.000 · Cancelada por falta de pago');
    click('nav button', 'Reservas');
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
    Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('#RES-1821'))!.querySelector('button')!.click();
    await vi.waitFor(() => expect(host.querySelector('app-refund-link button')).toBeTruthy());
    click('app-refund-link button', 'Gestionar devolución');
    await vi.waitFor(() => expect(host.querySelector('app-refund-manage-page [data-state="data"]')).toBeTruthy());
    expect(host.querySelector('app-refund-manage-page .crp-operator-status')?.textContent?.trim()).toBe('Quedan 18 h 42 min');
    click('app-refund-manage-page button', 'Abrir decisión');
    await vi.waitFor(() => expect(host.querySelector('app-refund-treatment-page [data-state="data"]')).toBeTruthy());
    expect(Array.from(host.querySelectorAll('app-refund-treatment-page button'), (b) => b.textContent?.trim())).toContain('Registrar devolución del 100 %');
  });
});

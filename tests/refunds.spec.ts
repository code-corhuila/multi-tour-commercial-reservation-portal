import { readFileSync } from 'node:fs';
import { Injector, Provider, Type } from '@angular/core';
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
import {
  ExecuteOutcome, REFUND_SCREENS, Refund, RefundMethod, RefundsSource, RefundsWriter, refundsAvailable,
} from '../src/app/refunds/data/refunds-ports';
import { REFUNDS_PAYMENTS_PANEL, RefundsPanelComponent } from '../src/app/refunds/components/refunds-panel.component';
import { RefundRequestsPageComponent } from '../src/app/refunds/pages/refund-requests-page.component';
import { RefundDetailPageComponent } from '../src/app/refunds/pages/refund-detail-page.component';
import { REFUND_METHOD_LABEL, REFUND_STATE_LABEL } from '../src/app/refunds/refunds-copy';
import { ActorContext } from '../src/app/shared/actor-context';
import { formatCop } from '../src/app/shared/format';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 (#182): authorize and execute a refund. Invented data only.
type Facts = NonNullable<Reservation['refund']>;
const NOW = '2026-10-13T09:30:00-05:00';
const DECIDED = { by: 'Administrador del tenant (demo)', at: '2026-10-12T16:00:00-05:00' };
const facts = (over: Partial<Facts> = {}): Facts => ({
  origin: 'CUSTOMER_CANCELLATION', reason: 'El cliente desiste del viaje (demo)', amountCents: 30_000_000, recognizedAt: '2026-10-12T15:00:00-05:00', decision: DECIDED, ...over,
});
const cancelled = (id: string, over: Partial<Reservation>) => reservationOf(id, { status: 'CANCELADA', validatedCents: 30_000_000, leadCustomerName: `Cliente ${id}`, ...over });
const AUTHORIZED = { ...DECIDED, at: '2026-10-12T17:00:00-05:00', reason: 'Cumple la política (demo)' };
const fixtures = () => new DemoReservationsStore([
  cancelled('RES-A', { refund: facts() }),
  cancelled('RES-B', { refund: facts({ authorization: AUTHORIZED }) }),
  cancelled('RES-C', { validatedCents: 85_000_000, refund: facts({ origin: 'NOT_ATTRIBUTABLE', reason: 'Cancelación no atribuible al cliente (demo)', amountCents: 1, decision: undefined }) }),
  cancelled('RES-D', { validatedCents: 41_800_000, refund: facts({ origin: 'RESCHEDULING', reason: 'Cancelada por rechazo o vencimiento de reprogramación', amountCents: 41_800_000, decision: undefined }) }),
  cancelled('RES-E', { refund: facts({ authorization: AUTHORIZED, execution: { by: 'Colaborador operativo (demo)', at: '2026-10-13T08:15:00-05:00', method: 'CASH', cashMovement: 'MC-0001' } }) }),
  reservationOf('RES-F'),
  cancelled('RES-G', { cancellation: { cause: 'Viaje aplazado (demo)', by: 'Colaborador operativo', at: NOW },
    financialDecision: { kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 30_000_000, penaltyAmountCents: 0, refundableCents: 30_000_000, recognizedAt: NOW, outcome: null } }),
]);
const USER = new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })();
const demo = (role = 'TENANT_ADMINISTRATOR', cashFails: readonly string[] = []) => {
  const store = fixtures();
  return { store, source: new DemoRefundsSource(store), writer: new DemoRefundsWriter(store, PortalCapabilities.for(role), new FixedClock(NOW), USER, new Set(cashFails)) };
};
const factsOf = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!.refund;
const byId = async (source: RefundsSource, id: string) => (await firstValueFrom(source.list())).find((r) => r.id === id)!;

/** Answers only when the test decides. */
class ControllableSource extends RefundsSource {
  readonly requests: Subject<readonly Refund[]>[] = [];
  override list(): Observable<readonly Refund[]> { const s = new Subject<readonly Refund[]>(); this.requests.push(s); return s; }
}
class ControllableWriter extends RefundsWriter {
  readonly authorizations: { id: string; reason: string; key: string; answer: Subject<Refund> }[] = [];
  readonly executions: { id: string; method: RefundMethod; key: string; answer: Subject<ExecuteOutcome> }[] = [];
  override authorize(id: string, reason: string, key: string) { const answer = new Subject<Refund>(); this.authorizations.push({ id, reason, key, answer }); return answer; }
  override executeRefund(id: string, method: RefundMethod, key: string) { const answer = new Subject<ExecuteOutcome>(); this.executions.push({ id, method, key, answer }); return answer; }
}

function providers(o: { role?: string; source?: RefundsSource; writer?: RefundsWriter; id?: string; cashFails?: string[] } = {}) {
  const navigation = new PortalNavigation();
  navigation.register([REFUND_SCREENS.requests, REFUND_SCREENS.detail, 'payments']);
  navigation.params.set({ refund: o.id ?? 'RES-A' });
  const d = demo(o.role, o.cashFails);
  const keys = new ControllableIdempotencyKeys();
  return { navigation, keys, d, list: [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'TENANT_ADMINISTRATOR') as never) },
    { provide: RefundsSource, useValue: o.source ?? d.source },
    { provide: RefundsWriter, useValue: o.writer ?? d.writer },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] };
}

async function render<T>(component: Type<T>, list: Provider[]) {
  TestBed.configureTestingModule({ providers: list });
  const fixture = TestBed.createComponent(component);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const field = (label: string) => Array.from(host.querySelectorAll('dl div')).find((d) => d.querySelector('dt')?.textContent?.trim() === label)?.querySelector('dd')?.textContent?.trim();
  const choose = async (id: string, value: string) => { const s = host.querySelector<HTMLSelectElement>(`#${id}`)!; s.value = value; s.dispatchEvent(new Event('change')); await settle(); };
  const type = async (text: string) => { const t = host.querySelector('textarea')!; t.value = text; t.dispatchEvent(new Event('input')); await settle(); };
  const submit = async (index: number) => { host.querySelectorAll('form')[index].dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  return { fixture, host, settle, button, field, choose, type, submit };
}
const detail = (o: Parameters<typeof providers>[0] = {}) => { const p = providers(o); return render(RefundDetailPageComponent, p.list).then((s) => ({ ...s, ...p })); };
const requests = (o: Parameters<typeof providers>[0] = {}) => { const p = providers(o); return render(RefundRequestsPageComponent, p.list).then((s) => ({ ...s, ...p })); };
const rows = (host: HTMLElement) => Array.from(host.querySelectorAll('tbody tr'), (tr) => Array.from(tr.querySelectorAll('td'), (td) => td.textContent?.trim()));

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('covers src/app/refunds/ with no HTTP client, request, storage or clock of its own', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/refunds/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|Date\.now\(|new Date\(/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('calls no cash step: the saga runs outside the portal (plan D-05)', () => {
    const code = listSourceFiles().filter((f) => f.startsWith('src/app/refunds/')).map((f) => withoutComments(readFileSync(f, 'utf8'))).join('\n');
    expect(code).not.toMatch(/CashOutflow|cash-sessions|recordOutflow|markExecuting/);
  });
});

describe('everyRefundScreenShowsOneOfTheFourStates', () => {
  it('the list shows loading, error with a retry that asks again, empty with the mockup text, and data', async () => {
    const source = new ControllableSource();
    const s = await requests({ source });
    expect(s.host.querySelector('h1')?.textContent).toBe('Solicitudes de devolución');
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    source.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    expect(source.requests).toHaveLength(2);
    source.requests[1].next([]); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No hay solicitudes de devolución registradas.');
    expect(s.host.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('0 solicitudes');
  });

  it('the detail shows loading, error with retry, the mockup text for an unknown refund, and data', async () => {
    const source = new ControllableSource();
    const s = await detail({ source, id: 'RES-X' });
    expect(s.host.querySelector('h1')?.textContent).toBe('Detalle de devolución');
    expect(s.host.querySelector('[data-state="loading"]')).toBeTruthy();
    source.requests[0].error(new Error('down')); await s.settle();
    s.button('Reintentar')!.click(); await s.settle();
    source.requests[1].next(await firstValueFrom(demo().source.list())); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No se encontró la solicitud seleccionada.');
    TestBed.resetTestingModule();
    const shown = await detail({ id: 'RES-A' });
    expect(shown.host.querySelector('[data-state="data"]')).toBeTruthy();
  });
});

describe('refundsPanelAndListShowTheRefundsOfTheSharedStore', () => {
  it('the panel of 13 reads "Autorización requerida" for the Administrator and opens the list', async () => {
    const p = providers();
    const s = await render(RefundsPanelComponent, p.list);
    expect(s.host.querySelector('.crp-operator-eyebrow')?.textContent?.trim()).toBe('Devoluciones monetarias');
    expect(s.host.querySelector('h2')?.textContent?.trim()).toBe('Autorización requerida');
    expect(s.host.querySelector('p.crp-operator-copy')?.textContent?.trim())
      .toBe('El Administrador autoriza o registra la devolución, con monto, motivo, reserva y movimiento de caja asociados.');
    s.button('Consultar solicitudes')!.click();
    expect(p.navigation.selected()).toBe(REFUND_SCREENS.requests);
  });

  it('the panel reads "Devoluciones autorizadas" for the Collaborator', async () => {
    const s = await render(RefundsPanelComponent, providers({ role: 'OPERATIONAL_COLLABORATOR' }).list);
    expect(s.host.querySelector('h2')?.textContent?.trim()).toBe('Devoluciones autorizadas');
    expect(s.host.querySelector('p.crp-operator-copy')?.textContent?.trim())
      .toBe('Consulta las devoluciones autorizadas por el Administrador y registra la salida de dinero cuando corresponda.');
  });

  it('lists every refund of the shared store with its state, the count and the action of the role', async () => {
    const s = await requests();
    expect(Array.from(s.host.querySelectorAll('th'), (th) => th.textContent?.trim())).toEqual(['Reserva', 'Cliente', 'Motivo', 'Monto', 'Estado', 'Fecha', 'Acción']);
    expect(s.host.querySelector('.crp-operator-panel-head .crp-operator-status')?.textContent?.trim()).toBe('6 solicitudes');
    expect(rows(s.host)[0]).toEqual(['#RES-A', 'Cliente RES-A', 'El cliente desiste del viaje (demo)', '$300.000', 'Pendiente de autorización', '12 oct 2026 · 15:00', 'Autorizar devolución']);
    expect(rows(s.host).map((r) => [r[0], r[4], r[6]])).toEqual([
      ['#RES-A', 'Pendiente de autorización', 'Autorizar devolución'], ['#RES-B', 'Autorizada', 'Registrar ejecución'],
      ['#RES-C', 'Pendiente de autorización', 'Autorizar devolución'], ['#RES-D', 'Pendiente de autorización', 'Autorizar devolución'],
      ['#RES-E', 'Ejecutada', 'Consultar detalle'], ['#RES-G', 'Pendiente de decisión', 'Consultar detalle'],
    ]);
    s.host.querySelector<HTMLButtonElement>('tbody tr:nth-child(2) td:last-child button')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.detail);
    expect(s.navigation.params()).toEqual({ refund: 'RES-B' });
    s.button('Volver a pagos')!.click();
    expect(s.navigation.selected()).toBe('payments');
  });

  it('the Collaborator consults what waits for authorization', async () => {
    const s = await requests({ role: 'OPERATIONAL_COLLABORATOR' });
    expect(rows(s.host).map((r) => r[6])).toEqual(['Consultar detalle', 'Registrar ejecución', 'Consultar detalle', 'Consultar detalle', 'Consultar detalle', 'Consultar detalle']);
  });

  it('a 013- cancellation with a refundable amount is listed from the same reservation, never from a second store', async () => {
    const { store, source } = demo();
    expect((await byId(source, 'RES-G'))).toMatchObject({ customer: 'Cliente RES-G', reason: 'Viaje aplazado (demo)', amountCents: 30_000_000, state: 'PENDIENTE_DE_DECISION' });
    expect((await firstValueFrom(source.list())).map((r) => r.id)).not.toContain('RES-F');
    store.items = store.items.filter((r) => r.id !== 'RES-G');
    expect((await firstValueFrom(source.list())).map((r) => r.id)).not.toContain('RES-G');
  });
});

describe('detailShowsReasonPersonAmountDateReservationAndMovement', () => {
  it('shows every field of "Información de la devolución" for an executed refund', async () => {
    const s = await detail({ id: 'RES-E' });
    expect(s.host.querySelector('.crp-access-note')?.textContent?.trim()).toBe('Solo el Administrador del tenant (Tenant Admin) puede autorizar o rechazar una devolución. El Colaborador operativo solo puede registrar la ejecución cuando exista autorización previa y trazable del Administrador.');
    expect(Array.from(s.host.querySelectorAll('dt'), (dt) => dt.textContent?.trim())).toEqual(['Reserva relacionada', 'Cliente', 'Motivo / causal', 'Monto',
      'Motivo de la decisión', 'Responsable', 'Fecha', 'Método de devolución/salida', 'Movimiento de caja asociado', 'Estado actual']);
    expect(Array.from(s.host.querySelectorAll('dd'), (dd) => dd.textContent?.trim())).toEqual(['#RES-E', 'Cliente RES-E', 'El cliente desiste del viaje (demo)', '$300.000',
      'Cumple la política (demo)', 'Colaborador operativo (demo)', '13 oct 2026 · 08:15', 'Efectivo', 'MC-0001', 'Ejecutada']);
    s.button('Volver a solicitudes')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.requests);
  });

  it('shows "No aplica" and "Sin responsable asignado" before any decision', async () => {
    const s = await detail({ id: 'RES-A' });
    expect([s.field('Motivo de la decisión'), s.field('Responsable'), s.field('Método de devolución/salida'), s.field('Movimiento de caja asociado'), s.field('Estado actual')])
      .toEqual(['No aplica', 'Sin responsable asignado', 'No aplica', 'No aplica', 'Pendiente de autorización']);
  });

  it('the Administrator authorizes with a reason: person, date and reason are recorded and the execution panel opens', async () => {
    const s = await detail({ id: 'RES-A' });
    expect(s.host.querySelector('label[for="crp-refunds-reason"]')?.textContent?.trim()).toBe('Motivo (obligatorio)');
    await s.type('  Cumple la política (demo)  ');
    await s.submit(0);
    expect(factsOf(s.d.store, 'RES-A')?.authorization).toEqual({ by: 'Ana Torres (demo)', at: NOW, reason: 'Cumple la política (demo)' });
    expect(s.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Devolución autorizada correctamente.');
    expect([s.field('Motivo de la decisión'), s.field('Responsable'), s.field('Fecha'), s.field('Estado actual')])
      .toEqual(['Cumple la política (demo)', 'Ana Torres (demo)', '12 oct 2026 · 15:00', 'Autorizada']);
    expect(s.host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true);
    expect(s.button('Registrar ejecución de devolución')).toBeTruthy();
  });
});

describe('notAttributableCauseRefundsAllValidatedValuesWithoutEdit', () => {
  it('resolves 100 % of the validated values whatever amount was stored, and the view has no amount field', async () => {
    const { source } = demo();
    expect(await byId(source, 'RES-C')).toMatchObject({ amountCents: 85_000_000, state: 'PENDIENTE_DE_AUTORIZACION' });
    const s = await detail({ id: 'RES-C' });
    expect(s.field('Monto')).toBe('$850.000');
    expect(s.host.querySelectorAll('input')).toHaveLength(0);
    expect(Array.from(s.host.querySelectorAll('select, textarea'), (e) => e.id)).toEqual(['crp-refunds-reason']);
  });
});

describe('reschedulingRefundOf018IsListedWithItsResolvedAmount', () => {
  it('lists the rejected rescheduling with 100 % of the validated values, ready to authorize', async () => {
    const s = await requests();
    expect(rows(s.host).find((r) => r[0] === '#RES-D')).toEqual(['#RES-D', 'Cliente RES-D', 'Cancelada por rechazo o vencimiento de reprogramación', '$418.000',
      'Pendiente de autorización', '12 oct 2026 · 15:00', 'Autorizar devolución']);
  });
});

describe('collaboratorSeesNoDecisionPanel', () => {
  it('the Collaborator sees the refund pending authorization without "Decisión", reason or "Autorizar devolución"', async () => {
    const s = await detail({ role: 'OPERATIONAL_COLLABORATOR', id: 'RES-A' });
    expect(s.field('Estado actual')).toBe('Pendiente de autorización');
    expect(s.host.querySelector('textarea')).toBeNull();
    expect(s.button('Autorizar devolución')).toBeUndefined();
    expect(s.host.textContent).not.toContain('Decisión');
  });

  it('the Administrator sees the decision panel, without "Rechazar devolución"', async () => {
    const s = await detail({ id: 'RES-A' });
    expect(Array.from(s.host.querySelectorAll('.crp-operator-panel .crp-operator-eyebrow'), (e) => e.textContent?.trim())).toEqual(['Solicitud', 'Decisión']);
    expect(s.button('Autorizar devolución')).toBeTruthy();
    expect(s.host.textContent).not.toContain('Rechazar devolución');
  });
});

describe('writerRefusesAnAuthorizationFromACollaborator', () => {
  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'SOMEONE'])('%s cannot authorize through a direct call', async (role) => {
    const { store, writer } = demo(role);
    await expect(firstValueFrom(writer.authorize('RES-A', 'Directo', 'k1'))).rejects.toMatchObject({ status: 403 });
    expect(factsOf(store, 'RES-A')?.authorization).toBeUndefined();
  });

  it('refuses an authorization without a reason or of a refund that is not waiting for one', async () => {
    const { store, writer } = demo();
    await expect(firstValueFrom(writer.authorize('RES-A', '   ', 'k1'))).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(writer.authorize('RES-G', 'Antes de la decisión', 'k2'))).rejects.toMatchObject({ status: 409 });
    await expect(firstValueFrom(writer.authorize('RES-E', 'Otra vez', 'k3'))).rejects.toMatchObject({ status: 409 });
    expect(factsOf(store, 'RES-A')?.authorization).toBeUndefined();
  });
});

describe('authorizationWithoutReasonIsShownBesideItsField', () => {
  it('reports the empty reason beside its field, focuses it and records nothing', async () => {
    const writer = new ControllableWriter();
    const s = await detail({ id: 'RES-A', writer });
    document.body.append(s.host);
    await s.type('   ');
    await s.submit(0);
    const reason = s.host.querySelector('textarea')!;
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(s.host.querySelector(`#${reason.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Registra el motivo para autorizar la devolución.');
    expect(document.activeElement).toBe(reason);
    expect(writer.authorizations).toHaveLength(0);
    s.host.remove();
  });

  it('reports a missing "¿Hubo salida efectiva de dinero?" beside its field and executes nothing', async () => {
    const writer = new ControllableWriter();
    const s = await detail({ id: 'RES-B', writer });
    await s.submit(0);
    const outflow = s.host.querySelector('#crp-refunds-outflow')!;
    expect(outflow.getAttribute('aria-invalid')).toBe('true');
    expect(s.host.querySelector(`#${outflow.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Indica si hubo salida efectiva de dinero.');
    expect(writer.executions).toHaveLength(0);
  });
});

describe('writerRefusesAnExecutionWithoutAuthorization', () => {
  it.each(['RES-A', 'RES-C', 'RES-G', 'RES-E'])('refuses to execute %s, which is not Autorizada', async (id) => {
    const { store, writer } = demo();
    await expect(firstValueFrom(writer.executeRefund(id, 'BANK_TRANSFER', 'k1'))).rejects.toMatchObject({ status: 409 });
    expect(store.items.find((r) => r.id === id)!.refund?.execution?.by ?? null).toBe(id === 'RES-E' ? 'Colaborador operativo (demo)' : null);
  });

  it('refuses an execution from a role without the capability', async () => {
    const { writer } = demo('ANALYST');
    await expect(firstValueFrom(writer.executeRefund('RES-B', 'CASH', 'k1'))).rejects.toMatchObject({ status: 403 });
  });

  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'])('%s sees no execution panel before the authorization', async (role) => {
    const s = await detail({ role, id: 'RES-A' });
    expect(s.host.querySelector('#crp-refunds-outflow')).toBeNull();
    expect(s.button('Registrar ejecución de devolución')).toBeUndefined();
  });
});

describe('executeReturnsAFailedFinalStateAndTheRefundIsNotExecuted', () => {
  it('ends Autorizada, records no execution, and the screen says so', async () => {
    const { store, writer } = demo('TENANT_ADMINISTRATOR', ['RES-B']);
    const outcome = await firstValueFrom(writer.executeRefund('RES-B', 'BANK_TRANSFER', 'k1'));
    expect(outcome.kind).toBe('cash-failed');
    expect(outcome.refund.state).toBe('AUTORIZADA');
    expect(factsOf(store, 'RES-B')?.execution).toBeUndefined();
    const s = await detail({ id: 'RES-B', cashFails: ['RES-B'] });
    await s.choose('crp-refunds-outflow', 'yes');
    await s.submit(0);
    expect(s.field('Estado actual')).toBe('Autorizada');
    expect(s.field('Movimiento de caja asociado')).toBe('No aplica');
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('La salida de dinero no quedó registrada en caja: la devolución sigue autorizada.');
    expect(s.host.textContent).not.toContain('Ejecutada');
  });
});

describe('repeatedExecuteAfterSuccessKeepsOneRecordAndTheSameKey', () => {
  it('answers the same execution for the same key and records it once', async () => {
    const { store, writer } = demo();
    const first = await firstValueFrom(writer.executeRefund('RES-B', 'CASH', 'k1'));
    const again = await firstValueFrom(writer.executeRefund('RES-B', 'CASH', 'k1'));
    expect(again).toEqual(first);
    expect(first.refund).toMatchObject({ state: 'EJECUTADA', method: 'CASH', owner: 'Ana Torres (demo)', date: NOW });
    expect(store.items.filter((r) => r.refund?.execution)).toHaveLength(2);
    const authorized = await firstValueFrom(writer.authorize('RES-A', 'Motivo', 'k2'));
    expect(await firstValueFrom(writer.authorize('RES-A', 'Motivo', 'k2'))).toEqual(authorized);
  });

  it('a double click authorizes once, and a retry after an error sends the same key', async () => {
    const writer = new ControllableWriter();
    const s = await detail({ id: 'RES-A', writer });
    await s.type('Cumple la política (demo)');
    await s.submit(0); await s.submit(0);
    expect(writer.authorizations).toHaveLength(1);
    writer.authorizations[0].answer.error({ status: 503 }); await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('No se pudo completar la solicitud.');
    await s.submit(0);
    expect(writer.authorizations.map((a) => a.key)).toEqual([writer.authorizations[0].key, writer.authorizations[0].key]);
  });
});

describe('executedFinalStateShowsTheMovementReadOnly', () => {
  it('shows En ejecución while the request is in flight, then Ejecutada with the method and the movement, nothing typed', async () => {
    const writer = new ControllableWriter();
    const s = await detail({ id: 'RES-B', writer });
    expect(Array.from(s.host.querySelectorAll('#crp-refunds-outflow option'), (o) => o.textContent?.trim())).toEqual(['Selecciona una opción', 'Sí, se realizó la salida de dinero']);
    expect(s.host.querySelector('#crp-refunds-method')).toBeNull();
    await s.choose('crp-refunds-outflow', 'yes');
    expect(Array.from(s.host.querySelectorAll('#crp-refunds-method option'), (o) => o.textContent?.trim())).toEqual(['Transferencia', 'Efectivo']);
    await s.choose('crp-refunds-method', 'CASH');
    expect(s.host.querySelectorAll('input')).toHaveLength(0);
    await s.submit(0); await s.submit(0);
    expect(writer.executions).toHaveLength(1);
    expect(writer.executions[0]).toMatchObject({ id: 'RES-B', method: 'CASH' });
    expect(s.field('Estado actual')).toBe('En ejecución');
    const { writer: real } = demo();
    writer.executions[0].answer.next(await firstValueFrom(real.executeRefund('RES-B', 'CASH', 'k9'))); await s.settle();
    expect([s.field('Método de devolución/salida'), s.field('Movimiento de caja asociado'), s.field('Responsable'), s.field('Fecha'), s.field('Estado actual')])
      .toEqual(['Efectivo', 'MC-B', 'Ana Torres (demo)', '13 oct 2026 · 09:30', 'Ejecutada']);
    expect(s.host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Ejecución registrada correctamente.');
  });
});

describe('rolesWithoutCapabilityAndUnknownRoleReachNoRefundScreen', () => {
  const ROLES = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'SOMEONE'];
  const injectorAs = (role: string, ports = true) => Injector.create({ providers: [
    { provide: PortalCapabilities, useValue: PortalCapabilities.for(role) },
    ...(ports ? [{ provide: RefundsSource, useValue: demo().source }, { provide: RefundsWriter, useValue: demo().writer }] : []),
  ] });

  it('gives authorizing to the Administrator only, and executing to the Administrator and the Collaborator', () => {
    expect(ROLES.map((r) => PortalCapabilities.for(r).canAuthorizeRefund())).toEqual([true, false, false, false, false, false, false]);
    expect(ROLES.map((r) => PortalCapabilities.for(r).canExecuteRefund())).toEqual([true, true, false, false, false, false, false]);
  });

  it('offers the panel of 13, the list and the detail only to those roles, and only with the refund ports', () => {
    const areas = [REFUND_SCREENS.requests, REFUND_SCREENS.detail].map((key) => PORTAL_AREAS.find((a) => a.key === key)!);
    expect(areas.map(({ label, menu, parent }) => ({ label, menu, parent }))).toEqual([
      { label: 'Solicitudes de devolución', menu: false, parent: 'payments' }, { label: 'Detalle de devolución', menu: false, parent: 'payments' }]);
    for (const available of [...areas.map((a) => a.isAvailable!), REFUNDS_PAYMENTS_PANEL.isAvailable!, refundsAvailable]) {
      expect(ROLES.map((r) => available(injectorAs(r)))).toEqual([true, true, false, false, false, false, false]);
      expect(available(injectorAs('TENANT_ADMINISTRATOR', false))).toBe(false);
    }
  });

  it('keeps role names out of src/app/refunds/', () => {
    const code = listSourceFiles().filter((f) => f.startsWith('src/app/refunds/')).map((f) => withoutComments(readFileSync(f, 'utf8'))).join('\n');
    expect(code).not.toMatch(/TENANT_ADMINISTRATOR|OPERATIONAL_COLLABORATOR|MANAGER|ANALYST|ACCOUNTANT/);
  });
});

describe('refundTextsAreSpanishAndMoneyUsesFormatCop', () => {
  it('names every state and method in Spanish, never a code', () => {
    expect(REFUND_STATE_LABEL).toEqual({ PENDIENTE_DE_DECISION: 'Pendiente de decisión', PENDIENTE_DE_AUTORIZACION: 'Pendiente de autorización', AUTORIZADA: 'Autorizada', EJECUTADA: 'Ejecutada' });
    expect(REFUND_METHOD_LABEL).toEqual({ BANK_TRANSFER: 'Transferencia', CASH: 'Efectivo' });
  });

  it('writes every amount of the list with formatCop and shows no raw code', async () => {
    const s = await requests();
    const all = await firstValueFrom(demo().source.list());
    expect(rows(s.host).map((r) => r[3])).toEqual(all.map((r) => formatCop(r.amountCents)));
    expect(s.host.textContent).not.toMatch(/PENDIENTE_|AUTORIZADA|EJECUTADA|BANK_TRANSFER|CUSTOMER_CANCELLATION|undefined|null/);
  });
});

describe('wiresTheRefundScreensInTheDemoBuild', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); cleanup = undefined; host?.remove(); });
  const click = (selector: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();
  const set = (selector: string, value: string, event: string) => { const e = host.querySelector<HTMLInputElement>(selector)!; e.value = value; e.dispatchEvent(new Event(event)); };

  it('opens the list from the panel of 13, authorizes and executes the seeded 013- refund over the shared store', async () => {
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mountWith(host, { apiClient: { request: vi.fn() } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    click('nav button', 'Pagos');
    await vi.waitFor(() => expect(host.querySelector('app-payments-page app-refunds-panel h2')?.textContent).toBe('Autorización requerida'));
    click('app-refunds-panel button', 'Consultar solicitudes');
    await vi.waitFor(() => expect(host.querySelector('app-refund-requests-page [data-state="data"]')).toBeTruthy());
    expect(host.querySelector('.crp-operator-nav .crp-is-active')?.textContent?.trim()).toBe('Pagos');
    const codes = Array.from(host.querySelectorAll('tbody tr td:first-child'), (td) => td.textContent?.trim());
    expect(codes).toEqual(expect.arrayContaining(['#RES-1819', '#RES-1818', '#RES-1817', '#RES-1816', '#RES-1815']));
    const row = Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('#RES-1819'))!;
    expect(row.textContent).toContain('$300.000');
    row.querySelector('button')!.click();
    await vi.waitFor(() => expect(host.querySelector('app-refund-detail-page textarea')).toBeTruthy());
    set('app-refund-detail-page textarea', 'El cliente presentó la solicitud (demo)', 'input');
    host.querySelector('app-refund-detail-page form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('#crp-refunds-outflow')).toBeTruthy());
    set('#crp-refunds-outflow', 'yes', 'change');
    await vi.waitFor(() => expect(host.querySelector('#crp-refunds-method')).toBeTruthy());
    Array.from(host.querySelectorAll('app-refund-detail-page form')).at(-1)!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('app-refund-detail-page')?.textContent).toContain('Ejecución registrada correctamente.'));
    expect(host.querySelector('app-refund-detail-page')?.textContent).toContain('MC-1819');
  });
});

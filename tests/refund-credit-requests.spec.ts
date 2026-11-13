import { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { RefundsApiSource, RefundsApiWriter } from '../src/app/http/refunds-api-sources';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CreditRequest } from '../src/app/credit-balance/data/credit-balance-ports';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoRefundsSource, DemoRefundsWriter } from '../src/app/demo/refunds-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { REFUND_SCREENS, RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { RefundDetailPageComponent } from '../src/app/refunds/pages/refund-detail-page.component';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { Observable, of } from 'rxjs';
import { actorAs } from './actor-context.double';
import { fakeClient, page } from './api-client.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 AC-RF.12, D-3 (RN-RES-009, GAP-014): a request to refund a credit balance is a row of the refund list; the Administrator authorizes it or rejects it with a
// reason inside 24 running hours; with no decision it is authorized for the requested amount; "Rechazar devolución" belongs to the requests only. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
const request = (over: Partial<CreditRequest> = {}): CreditRequest => ({ id: 'SAR-1', reservationId: 'RES-S', customer: 'Cliente RES-S', amountCents: 10_000_000, state: 'PENDIENTE_DE_AUTORIZACION',
  reason: 'Solicitud del cliente por correo', requestedBy: 'Cliente', requestedAt: '2026-10-13T04:00:00-05:00', decisionDueAt: '2026-10-14T04:00:00-05:00', tenant: 'tenant-demo', ...over });
const decidedRefund = { origin: 'NON_PAYMENT' as const, reason: 'Cancelada por falta de pago', amountCents: 120_000_000, recognizedAt: '2026-10-12T17:00:00-05:00',
  decision: { by: 'Admin (demo)', at: '2026-10-12T17:30:00-05:00' } };
const store = (requests: CreditRequest[]) => {
  const s = new DemoReservationsStore([reservationOf('RES-S', { status: 'FINALIZADA', validatedCents: 10_000_000, leadCustomerName: 'Cliente RES-S' }),
    reservationOf('RES-N', { status: 'CANCELADA', validatedCents: 120_000_000, leadCustomerName: 'Cliente RES-N', refund: decidedRefund })]);
  s.creditRequests = requests;
  return s;
};
const USER = new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })();
const demo = (requests: CreditRequest[] = [request()], role = 'TENANT_ADMINISTRATOR', now = NOW) => {
  const s = store(requests), clock = new FixedClock(now);
  return { s, source: new DemoRefundsSource(s, clock), writer: new DemoRefundsWriter(s, PortalCapabilities.for(role), clock, USER, new Set<string>()) };
};
const row = async (source: RefundsSource, id: string) => (await firstValueFrom(source.list())).find((r) => r.id === id)!;

describe('aCreditBalanceRequestIsARowOfTheRefundList', () => {
  it('lists the request with its origin, its reason, its amount and the reservation it comes from', async () => {
    const d = demo();
    expect(await row(d.source, 'SAR-1')).toMatchObject({ origin: 'CREDIT_BALANCE_REQUEST', reason: 'Solicitud de devolución de saldo a favor', amountCents: 10_000_000,
      state: 'PENDIENTE_DE_AUTORIZACION', customer: 'Cliente RES-S', reservation: 'RES-S', defaulted: false, decisionDueAt: null });
    expect(await row(d.source, 'RES-N')).toMatchObject({ origin: 'OTHER', state: 'PENDIENTE_DE_AUTORIZACION' });
  });

  it('draws a rejected request as Rechazada and does not list it twice', async () => {
    const d = demo([request({ state: 'RECHAZADA' })]);
    expect(await row(d.source, 'SAR-1')).toMatchObject({ state: 'RECHAZADA' });
    expect((await firstValueFrom(d.source.list())).filter((r) => r.id === 'SAR-1')).toHaveLength(1);
  });

  it('authorizes, with no decision, the requested amount once the 24 hours pass, as Multitour, counted as authorization', async () => {
    const d = demo([request()], 'TENANT_ADMINISTRATOR', '2026-10-14T04:00:00-05:00');
    expect(await row(d.source, 'SAR-1')).toMatchObject({ state: 'AUTORIZADA', defaulted: true, amountCents: 10_000_000, owner: 'Determinación automática' });
    expect(d.s.creditRequests[0].state).toBe('AUTORIZADA');
  });
});

describe('theAdministratorDecidesAnOpenCreditBalanceRequest', () => {
  it('authorizes it with a reason, as the person, and the credit screen sees it authorized', async () => {
    const d = demo();
    expect(await firstValueFrom(d.writer.authorize('SAR-1', 'El cliente lo pidió (demo)', 'k1'))).toMatchObject({ state: 'AUTORIZADA', decisionReason: 'El cliente lo pidió (demo)', owner: 'Ana Torres (demo)', amountCents: 10_000_000 });
    expect(d.s.creditRequests[0].state).toBe('AUTORIZADA');
  });

  it('rejects it with a mandatory reason, and the credit screen sees it rejected', async () => {
    const d = demo();
    await expect(firstValueFrom(d.writer.reject('SAR-1', '  ', 'k2'))).rejects.toMatchObject({ status: 409 });
    expect(await firstValueFrom(d.writer.reject('SAR-1', 'No procede (demo)', 'k3'))).toMatchObject({ state: 'RECHAZADA', decisionReason: 'No procede (demo)' });
    expect(d.s.creditRequests[0].state).toBe('RECHAZADA');
  });

  it('refuses a role without the capability and a request already decided', async () => {
    await expect(firstValueFrom(demo([request()], 'OPERATIONAL_COLLABORATOR').writer.authorize('SAR-1', 'Ok', 'k4'))).rejects.toMatchObject({ status: 403 });
    const d = demo();
    await firstValueFrom(d.writer.reject('SAR-1', 'No procede (demo)', 'k5'));
    await expect(firstValueFrom(d.writer.authorize('SAR-1', 'Ok', 'k6'))).rejects.toMatchObject({ status: 409 });
  });

  it('rejects only a request: any other refund pending authorization answers 409', async () => {
    const d = demo();
    await expect(firstValueFrom(d.writer.reject('RES-N', 'No procede (demo)', 'k7'))).rejects.toMatchObject({ status: 409 });
    expect((await row(d.source, 'RES-N')).state).toBe('PENDIENTE_DE_AUTORIZACION');
  });
});


async function detail(id: string, role = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation();
  navigation.register([...Object.values(REFUND_SCREENS), 'payments']);
  navigation.params.set({ refund: id });
  const d = demo([request()], role);
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: RefundsSource, useValue: d.source }, { provide: RefundsWriter, useValue: d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }] as Provider[] });
  const fixture = TestBed.createComponent(RefundDetailPageComponent as Type<RefundDetailPageComponent>);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return { host, button: (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) };
}

describe('rechazarDevolucionIsDrawnOnlyForACreditBalanceRequest', () => {
  it('draws Autorizar and Rechazar on the detail of a request, never the treatment buttons', async () => {
    const s = await detail('SAR-1');
    expect(s.button('Autorizar devolución')).toBeTruthy();
    expect(s.button('Rechazar devolución')).toBeTruthy();
    expect(s.button('Devolver el 100 %')).toBeUndefined();
    expect(s.button('Registrar saldo a favor del 100 %')).toBeUndefined();
  });

  it('draws only Autorizar on any other refund pending authorization', async () => {
    const s = await detail('RES-N');
    expect(s.button('Autorizar devolución')).toBeTruthy();
    expect(s.button('Rechazar devolución')).toBeUndefined();
  });
});

describe('creditBalanceRequestsOverTheService', () => {
  const reservations = new (class extends ReservationsSource {
    override list(): Observable<readonly Reservation[]> { return of([{ id: 'r-1', leadCustomerName: 'Laura Gómez (demo)' } as Reservation]); }
  })();
  const dto = (over: object) => ({ financialDecisionId: 'd-9', reservationId: 'r-1', kind: 'CREDIT_BALANCE_REFUND_REQUEST', baseAmountCents: 50000, recognizedAt: '2026-11-10T06:00:00Z',
    decisionDueAt: '2026-11-11T06:00:00Z', frozen: false, ...over });
  const NOW_MS = Date.parse('2026-11-10T12:00:00Z');

  it('reads an open request as pending authorization with its origin, never as a treatment', async () => {
    const { client } = fakeClient({ ok: page([dto({})]) }, { ok: page([]) });
    const rows = await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW_MS).list());
    expect(rows[0]).toMatchObject({ origin: 'CREDIT_BALANCE_REQUEST', state: 'PENDIENTE_DE_AUTORIZACION', reason: 'Solicitud de devolución de saldo a favor', amountCents: 50000 });
  });

  it('reads the other kinds with the origin OTHER', async () => {
    const { client } = fakeClient({ ok: page([dto({ kind: 'CUSTOMER_CANCELLATION' })]) }, { ok: page([]) });
    expect((await firstValueFrom(new RefundsApiSource(client, reservations, () => NOW_MS).list()))[0].origin).toBe('OTHER');
  });

  it('authorizes an open request through refund-authorization and rejects only a request through rejection', async () => {
    const authorize = fakeClient({ ok: page([dto({})]) }, { ok: {} }, { ok: page([dto({ outcome: 'AUTHORIZED' })]) }, { ok: page([]) });
    await firstValueFrom(new RefundsApiWriter(authorize.client, new RefundsApiSource(authorize.client, reservations, () => NOW_MS)).authorize('d-9', 'Ok', 'authorize-key-0001'));
    expect(authorize.calls[1]).toMatchObject({ path: `${API_BASE}/financial-decisions/d-9/refund-authorization`, body: { reason: 'Ok' } });
    const other = fakeClient({ ok: page([dto({ kind: 'CUSTOMER_CANCELLATION' })]) });
    await expect(firstValueFrom(new RefundsApiWriter(other.client, new RefundsApiSource(other.client, reservations, () => NOW_MS)).reject('r-1', 'No', 'reject-key-00001'))).rejects.toMatchObject({ status: 404 });
    expect(other.calls).toHaveLength(1);
  });
});

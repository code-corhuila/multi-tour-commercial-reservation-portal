import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { PaymentDeadlineApiReader } from '../src/app/http/payments-api-sources';
import { PaymentDeadlineApiExtender, PaymentFollowupsApiHistory, PaymentFollowupsApiWriter, PendingPaymentsApiSource } from '../src/app/http/payment-followup-api-sources';
import { PaymentDeadlineExtender, PaymentFollowupsHistory, PaymentFollowupsWriter, PendingPaymentsSource } from '../src/app/payments/data/payment-followup-ports';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';
import { TestBed } from '@angular/core/testing';
import { afterEach } from 'vitest';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PaymentDeadlineReader } from '../src/app/payments/data/payment-followup-ports';
import { PaymentFollowupPageComponent } from '../src/app/payments/pages/payment-followup-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-011 (code-corhuila/multi-tour-docs#177) over the container client: the pending rows, the follow-up history and its register, and the single
// extension, over the routes of the service (PROPOSED contract). The deadline and its rules are the service's; the portal sends no deadline and no actor.
const reservation = (id: string, name: string) => ({ id, leadCustomerName: name, balanceCents: 500000, status: 'PENDIENTE_DE_PAGO' } as Reservation);
class Stored extends ReservationsSource {
  constructor(public items: Reservation[]) { super(); }
  override list(): Observable<readonly Reservation[]> { return of(this.items); }
}
const reservations = new Stored([reservation('r-1', 'Laura Gómez (demo)'), reservation('r-2', 'Carlos Ruiz (demo)'), reservation('r-3', 'Ana Pérez (demo)')]);
const row = (id: string, over: object = {}) => ({ reservationId: id, customerName: 'x', paymentType: 'FULL', validatedValueCents: 0, pendingBalanceCents: 500000, paymentStatus: 'NO_PAYMENT',
  deadlineKind: 'INITIAL_PAYMENT', effectiveDeadline: '2026-11-10T09:00:00-05:00', hasProofInValidation: false, ...over });
const followup = (over: object = {}) => ({ followupId: 'f-1', reservationId: 'r-1', note: 'Llamé al cliente', contactedBy: 'u-1', contactedAt: '2026-11-08T10:30:00-05:00', ...over });

describe('pendingPaymentsOverTheApiClient', () => {
  it('lists the initial-payment rows of the service and hands the reservations they name, leaving the proofs to HU-COM-010', async () => {
    const { client, calls } = fakeClient({ ok: page([row('r-1'), row('r-2', { hasProofInValidation: true }), row('r-3')]) });
    const rows = await firstValueFrom(new PendingPaymentsApiSource(client, reservations).list());
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/pending-payments?page=1&limit=100&kind=INITIAL_PAYMENT`]);
    expect(rows.map((r) => r.id)).toEqual(['r-1', 'r-3']);
  });

  it('drops a row whose reservation the list does not know and answers nothing when no reservation waits', async () => {
    const { client } = fakeClient({ ok: page([row('r-9')]) });
    expect(await firstValueFrom(new PendingPaymentsApiSource(client, reservations).list())).toEqual([]);
  });
});

describe('paymentFollowupsOverTheApiClient', () => {
  it('reads the history of the reservation, the newest first as the service lists it', async () => {
    const { client, calls } = fakeClient({ ok: page([followup({ followupId: 'f-2', note: 'Segundo' }), followup()]) });
    const history = await firstValueFrom(new PaymentFollowupsApiHistory(client).of('r-1'));
    expect(calls.map((c) => c.path)).toEqual([`${API_BASE}/reservations/r-1/payment-followups?page=1&limit=100`]);
    expect(history).toEqual([
      { note: 'Segundo', actorLabel: 'u-1', contactedAt: '2026-11-08T10:30:00-05:00' },
      { note: 'Llamé al cliente', actorLabel: 'u-1', contactedAt: '2026-11-08T10:30:00-05:00' },
    ]);
  });

  it('posts only the note under the key of the intention and answers the reservation with its history, sending no deadline, date or actor', async () => {
    const { client, calls } = fakeClient({ ok: followup() }, { ok: page([followup()]) });
    const history = new PaymentFollowupsApiHistory(client);
    const saved = await firstValueFrom(new PaymentFollowupsApiWriter(client, reservations, history).register({ reservationId: 'r-1', note: 'Llamé al cliente' }, 'follow-key-0001'));
    expect(calls[0]).toEqual({ path: `${API_BASE}/reservations/r-1/payment-followups`, method: 'POST', body: { note: 'Llamé al cliente' }, headers: { 'Idempotency-Key': 'follow-key-0001' } });
    expect(saved).toMatchObject({ id: 'r-1', followups: [{ note: 'Llamé al cliente' }] });
  });

  it.each([[403, 'Tu rol no puede registrar seguimientos de pago.'], [404, 'No se encontró el pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Registrar seguimiento.'],
    [422, 'Esta reserva no tiene saldo pendiente o está cancelada: solo puedes consultar el historial de seguimientos existente.']])(
    'shows the refusal %s in Spanish, never the English message of the service', async (status, text) => {
      const { client } = fakeClient({ fail: { status, code: 'X', message: 'a follow-up applies to a reservation pending payment only', details: [], traceId: 't' } });
      await expect(firstValueFrom(new PaymentFollowupsApiWriter(client, reservations, new PaymentFollowupsApiHistory(client)).register({ reservationId: 'r-1', note: 'n' }, 'follow-key-0002')))
        .rejects.toMatchObject({ status, userMessage: text });
    });
});

describe('paymentDeadlineExtensionOverTheApiClient', () => {
  it('posts only the hours under the key of the intention and answers the reservation', async () => {
    const { client, calls } = fakeClient({ ok: { reservationId: 'r-1', extensionHours: 24 } });
    const result = await firstValueFrom(new PaymentDeadlineApiExtender(client, reservations).extend({ reservationId: 'r-1', hours: 24 }, 'extend-key-0001'));
    expect(calls).toEqual([{ path: `${API_BASE}/reservations/r-1/payment-deadline/extension`, method: 'POST', body: { hours: 24 }, headers: { 'Idempotency-Key': 'extend-key-0001' } }]);
    expect(result.id).toBe('r-1');
  });

  it.each([
    ['the deadline was already extended once', 'El plazo ya tuvo su única ampliación.'],
    ['the deadline has already expired', 'El plazo ya venció: la ampliación debe concederse antes del vencimiento.'],
    ['only a reservation pending payment can have its deadline extended', 'Solo una reserva Pendiente de pago admite ampliación del plazo.'],
    ['a frozen deadline cannot be extended', 'El plazo está congelado por la cancelación o interrupción de la salida.'],
    ['the extension is above the maximum of the payment condition', 'La ampliación supera el máximo del parámetro de pago del tenant.'],
    ['the extension would pass the departure start', 'La ampliación no puede superar la hora programada de inicio de la salida.'],
  ])('tells the business refusal "%s" with the sentence of the mockup', async (message, text) => {
    const { client } = fakeClient({ fail: { status: 422, code: 'BUSINESS_RULE_VIOLATION', message, details: [], traceId: 't' } });
    await expect(firstValueFrom(new PaymentDeadlineApiExtender(client, reservations).extend({ reservationId: 'r-1', hours: 24 }, 'extend-key-0002'))).rejects.toMatchObject({ status: 422, userMessage: text });
  });

  it('tells a missing duration and a role that cannot grant in Spanish', async () => {
    const short = fakeClient({ fail: { status: 400, code: 'VALIDATION_ERROR', message: 'hours', details: [{ field: 'hours' }], traceId: 't' } });
    await expect(firstValueFrom(new PaymentDeadlineApiExtender(short.client, reservations).extend({ reservationId: 'r-1', hours: 0 }, 'extend-key-0003'))).rejects.toMatchObject({ userMessage: 'Indica la duración de la ampliación en horas (mínimo 1).' });
    const denied = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'no', details: [], traceId: 't' } });
    await expect(firstValueFrom(new PaymentDeadlineApiExtender(denied.client, reservations).extend({ reservationId: 'r-1', hours: 24 }, 'extend-key-0004'))).rejects.toMatchObject({ userMessage: 'Tu rol no puede conceder ampliaciones del plazo.' });
  });
});

describe('theDeadlineReaderCarriesTheSingleExtension', () => {
  it('hands the extension of the service with its hours, person and instant, and none when the deadline was not extended', async () => {
    const wire = { reservationId: 'r-1', kind: 'INITIAL_PAYMENT', dueAt: '2026-11-10T09:00:00-05:00', departureStartsAt: '2026-11-20T06:30:00-05:00', effectiveDeadline: '2026-11-11T09:00:00-05:00', frozen: false };
    const extended = fakeClient({ ok: { ...wire, extensionHours: 24, extensionGrantedAt: '2026-11-09T08:00:00-05:00', extensionGrantedBy: 'u-1' } });
    expect(await firstValueFrom(new PaymentDeadlineApiReader(extended.client).deadlineOf('r-1'))).toEqual({ dueAt: wire.effectiveDeadline, departureStartsAt: wire.departureStartsAt,
      extension: { hours: 24, actorLabel: 'u-1', grantedAt: '2026-11-09T08:00:00-05:00' } });
    const plain = fakeClient({ ok: wire });
    expect(await firstValueFrom(new PaymentDeadlineApiReader(plain.client).deadlineOf('r-1'))).toEqual({ dueAt: wire.effectiveDeadline, departureStartsAt: wire.departureStartsAt });
  });
});

describe('theContainerBuildProvidesTheFollowupSources', () => {
  it('registers the four ports over the client, so the follow-up screens work outside the demo', () => {
    const provided = sourceProviders(fakeClient().client).map((p) => (p as { provide?: unknown }).provide);
    for (const port of [PendingPaymentsSource, PaymentFollowupsWriter, PaymentFollowupsHistory, PaymentDeadlineExtender]) expect(provided).toContain(port);
  });
});

describe('theFollowupScreenShowsWhatTheServiceKeeps', () => {
  afterEach(() => TestBed.resetTestingModule());
  class Fixed extends Clock { override now(): number { return Date.parse('2026-10-13T09:00:00-05:00'); } }
  const screen = (history: PaymentFollowupsHistory, deadline: PaymentDeadlineReader) => {
    const navigation = new PortalNavigation(); navigation.params.set({ reservation: 'RES-1842' });
    return screenOf(PaymentFollowupPageComponent, [
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR' as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
      ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(),
      { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() }, { provide: Clock, useValue: new Fixed() },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
      { provide: PaymentFollowupsHistory, useValue: history }, { provide: PaymentDeadlineReader, useValue: deadline },
    ]);
  };
  const flat = (element: Element) => (element.textContent ?? '').replace(/s+/g, ' ').trim();
  const reader = (extension?: { hours: number; actorLabel: string; grantedAt: string }): PaymentDeadlineReader => ({ deadlineOf: () => of({ dueAt: '2026-10-17T09:00:00-05:00', departureStartsAt: '2026-11-07T00:00:00-05:00', ...(extension ? { extension } : {}) }) });

  it('draws the history of the service in the table, over the empty one of the reservation', async () => {
    const { element } = await screen({ of: () => of([{ note: 'Prometió pagar el viernes', actorLabel: 'u-1', contactedAt: '2026-10-12T10:30:00-05:00' }]) }, reader());
    expect(Array.from(element.querySelectorAll('tbody tr td'), (td) => flat(td))).toEqual(['12 oct 2026', '10:30', 'u-1', 'Prometió pagar el viernes']);
    expect(flat(element)).not.toContain('Aún no se han registrado seguimientos');
  });

  it('shows the extension of the service as granted and leaves the grant disabled', async () => {
    const { element } = await screen({ of: () => of([]) }, reader({ hours: 24, actorLabel: 'u-1', grantedAt: '2026-10-12T08:00:00-05:00' }));
    expect(flat(element)).toContain('Ampliación concedida: 24 h por u-1 el 12 oct 2026 · 08:00.');
    expect(element.querySelector<HTMLInputElement>('[name="extensionHours"]')?.disabled).toBe(true);
  });
});

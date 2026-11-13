import { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoRefundsSource } from '../src/app/demo/refunds-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { RefundsApiSource } from '../src/app/http/refunds-api-sources';
import { API_BASE } from '../src/app/http/api-paths';
import { PortalNavigation } from '../src/app/portal-navigation';
import { REFUND_SCREENS, RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { RefundManagePageComponent } from '../src/app/refunds/pages/refund-manage-page.component';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { Reservation, ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { fakeClient, page } from './api-client.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 (AC-RF.13, A.1, D-10): "Gestionar devolución" draws the panels "Origen" and "Reglas de la devolución" of admin-gestionar-devolucion.html with its two links,
// and the treatment screen its notice (admin-tratamiento-pendiente-devolucion.html). Every figure is resolved by the port (RN-RF1); the texts are the mockup's.
const NOW = '2026-10-13T09:30:00-05:00';
const store = () => new DemoReservationsStore([
  reservationOf('RES-P', { status: 'CANCELADA', validatedCents: 120_000_000, leadCustomerName: 'Cliente RES-P',
    refund: { origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 120_000_000, recognizedAt: '2026-10-13T04:12:00-05:00' } }),
  reservationOf('RES-M', { status: 'CONFIRMADA', validatedCents: 50_000_000, leadCustomerName: 'Cliente RES-M',
    refund: { origin: 'LOWER_VALUE', reason: 'Excedente por reducción del valor', amountCents: 10_000_000, recognizedAt: '2026-10-12T10:00:00-05:00' } }),
]);
async function screen<T>(component: Type<T>, id = 'RES-P') {
  const navigation = new PortalNavigation();
  navigation.register([...Object.values(REFUND_SCREENS), 'reservations']);
  navigation.params.set({ refund: id });
  const source = new DemoRefundsSource(store(), new FixedClock(NOW));
  const list: Provider[] = [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR' as never) }, { provide: RefundsSource, useValue: source },
    { provide: RefundsWriter, useValue: {} }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }];
  TestBed.configureTestingModule({ providers: list });
  const fixture = TestBed.createComponent(component);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  return { host, button, navigation, source };
}
const panelOf = (host: HTMLElement, eyebrow: string) => Array.from(host.querySelectorAll('section')).find((p) => p.querySelector('.crp-operator-eyebrow')?.textContent?.trim() === eyebrow)!;
const rows = (host: Element) => Array.from(host.querySelectorAll('.crp-operator-detail-list > div'), (d) => [d.querySelector('span')?.textContent?.trim(), d.querySelector('strong')?.textContent?.trim()]);

describe('manageDrawsTheOriginAndRulesPanelsOfTheMockup', () => {
  it('draws "Origen" with the seven rows of the mockup, every value from the port', async () => {
    const s = await screen(RefundManagePageComponent);
    const panel = panelOf(s.host, 'Origen');
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe('Cancelación o modificación registrada');
    expect(rows(panel)).toEqual([['Reserva', '#RES-P'], ['Cliente', 'Cliente RES-P'], ['Estado de la reserva', 'Cancelada'], ['Tipo', 'Cancelación'],
      ['Causal', 'Cancelada por falta de pago'], ['Valores pagados y validados', '$1.200.000'], ['Fecha del registro', '13 oct 2026 · 04:12']]);
  });

  it('a refund born of a lower value reads "Modificación" and the status of its reservation', async () => {
    const s = await screen(RefundManagePageComponent, 'RES-M');
    expect(rows(panelOf(s.host, 'Origen')).filter(([label]) => ['Estado de la reserva', 'Tipo', 'Valores pagados y validados'].includes(label!)))
      .toEqual([['Estado de la reserva', 'Confirmada'], ['Tipo', 'Modificación'], ['Valores pagados y validados', '$500.000']]);
  });

  it('draws "Reglas de la devolución" with the paragraph of the mockup and "Ver solicitudes"', async () => {
    const s = await screen(RefundManagePageComponent);
    const panel = panelOf(s.host, 'Reglas de la devolución');
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe('Determinación, decisión y ejecución');
    expect(panel.querySelector('p.crp-operator-copy')?.textContent?.trim()).toBe('La devolución es del 100 % por defecto y por causa no atribuible al cliente; en una cancelación solicitada por el cliente se aplica la penalidad vigente y la decisión recae sobre el monto reembolsable. Las causas no atribuibles se determinan y autorizan automáticamente; en los demás casos el Administrador del tenant decide en 24 horas corridas entre devolver o registrar saldo a favor, y sin decisión se determina la devolución del 100 %. Toda devolución se ejecuta en máximo 5 días hábiles y queda asociada a un movimiento de caja.');
    s.button('Ver solicitudes')!.click();
    expect(s.navigation.selected()).toBe(REFUND_SCREENS.requests);
  });

  it('the header link is "Volver a la reserva" and opens the detail of that reservation', async () => {
    const s = await screen(RefundManagePageComponent);
    expect(s.button('Volver a solicitudes')).toBeUndefined();
    s.button('Volver a la reserva')!.click();
    expect(s.navigation.selected()).toBe('reservations');
    expect(s.navigation.params()).toEqual({ reservation: 'RES-P' });
  });
});

describe('treatmentDrawsTheNoticeOfTheMockup', () => {
  it('draws the paragraph under the header, before the list', async () => {
    const s = await screen(RefundTreatmentPageComponent);
    expect(s.host.querySelector('.crp-page-header + p.crp-operator-access-note')?.textContent?.trim()).toBe('Cuando una reserva se cancela por incumplimiento del pago y existen valores abonados y validados, solo el Administrador del tenant decide, dentro de 24 horas corridas desde el reconocimiento del dinero, entre devolver el 100 % o registrarlo como saldo a favor. Sin decisión, Multitour determina la devolución del 100 % (pendiente de ejecución en máximo 5 días hábiles) y notifica a todos los Administradores del tenant activos. No existen retenciones ni penalidades.');
  });
});

describe('theRefundCarriesItsOrigin', () => {
  it('the demo port resolves status, type, paid value and registration instant', async () => {
    const s = await screen(RefundManagePageComponent);
    const all = await firstValueFrom(s.source.list());
    expect(all.find((r) => r.id === 'RES-P')).toMatchObject({ reservationStatus: 'CANCELADA', originType: 'CANCELLATION', paidCents: 120_000_000, registeredAt: '2026-10-13T04:12:00-05:00' });
    expect(all.find((r) => r.id === 'RES-M')).toMatchObject({ originType: 'MODIFICATION', paidCents: 50_000_000 });
  });

  it('the API port joins the reservation status and its validated value, and types the cause', async () => {
    class Stored extends ReservationsSource { override list(): Observable<readonly Reservation[]> { return of([{ id: 'r-1', leadCustomerName: 'Laura', status: 'CANCELADA', validatedCents: 90000 } as Reservation]); } }
    const decision = { financialDecisionId: 'd-1', reservationId: 'r-1', kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 80000, recognizedAt: '2026-11-10T06:00:00Z', decisionDueAt: '2026-11-11T06:00:00Z', frozen: false };
    const { client, calls } = fakeClient({ ok: page([decision]) }, { ok: page([]) });
    const [row] = await firstValueFrom(new RefundsApiSource(client, new Stored(), () => Date.parse('2026-11-10T12:00:00Z')).list());
    expect(calls[0].path).toBe(`${API_BASE}/financial-decisions?page=1&limit=100`);
    expect(row).toMatchObject({ reservationStatus: 'CANCELADA', originType: 'CANCELLATION', paidCents: 90000, registeredAt: '2026-11-10T06:00:00Z' });
  });
});

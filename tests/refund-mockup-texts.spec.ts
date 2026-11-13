import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DemoRefundsSource } from '../src/app/demo/refunds-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoRefundsWriter } from '../src/app/demo/refunds-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { RefundsPanelComponent } from '../src/app/refunds/components/refunds-panel.component';
import { REFUND_SCREENS, RefundsSource, RefundsWriter } from '../src/app/refunds/data/refunds-ports';
import { RefundManagePageComponent } from '../src/app/refunds/pages/refund-manage-page.component';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { actorAs } from './actor-context.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-016 AC-RF.13 and difference D-10 of the spec: the panel of 13 and the eyebrows of two refund screens are the mockup-pdr-1 v1.9 texts
// (admin-pagos.html with app.js 9796, admin-gestionar-devolucion.html, admin-tratamiento-pendiente-devolucion.html), written here as the mockup writes them.
async function mount<T>(component: Type<T>, role: string) {
  const navigation = new PortalNavigation();
  navigation.register(Object.values(REFUND_SCREENS));
  navigation.params.set({ refund: 'RES-M' });
  const clock = new FixedClock('2026-10-13T09:30:00-05:00');
  const store = new DemoReservationsStore([reservationOf('RES-M', { status: 'CANCELADA', validatedCents: 1_000_000, leadCustomerName: 'Cliente RES-M',
    refund: { origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: 1_000_000, recognizedAt: '2026-10-13T08:00:00-05:00' } })]);
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: PortalNavigation, useValue: navigation },
    { provide: RefundsSource, useValue: new DemoRefundsSource(store, clock) },
    { provide: RefundsWriter, useValue: new DemoRefundsWriter(store, PortalCapabilities.for(role), clock, new (class extends RegisteringUser { override label() { return 'Ana Torres (demo)'; } })(), new Set<string>()) },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }] });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim());
}

describe('refundScreensDrawTheTextsOfTheMockupV19', () => {
  it('the panel of 13 draws the Administrator text of admin-pagos.html', async () => {
    const texts = await mount(RefundsPanelComponent, 'TENANT_ADMINISTRATOR');
    expect(texts('.crp-operator-eyebrow, h2, .crp-operator-copy, button')).toEqual(['Devoluciones monetarias', 'Autorización requerida',
      'El Administrador del tenant decide en 24 horas corridas y la devolución se ejecuta en máximo 5 días hábiles, con monto, motivo, reserva y movimiento de caja asociados.', 'Consultar solicitudes']);
  });

  it('the panel of 13 draws the Collaborator text of app.js', async () => {
    const texts = await mount(RefundsPanelComponent, 'OPERATIONAL_COLLABORATOR');
    expect(texts('.crp-operator-eyebrow, h2, .crp-operator-copy, button')).toEqual(['Devoluciones monetarias', 'Devoluciones autorizadas',
      'Consulta las devoluciones autorizadas por el Administrador del tenant y registra la salida de dinero cuando corresponda.', 'Consultar solicitudes']);
  });

  it('the manage screen and the treatment screen draw their own eyebrow (D-10)', async () => {
    expect((await mount(RefundManagePageComponent, 'TENANT_ADMINISTRATOR'))('.crp-page-header-eyebrow')).toEqual(['RF-015B · Solicitud de devolución']);
    TestBed.resetTestingModule();
    expect((await mount(RefundTreatmentPageComponent, 'TENANT_ADMINISTRATOR'))('.crp-page-header-eyebrow')).toEqual(['RN-RES-006C · Solo Administrador del tenant']);
  });
});

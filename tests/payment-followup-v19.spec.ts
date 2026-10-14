import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { DemoReservationsStore, reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PaymentDeadlineExtender } from '../src/app/payments/data/payment-followup-ports';
import { PaymentFollowupPageComponent } from '../src/app/payments/pages/payment-followup-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// Slice 4: admin-registrar-seguimiento.html of the current mockup, with the single deadline extension (RN-RES-006, E15).
// RES-1842: Pago total · Transferencia, deadline 16 oct 2026 09:00. RES-1841 carries a seeded extension. RES-1836 is Cancelada.
const NOW = Date.parse('2026-10-13T09:00:00-05:00');
class FixedClock extends Clock { override now(): number { return NOW; } }
const flat = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
function providers(id: string, role = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation(); navigation.params.set({ reservation: id });
  return [
    { provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() }, { provide: Clock, useValue: new FixedClock() },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
  ];
}
const following = (id: string, role?: string) => screenOf(PaymentFollowupPageComponent, providers(id, role));
const labelsOf = (element: Element) => Array.from(element.querySelectorAll('form label'), (l) => l.textContent?.trim());

afterEach(() => TestBed.resetTestingModule());

describe('registrar seguimiento, labels and texts of the current mockup', () => {
  it('draws the context rows in the order of the mockup, with the departure and the current deadline', async () => {
    const { element } = await following('RES-1842');
    expect(labelsOf(element)).toEqual(['Reserva', 'Cliente', 'Tipo y medio de pago', 'Valores validados', 'Saldo pendiente', 'Situación financiera', 'Salida', 'Plazo de pago vigente',
      'Nota de seguimiento (obligatoria)']);
    const value = (label: string) => { const l = Array.from(element.querySelectorAll('label')).find((x) => x.textContent?.trim() === label)!; return element.querySelector<HTMLInputElement>(`#${l.htmlFor}`)!.value; };
    expect(value('Salida')).toBe('Desierto de la Tatacoa al atardecer · 07 nov 2026 (Programada)');
    expect(value('Plazo de pago vigente')).toBe('Vence el 16 oct 2026 · 09:00.');
    expect(value('Valores validados')).toBe('$0');
    expect(flat(element)).toContain('Durante el plazo, el Colaborador operativo puede contactar al cliente. Una respuesta del cliente sin pago no suspende ni cumple el plazo.');
    expect(flat(element)).not.toMatch(/Modalidad de pago|Valor recibido|Estado actual|Plazo\/límite/);
  });

  it('a Cancelada reservation counts as settled: no note, no submit, only the history', async () => {
    const { element } = await following('RES-1836');
    expect(element.querySelector('textarea')).toBeNull();
    expect(element.querySelector('button[type="submit"]')).toBeNull();
    expect(flat(element)).toContain('Esta reserva no tiene saldo pendiente o está cancelada: solo puedes consultar el historial de seguimientos existente.');
  });

  it('the writer refuses a follow-up on a Cancelada reservation', async () => {
    const { fixture } = await following('RES-1836');
    const writer = fixture.debugElement.injector.get(PaymentFollowupsWriterToken);
    await expect(firstValueFrom(writer.register({ reservationId: 'RES-1836', note: 'Llamada' }, 'k-1'))).rejects.toMatchObject({ status: 409 });
  });
});

describe('ampliación única del plazo', () => {
  it('offers the panel on a Pendiente de pago reservation with the suggested hours, and grants one extension', async () => {
    const { element, type, click, fixture } = await following('RES-1842');
    const text = flat(element);
    expect(text).toContain('Ampliación del plazo');
    expect(text).toContain('Se puede conceder una única ampliación antes del vencimiento (duración sugerida: 24 h). El plazo total nunca supera la hora programada de inicio de la salida.');
    expect(element.querySelector<HTMLInputElement>('[name="extensionHours"]')?.value).toBe('24');
    await type('extensionHours', '12'); await click('Conceder ampliación'); fixture.detectChanges();
    const after = flat(element);
    expect(after).toContain('Ampliación registrada con su duración, fecha, hora y responsable.');
    expect(after).toContain('Ampliación concedida: 12 h por Administrador del tenant (demo) el 13 oct 2026 · 09:00.');
    expect(element.querySelector<HTMLInputElement>('[name="extensionHours"]')?.disabled).toBe(true);
    const stored = (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === 'RES-1842')!;
    expect(stored.deadline).toMatchObject({ dueAt: '2026-10-16T09:00:00-05:00', extendedUntil: '2026-10-17T09:00:00-05:00', extension: { hours: 12 } });
  });

  it('refuses a second extension, hours above the parameter, and an expired deadline', async () => {
    TestBed.configureTestingModule({ providers: providers('RES-1842') });
    const extender = TestBed.inject(PaymentDeadlineExtender), grant = (id: string, hours: number, key: string) =>
      firstValueFrom(extender.extend({ reservationId: id, hours }, key)).then(() => 'ok', (e: { userMessage: string }) => e.userMessage);
    expect(await grant('RES-1842', 25, 'k-1')).toBe('La ampliación no puede superar 24 h (parámetro de pago del tenant).');
    expect(await grant('RES-1842', 0, 'k-2')).toBe('Indica la duración de la ampliación en horas (mínimo 1).');
    expect(await grant('RES-1842', 24, 'k-3')).toBe('ok');
    expect(await grant('RES-1842', 24, 'k-4')).toBe('El plazo ya tuvo su única ampliación.');
    const store = TestBed.inject(ReservationsSource) as DemoReservationsStore;
    store.items = store.items.map((r) => (r.id === 'RES-1833' ? { ...r, deadline: { dueAt: '2026-10-12T09:00:00-05:00' } } : r));
    expect(await grant('RES-1833', 24, 'k-5')).toBe('El plazo ya venció: la ampliación debe concederse antes del vencimiento.');
  });

  it('a reservation that already had its extension shows it and no active control', async () => {
    const { element } = await following('RES-1841');
    expect(element.querySelector<HTMLInputElement>('[name="extensionHours"]')?.disabled).toBe(true);
    expect(flat(element)).toContain('No se admite otra ampliación.');
  });
});

import { PaymentFollowupsWriter as PaymentFollowupsWriterToken } from '../src/app/payments/data/payment-followup-ports';

import { Component } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { Reservation } from '../src/app/reservations/model/reservation';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ControllableReservations, StubDepartures, departureOf, reservationOf, reservationProviders, screenOf } from './reservations.double';

/** The view has a required input: a host gives it before the first change detection. */
@Component({ imports: [ReservationViewComponent], template: '<app-reservation-view [reservation]="reservation" [fresh]="fresh" />' })
class ViewHost { static next: { reservation: Reservation; fresh: boolean }; reservation = ViewHost.next.reservation; fresh = ViewHost.next.fresh; }
const viewOf = (reservation: Reservation, fresh: boolean, providers: unknown[]) => { ViewHost.next = { reservation, fresh }; return screenOf(ViewHost, providers); };

// HU-COM-007 against the mockup of PDR v1.9: admin-crear-reserva, admin-reservas, admin-detalle-reserva, admin-reserva-registrada.
const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)).map((e) => e.textContent?.trim());
const RAW = ['PENDING_PAYMENT', 'PENDIENTE_DE_PAGO', 'SIN_PAGO', 'TOTAL', 'PARTIAL', 'BANK_TRANSFER', 'CASH_AT_OFFICE', 'EN_VALIDACION', 'CANCELADA', 'PROGRAMADA'];
const noRawCodes = (root: Element) => { for (const code of RAW) expect(root.textContent, code).not.toContain(code); };
const row = (element: Element, label: string) => Array.from(element.querySelectorAll('dl div')).find((d) => d.querySelector('dt')?.textContent?.trim() === label);
const valueOf = (element: Element, label: string) => row(element, label)?.querySelector('dd')?.textContent?.trim();
const optionsOf = (element: Element, name: string) => texts(element, `[name="${name}"] option`);

describe('create reservation (admin-crear-reserva): one tour, its scheduled departure, and payment type and method apart', () => {
  it('draws Tour, Salida programada, travelers and the vehicles line of section 02', async () => {
    const { element, field } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(texts(element, '.crp-operator-panel .crp-operator-eyebrow')[0]).toBe('02. Tour, salida y viajeros');
    expect(field('serviceId').tagName).toBe('SELECT');
    expect(element.querySelector('fieldset')).toBeNull();
    expect(optionsOf(element, 'serviceId')).toEqual(['Selecciona una opción', 'Kayak · $20 por persona', 'Lunch · $25 por persona']);
    expect(optionsOf(element, 'departureId')).toContain('Tour 1 · 07 nov 2026 · 10 cupos disponibles');
    for (const label of ['Tour', 'Salida programada', 'Cantidad total de viajeros', 'Vehículo(s) de la salida']) {
      expect(texts(element, 'label'), label).toContain(label);
    }
    expect(element.querySelector<HTMLInputElement>('input[readonly]')!.value).toBe('Se define con la salida');
  });

  it('offers the payment type and the payment method as two separate fields, without codes', async () => {
    const { element, tick } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(texts(element, 'label')).toEqual(expect.arrayContaining(['Tipo de pago esperado', 'Medio de pago esperado']));
    expect(texts(element, 'label')).not.toContain('Modalidad de pago esperada');
    await tick('svc-Kayak');
    expect(optionsOf(element, 'paymentType')).toEqual(['Selecciona el tipo de pago', 'Pago total', 'Abono']);
    expect(optionsOf(element, 'paymentMethod')).toEqual(['Selecciona el medio de pago', 'Transferencia', 'Efectivo']);
  });

  it('keeps the payment fields disabled until a tour is chosen and explains the deadline once a type is', async () => {
    const { element, field, tick, choose } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(field<HTMLSelectElement>('paymentType').disabled).toBe(true);
    expect(element.textContent).toContain('El tipo de pago (Pago total o Abono) y el medio (Transferencia o Efectivo) se eligen por separado.');
    await tick('svc-Kayak');
    expect(field<HTMLSelectElement>('paymentType').disabled).toBe(false);
    await choose('paymentType', 'PARTIAL');
    const note = element.textContent!;
    expect(note).toContain('Plazo inicial de pago (Abono)');
    expect(note).toContain('una única ampliación');
    expect(note).toContain('nunca supera la hora programada de inicio de la salida');
    expect(note).toContain('La promesa de pago en efectivo no confirma la reserva');
    expect(note).toContain('se confirma al validar el abono mínimo');
    await choose('paymentType', 'TOTAL');
    expect(element.textContent).toContain('se confirma al validar el 100 % del valor final');
  });

  it('keeps Registrar reserva disabled, with the feedback, until every mandatory datum and the acceptance are given', async () => {
    const { element, button, choose, tick, type, payWith } = await screenOf(ReservationFormComponent, reservationProviders());
    expect(button('Registrar reserva')!.disabled).toBe(true);
    expect(element.textContent).toContain('Completa los campos obligatorios para registrar la reserva.');
    expect(element.textContent).toContain('Confirmo que el cliente acepta las condiciones aplicables a esta reserva.');
    await choose('leadCustomerId', 'cus-1'); await choose('departureId', 'dep-1'); await tick('svc-Kayak'); await type('people', '2');
    expect(button('Registrar reserva')!.disabled).toBe(true);
    await payWith();
    expect(button('Registrar reserva')!.disabled).toBe(false);
    expect(element.textContent).not.toContain('Completa los campos obligatorios');
  });

  it('tells the seats of the chosen departure before the submit', async () => {
    const { element, choose, type } = await screenOf(ReservationFormComponent, reservationProviders());
    await choose('departureId', 'dep-1'); await type('people', '2');
    expect(element.textContent).toContain('Hay 10 cupos disponibles en la salida seleccionada. El cupo no se garantiza hasta el primer pago.');
    await type('people', '11');
    expect(element.textContent).toContain('No hay cupo suficiente en esta salida: quedan 10 cupos.');
  });
});

describe('reservations list (admin-reservas)', () => {
  const FINALIZED = reservationOf('RES-3', { status: 'FINALIZADA', balanceCents: 0, financialStatus: 'PAGO_COMPLETO' });
  const CANCELLED = reservationOf('RES-4', { status: 'CANCELADA', balanceCents: 0, financialStatus: 'PARCIAL' });
  async function listed(items: readonly Reservation[] = [reservationOf('RES-1', { departureDate: '2026-09-15' }), FINALIZED, CANCELLED], navigation?: PortalNavigation) {
    const reservations = new ControllableReservations();
    const view = await screenOf(ReservationsPageComponent, [...reservationProviders({ reservations }), ...(navigation ? [{ provide: PortalNavigation, useValue: navigation }] : [])]);
    reservations.inner.requests[0].reply(items); await view.settle();
    return view;
  }

  it('opens with the follow-up hero of the mockup', async () => {
    const { element } = await listed();
    expect(texts(element, '.crp-operator-eyebrow')).toContain('Seguimiento');
    expect(element.textContent).toContain('Reserva, salida, cupo y valores siempre conectados.');
    expect(element.textContent).toContain('Cada reserva pertenece a una única salida.');
  });

  it('hides Finalizada and Cancelada until "Ver todas las reservas" and switches the toggle back', async () => {
    const { element, click, button } = await listed();
    expect(texts(element, 'tbody .crp-reservations-code')).toEqual(['#RES-1']);
    expect(button('Ver todas las reservas')!.getAttribute('aria-expanded')).toBe('false');
    await click('Ver todas las reservas');
    expect(texts(element, 'tbody .crp-reservations-code')).toEqual(['#RES-1', '#RES-3', '#RES-4']);
    expect(button('Ver reservas activas')!.getAttribute('aria-expanded')).toBe('true');
    await click('Ver reservas activas');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('writes the receipt status and the financial situation above the balance', async () => {
    const proofed = reservationOf('RES-5', { payments: [{ id: 'p', method: 'BANK_TRANSFER', amountCents: 1000, proofName: 'a.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'x' }] });
    const { element } = await listed([proofed]);
    expect(texts(element, 'tbody tr td')[4]).toBe('En validación · Sin pago$50');
    noRawCodes(element);
  });

  it('offers Gestionar pago, Ver pago and Reprogramar only when their areas exist', async () => {
    const navigation = new PortalNavigation(); navigation.register(['payment-management', 'rescheduling']);
    const opened: string[] = [];
    navigation.open = (key: string, params: Readonly<Record<string, string>> = {}) => { opened.push(`${key}:${params['reservation']}`); return true; };
    const pending = reservationOf('RES-1'), settled = reservationOf('RES-2', { balanceCents: 0, financialStatus: 'PAGO_COMPLETO' });
    const moving = reservationOf('RES-6', { status: 'CONFIRMADA', reschedulingPending: true });
    const { element, settle } = await listed([pending, settled, moving], navigation);
    expect(texts(element, 'tbody tr td:last-child')).toEqual(['Ver detalle · Gestionar pago', 'Ver detalle · Ver pago', 'Ver detalle · Gestionar pago · Reprogramar']);
    element.querySelector<HTMLButtonElement>('tbody tr:nth-child(2) td:last-child button:nth-of-type(2)')!.click(); await settle();
    element.querySelector<HTMLButtonElement>('tbody tr:nth-child(3) td:last-child button:nth-of-type(3)')!.click(); await settle();
    expect(opened).toEqual(['payment-management:RES-2', 'rescheduling:RES-6']);
  });

  it('draws no area button when the build has no such area', async () => {
    const { element } = await listed([reservationOf('RES-1')]);
    expect(texts(element, 'tbody tr td:last-child')).toEqual(['Ver detalle']);
  });
});

describe('reservation detail (admin-detalle-reserva)', () => {
  const full = reservationOf('RES-1843', { tourName: 'Ruta Andina', departureDate: '2026-09-18T06:30:00', departureId: 'dep-1', people: 2, paymentType: 'TOTAL',
    paymentMethod: 'BANK_TRANSFER', validatedCents: 0, deadline: { dueAt: '2026-09-16T10:00:00-05:00' } });
  async function detail(reservation: Reservation = full) {
    const departures = new StubDepartures(() => of([departureOf(1), departureOf(2, { state: 'CANCELADA' })]));
    return viewOf(reservation, false, reservationProviders({ departures }));
  }

  it('shows the hero, the access note and the holder block as the mockup writes them', async () => {
    const { element } = await detail();
    expect(texts(element, '.crp-reservations-hero .crp-operator-eyebrow')).toEqual(['#RES-1843']);
    expect(element.querySelector('.crp-reservations-hero h2')?.textContent).toBe('Ruta Andina');
    expect(element.querySelector('.crp-reservations-hero p:not(.crp-operator-eyebrow)')?.textContent).toBe('Salida: 18 sep 2026 · 06:30 · 2 viajeros');
    expect(element.textContent).toContain('Consulta disponible únicamente dentro del operador activo.');
    expect(valueOf(element, 'Viajeros registrados')).toBe('2 personas');
    expect(valueOf(element, 'Acompañantes registrados')).toBe('1 acompañante');
  });

  it('lists the economic state of the mockup, with "No aplica" as minimum deposit for a total payment', async () => {
    const { element } = await detail();
    for (const label of ['Valor proyectado', 'Descuentos aplicados', 'Valor final', 'Valores validados', 'Valores devueltos']) expect(row(element, label), label).toBeTruthy();
    expect(valueOf(element, 'Valores validados')).toBe('$0');
    expect(valueOf(element, 'Valores devueltos')).toBe('$0');
    expect(valueOf(element, 'Abono mínimo')).toBe('No aplica');
  });

  it('draws "Salida y plazos" with the departure state, the payment deadline, the extension and the cancellation cause', async () => {
    const { element } = await detail();
    expect(texts(element, '.crp-operator-eyebrow')).toContain('Salida y plazos');
    expect(valueOf(element, 'Estado de la salida')).toBe('Programada');
    expect(valueOf(element, 'Plazo de pago')).toBe('Vence el 16 sep 2026 · 10:00.');
    expect(valueOf(element, 'Ampliación del plazo')).toBe('Disponible (una única ampliación)');
    expect(valueOf(element, 'Causa de cancelación')).toBe('No registrada');
    noRawCodes(element);
  });

  it('freezes the deadline when the departure was cancelled', async () => {
    const { element } = await detail({ ...full, departureId: 'dep-2', reschedulingPending: true });
    expect(valueOf(element, 'Estado de la salida')).toBe('Cancelada');
    expect(valueOf(element, 'Plazo de pago')).toContain('Plazo congelado: la salida fue cancelada o interrumpida por una causa no atribuible al cliente');
    expect(valueOf(element, 'Ampliación del plazo')).toBe('No aplica');
  });

  it('shows the cancellation cause of a cancelled reservation and the execution state of each service', async () => {
    const { element } = await detail({ ...full, status: 'CANCELADA', cancellation: { cause: 'Cancelada por falta de pago', by: 'x', at: '2026-09-15T09:00:00-05:00' } });
    expect(valueOf(element, 'Causa de cancelación')).toBe('Cancelada por falta de pago');
    expect(texts(element, 'tbody td')).toContain('No ejecutada');
  });

  it('names the columns of the reserved services and the execution state of a pending reservation', async () => {
    const { element } = await detail();
    expect(texts(element, 'th')).toEqual(['Servicio', 'Salida', 'Cantidad', 'Estado de ejecución']);
    expect(texts(element, 'tbody td')).toContain('Pendiente de ejecución');
  });
});

describe('registered reservation (admin-reserva-registrada)', () => {
  const created = reservationOf('RES-1847', { tourName: 'Ruta Andina', departureDate: '2026-09-18T06:30:00', paymentType: 'PARTIAL', paymentMethod: 'CASH_AT_OFFICE' });
  async function registered(reservation: Reservation = created) {
    return viewOf(reservation, true, reservationProviders());
  }

  it('confirms the registration, summarises it and states the payment in words', async () => {
    const { element } = await registered();
    expect(texts(element, '.crp-operator-eyebrow')).toEqual(['Nueva reserva', 'Resumen', 'Estado económico', 'Siguiente paso']);
    expect(element.textContent).toContain('La reserva quedó registrada como proyección comercial dentro del operador activo, asociada a una única salida y sin cupo apartado hasta su primer pago.');
    expect(valueOf(element, 'Salida')).toBe('18 sep 2026 · 06:30');
    expect(valueOf(element, 'Viajeros')).toBe('2 personas');
    expect(row(element, 'Plazo de pago')).toBeTruthy();
    expect(element.textContent).toContain('Sin comprobante · Sin pago');
    expect(valueOf(element, 'Tipo y medio de pago')).toBe('Abono · Efectivo');
    noRawCodes(element);
  });

  it('closes with the next step of the mockup and the Ver detalle button', async () => {
    const { element, button } = await registered();
    expect(element.querySelector('.crp-next-step h2')?.textContent).toBe('Gestiona el pago según el tipo y el medio elegidos.');
    expect(element.textContent).toContain('La reserva se confirmará solo cuando se valide el 100 % del valor final (pago total) o el abono mínimo (abono).');
    expect(element.textContent).toContain('La promesa de pago en efectivo no confirma la reserva.');
    expect(element.textContent).toContain('El cupo se aparta con el primer pago, previa verificación de disponibilidad en la salida.');
    expect(button('Ver detalle')).toBeTruthy();
  });

  it('writes "Sin definir" when the reservation carries neither type nor method', async () => {
    const { element } = await registered(reservationOf('RES-9'));
    expect(valueOf(element, 'Tipo y medio de pago')).toBe('Sin definir');
  });
});

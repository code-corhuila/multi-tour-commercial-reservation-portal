import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoDeparturesStore, DemoReservationsStore, DemoReservationsWriter, reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ControllableReservations, StubDepartures, StubDiscounts, reservationOf, reservationProviders, screenOf } from './reservations.double';
import { DemoReservationQuotes } from '../src/app/demo/reservation-quote-demo';
import { DEFAULT_SERVICES, StubCatalog } from './reservations.double';

// Authorized screens 10, 10A, 10B and 10C (12-ux-ui/authorized-screens.md, row HU-COM-007).
const RAW = ['PENDIENTE_DE_PAGO', 'SIN_PAGO', 'ORIGINAL_VALUE', 'PREVIOUS_SUBTOTAL', 'PROGRAMADA', '2026-11-07'];
const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)).map((e) => e.textContent?.trim());
const header = (root: Element) => ({ eyebrow: root.querySelector('.crp-page-header-eyebrow')?.textContent?.trim(), title: root.querySelector('h1')?.textContent?.trim() });
const noRawCodes = (root: Element) => { for (const code of RAW) expect(root.textContent, code).not.toContain(code); };
const noPayments = (root: Element) => { for (const text of ['Gestionar pago', 'Pagos y comprobantes', 'Total recibido', 'Modalidad']) expect(root.textContent, text).not.toContain(text); };

async function overDemo(people = '2') {
  const departures = new DemoDeparturesStore(), store = new DemoReservationsStore(), discounts = new StubDiscounts();
  discounts.lines = [{ name: 'Temporada baja', base: 'ORIGINAL_VALUE', amountCents: 1000 }];
  const open = departures.items.find((d) => d.state === 'PROGRAMADA' && d.openForReservations)!;
  const view = await screenOf(ReservationsPageComponent, reservationProviders({ reservations: store, discounts,
    writer: new DemoReservationsWriter(store, departures, new DemoReservationQuotes(departures, new StubCatalog(DEFAULT_SERVICES), discounts)),
    departures: new StubDepartures(() => of(departures.items)) }));
  const create = async () => {
    await view.click('Crear reserva');
    await view.choose('departureId', open.id);
    await view.tick('svc-Kayak'); await view.type('people', people); await view.party(); await view.payWith();
    await view.click('Registrar reserva');
  };
  return { ...view, open, create };
}

describe('the list is screen 10', () => {
  it('has the commercial header, the follow-up panel and the columns of the mockup, in Spanish and without codes', async () => {
    const reservations = new ControllableReservations();
    const { element, settle, button } = await screenOf(ReservationsPageComponent, reservationProviders({ reservations }));
    reservations.inner.requests[0].reply([reservationOf('RES-1842')]); await settle();
    expect(header(element)).toEqual({ eyebrow: 'Gestión comercial', title: 'Reservas' });
    expect(button('Crear reserva')?.classList).toContain('crp-operator-primary');
    expect(texts(element, '.crp-operator-panel .crp-operator-eyebrow')).toContain('Reservas activas');
    expect(texts(element, '.crp-operator-panel h2')).toContain('Seguimiento de reservas');
    expect(texts(element, 'table.crp-operator-table th')).toEqual(['Reserva', 'Cliente', 'Servicio y salida', 'Estado', 'Saldo', 'Acción']);
    const cells = texts(element, 'tbody tr td');
    expect(cells[0]).toContain('#RES-1842'); expect(cells[0]).toContain('07 nov 2026 · 2 viajeros');
    expect(cells.slice(1)).toEqual(['Lead Demo', 'Tour 1', 'Pendiente de pago', 'Sin comprobante · Sin pago$50', 'Ver detalle']);
    expect(element.querySelector('tbody .crp-operator-status.crp-is-pending')?.textContent?.trim()).toBe('Pendiente de pago');
    noRawCodes(element); noPayments(element);
  });

  it('writes one traveler in singular and offers Reintentar as an outline button', async () => {
    const reservations = new ControllableReservations();
    const { element, settle, button, click } = await screenOf(ReservationsPageComponent, reservationProviders({ reservations }));
    reservations.inner.requests[0].fail(); await settle();
    expect(button('Reintentar')?.classList).toContain('crp-operator-outline');
    await click('Reintentar');
    reservations.inner.requests[1].reply([reservationOf('RES-1', { people: 1 })]); await settle();
    expect(texts(element, 'tbody tr td')[0]).toContain('07 nov 2026 · 1 viajero');
    expect(element.textContent).not.toContain('1 viajeros');
  });

  it('starts the demo with seeded reservations pending payment', async () => {
    const source = reservationDemoProviders().find((p) => (p as { provide: unknown }).provide === ReservationsSource) as { useValue: ReservationsSource };
    const seeded = await firstValueFrom(source.useValue.list());
    const pending = seeded.filter((r) => r.status === 'PENDIENTE_DE_PAGO');
    expect(pending.length).toBeGreaterThanOrEqual(1);
    // HU-COM-014 adds RES-1840, Pendiente de pago with its proof En validación (mockup demo data RES-1843).
    // Together: RES-1842, RES-1841, RES-1833 (010), RES-1840 (014) and RES-1827 (018).
    // HU-COM-018 adds RES-1827, Pendiente de pago with its proof En validación (AC-RP.4).
    expect(pending.length).toBeLessThanOrEqual(5);
    // HU-COM-013 (tasks T-08): one fixture per state the cancellation tells apart, in the same store.
    expect(new Set(seeded.map((r) => r.status))).toEqual(new Set(['PENDIENTE_DE_PAGO', 'CONFIRMADA', 'EN_EJECUCION', 'FINALIZADA', 'CANCELADA']));
  });
});

describe('the form is screen 10B', () => {
  it('opens under the Crear reserva header with Cancelar as the header action', async () => {
    const { element, click, button } = await overDemo();
    await click('Crear reserva');
    expect(header(element)).toEqual({ eyebrow: 'Gestión comercial', title: 'Crear reserva' });
    expect(button('Cancelar')).toBeTruthy();
  });

  it('draws sections 02 and 04 and the calculated values, with each label beside its field', async () => {
    const view = await screenOf(ReservationFormComponent, reservationProviders({ discounts: Object.assign(new StubDiscounts(), {
      lines: [{ name: 'Temporada baja', base: 'ORIGINAL_VALUE', amountCents: 1500 }] }) }));
    const { element, choose, tick, type, field } = view;
    expect(texts(element, '.crp-operator-panel .crp-operator-eyebrow')).toEqual(['01. Cliente titular', '02. Tour, salida y viajeros', '03. Acompañantes', '04. Condiciones y pago', 'Valores calculados']);
    expect(texts(element, '.crp-operator-panel h2')).toEqual(['Datos para asociar la reserva', 'Oferta seleccionada', 'Datos individuales requeridos', 'Reglas aplicables', 'Resumen de la reserva']);
    for (const name of ['holderName', 'serviceId', 'departureId', 'people', 'paymentType', 'paymentMethod']) {
      const control = field(name), label = element.querySelector(`label[for="${control.id}"]`)!;
      expect(label.parentElement, name).toBe(control.parentElement);
    }
    expect(texts(element, '[name="departureId"] option')).toContain('Tour 1 · 07 nov 2026 · 10 cupos disponibles');
    await choose('departureId', 'dep-1'); await tick('svc-Kayak'); await type('people', '3');
    expect(element.querySelector('[data-conditions]')?.textContent).toContain('Changes up to 72 hours before (demo).');
    const values = element.querySelector('.crp-reservations-values')!;
    expect(texts(values, 'span')).toEqual(['Valor proyectado', 'Descuentos aplicables', 'Valor final']);
    expect(texts(values, 'strong')).toEqual(['$75', '-$15', '$60']);
    expect(view.button('Registrar reserva')?.type).toBe('submit');
    noRawCodes(element); noPayments(element);
  });
});

describe('the result is screen 10C and the detail is screen 10A, both without payments', () => {
  it('shows the registered reservation with its summary and economic state', async () => {
    const { element, create, button } = await overDemo();
    await create();
    expect(header(element)).toEqual({ eyebrow: 'Registro completado', title: 'Reserva registrada' });
    const result = element.querySelector('.crp-reservations-result')!;
    expect(result.querySelector('h2')?.textContent).toMatch(/^#RES-\d+$/);
    expect(result.querySelector('.crp-operator-status.crp-is-pending')?.textContent?.trim()).toBe('Pendiente de pago');
    for (const label of ['Salida', 'Viajeros', 'Titular', 'Plazo de pago', 'Tipo y medio de pago', 'Pago total · Transferencia', 'Valor final', 'Valor proyectado', 'Descuentos aplicados', 'Saldo pendiente', 'Sin comprobante · Sin pago']) {
      expect(result.textContent, label).toContain(label);
    }
    expect(button('Volver a reservas')).toBeTruthy(); expect(button('Ver detalle')).toBeTruthy();
    noRawCodes(element); noPayments(element);
  });

  it('shows the detail with the holder, the economic state and the reserved services', async () => {
    const { element, create, click } = await overDemo();
    await create(); await click('Ver detalle');
    expect(header(element)).toEqual({ eyebrow: 'Consulta de reserva', title: 'Detalle de reserva' });
    const detail = element.querySelector('.crp-reservations-detail')!;
    expect(texts(detail, '.crp-operator-eyebrow')).toEqual(expect.arrayContaining(['Titular y viajeros', 'Estado económico', 'Salida y plazos', 'Servicios reservados']));
    expect(detail.textContent).toContain('2 personas');
    expect(detail.textContent).toMatch(/\$[\d.]+ pendientes/);
    expect(detail.textContent).toContain('Temporada baja (sobre el valor original)');
    expect(texts(detail, 'th')).toEqual(['Servicio', 'Salida', 'Cantidad', 'Estado de ejecución']);
    noRawCodes(element); noPayments(element);
  });

  it('writes one traveler and one person in singular in the detail', async () => {
    const { element, create, click } = await overDemo('1');
    await create(); await click('Ver detalle');
    const detail = element.querySelector('.crp-reservations-detail')!;
    expect(detail.textContent).toContain('1 viajero'); expect(detail.textContent).toContain('1 persona');
    expect(detail.textContent).not.toContain('1 viajeros'); expect(detail.textContent).not.toContain('1 personas');
  });
});

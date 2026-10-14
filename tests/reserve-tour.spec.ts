import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { Departure } from '../src/app/reservations/model/reservation';
import { SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { RESERVATION_FLOW, ReservationSelection, SelectionQuote } from '../src/app/self-service-reservation/model/self-service-reservation';
import { ReserveTourPageComponent } from '../src/app/self-service-reservation/pages/reserve-tour-page.component';

const TOUR: CatalogItem = {
  serviceId: 'svc-1', serviceType: 'TOUR', commercialName: 'Ruta del café en Pitalito', catalogStatus: 'ACTIVE', baseRateCents: 14_500_000,
  baseOperationalCostCents: 9_000_000, configuredCapacity: 12, transportRequired: false, highRisk: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const departure = (id: string, date: string, overrides: Partial<Departure> = {}): Departure => ({
  id, tourName: 'Ruta del cafe en Pitalito', date, state: 'PROGRAMADA', openForReservations: true, effectiveCapacity: 3,
  transportPerPersonCents: 1_800_000, conditions: 'Cambios hasta 72 horas antes de la salida.', ...overrides,
});
const DEPARTURES: Departure[] = [
  departure('dep-b', '2026-12-05'),
  departure('dep-a', '2026-11-14'),
  departure('dep-c', '2026-11-21', { openForReservations: false }),
  departure('dep-d', '2026-11-28', { state: 'CANCELADA' }),
  departure('dep-e', '2026-11-18', { tourName: 'Otro tour' }),
];

class RecordingQuotes extends SelectionQuoteSource {
  readonly asked: ReservationSelection[] = [];
  discount = 0;
  override quote(selection: ReservationSelection): Observable<SelectionQuote> {
    this.asked.push(selection);
    const base = 16_300_000 * selection.people;
    return of({ tourName: TOUR.commercialName, departureAt: '2026-11-14', baseValueCents: base, discountCents: this.discount, finalValueCents: base - this.discount });
  }
}

interface Options { tour?: string; departures?: Observable<readonly Departure[]>; catalog?: readonly CatalogItem[]; areas?: readonly string[]; discount?: number }

async function openReserve(options: Options = {}) {
  const navigation = new PortalNavigation();
  navigation.register(options.areas ?? [RESERVATION_FLOW.reserve, RESERVATION_FLOW.finish, CLIENT_AREA.tours]);
  navigation.open(RESERVATION_FLOW.reserve, { tour: options.tour ?? 'svc-1' });
  const quotes = new RecordingQuotes();
  quotes.discount = options.discount ?? 0;
  TestBed.configureTestingModule({ providers: [
    { provide: PortalNavigation, useValue: navigation },
    { provide: CatalogItemsSource, useValue: { list: () => of(options.catalog ?? [TOUR]) } },
    { provide: DeparturesSource, useValue: { list: () => options.departures ?? of(DEPARTURES) } },
    { provide: SelectionQuoteSource, useValue: quotes },
  ] });
  const fixture = TestBed.createComponent(ReserveTourPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const button = (label: string) => Array.from(host.querySelectorAll('button'))
    .find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement;
  const click = async (label: string) => { button(label).click(); await settle(); };
  return { host, navigation, quotes, settle, text, button, click };
}

afterEach(() => TestBed.resetTestingModule());

describe('reservarTourIsItsOwnCustomerArea (reservar-tour.html, screen 20)', () => {
  it('is one customer entry of PORTAL_AREAS with no client chrome: its own top bar', () => {
    const entries = PORTAL_AREAS.filter((area) => area.component === ReserveTourPageComponent);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: RESERVATION_FLOW.reserve, label: 'Reservar tour', audience: 'customer', clientChrome: 'none' });
  });

  it('draws the topbar, the tour of the parameters and its starting price', async () => {
    const p = await openReserve();
    expect(p.text('.crp-booking-topbar h1')).toBe('Seleccionar salida y viajeros');
    expect(p.text('.crp-booking-topbar button')).toBe('← Volver al tour');
    expect(p.text('.crp-booking-card-head h2')).toBe('Ruta del café en Pitalito');
    expect(p.text('.crp-booking-price-tag')).toBe('Desde $145.000');
    await p.click('← Volver al tour');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.tours);
  });
});

describe('theDepartureListOffersOnlyTheOpenDeparturesOfTheTour (reservar-tour.html v1.9, DeparturesSource of HU-COM-007)', () => {
  const options = (p: { host: HTMLElement }) => Array.from(p.host.querySelectorAll('.crp-departure-option'), (o) => o.textContent?.replace(/\s+/g, ' ').trim());

  it('lists the open departures by date as radios, with their seats, the first one chosen, and no calendar', async () => {
    const p = await openReserve();
    expect(p.text('.crp-booking-card-head p')).toBe('Elige una de las salidas programadas.');
    expect(p.text('.crp-booking-card h3')).toBe('Salidas programadas');
    expect(p.text('.crp-booking-card .crp-booking-reference')).toContain('Cada reserva corresponde a una única salida; si quieres viajar en otra salida, crea otra reserva.');
    expect(p.host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Salidas programadas');
    expect(options(p)).toEqual(['14 nov 2026 3 cupos disponibles', '05 dic 2026 3 cupos disponibles']);
    expect(p.host.querySelector<HTMLInputElement>('.crp-departure-option input:checked')?.value).toBe('dep-a');
    expect(p.host.querySelector('.crp-booking-calendar-head, .crp-booking-days')).toBeNull();
  });

  it('choosing another departure moves the selection of the bar', async () => {
    const p = await openReserve();
    p.host.querySelector<HTMLInputElement>('.crp-departure-option input[value="dep-b"]')!.click(); await p.settle();
    expect(p.text('.crp-booking-bar-selection strong')).toBe('05 dic 2026 - 1 viajero');
    expect(p.host.querySelector('.crp-departure-option.crp-is-active')?.textContent).toContain('05 dic 2026');
  });

  it('a full departure says so, is not chosen first and cannot be continued', async () => {
    const p = await openReserve({ departures: of([departure('dep-a', '2026-11-14', { effectiveCapacity: 0 }), departure('dep-b', '2026-12-05')]) });
    expect(options(p)).toEqual(['14 nov 2026 Salida llena', '05 dic 2026 3 cupos disponibles']);
    expect(p.host.querySelector<HTMLInputElement>('.crp-departure-option input:checked')?.value).toBe('dep-b');
    p.host.querySelector<HTMLInputElement>('.crp-departure-option input[value="dep-a"]')!.click(); await p.settle();
    expect(p.text('.crp-booking-capacity')).toBe('Esta salida está llena: no hay cupos disponibles y no se crea la reserva. Elige otra salida.');
    expect(p.button('Continuar reserva').disabled).toBe(true);
  });

  it('shows the conditions of the chosen departure inside Ver condiciones', async () => {
    const p = await openReserve();
    expect(p.text('.crp-booking-note strong')).toBe('Condiciones de reserva');
    expect(p.text('.crp-booking-note summary')).toBe('Ver condiciones');
    expect(p.text('.crp-booking-note li')).toBe('Cambios hasta 72 horas antes de la salida.');
  });
});

describe('theTravelersCounterChecksTheCapacityWithoutHoldingASeat', () => {
  it('counts from one, includes the holder, and says when the departure has no room', async () => {
    const p = await openReserve();
    expect(p.text('.crp-booking-guest-row p')).toBe('Viajeros Incluye al titular y sus acompañantes.');
    expect(p.host.textContent).toContain('Incluido en el paquete: la alimentación indicada en el tour forma parte del paquete. Multitour no reserva habitaciones ni mesas: hoteles y restaurantes asociados se consultan solo como información de contacto.');
    expect(p.text('.crp-booking-counter strong')).toBe('1');
    await p.click('Quitar un viajero');
    expect(p.text('.crp-booking-counter strong')).toBe('1');
    expect(p.text('.crp-booking-capacity')).toBe('Hay 3 cupos disponibles en la salida seleccionada. El cupo no se garantiza hasta tu primer pago (comprobante presentado o efectivo registrado).');
    for (let i = 0; i < 3; i += 1) await p.click('Agregar un viajero');
    expect(p.text('.crp-booking-counter strong')).toBe('4');
    expect(p.text('.crp-booking-capacity')).toBe('Cupo no disponible: esta salida solo tiene 3 cupos disponibles y seleccionaste 4 viajeros.');
    expect(p.button('Continuar reserva').disabled).toBe(true);
  });
});

describe('theBottomBarShowsTheValuesOfTheQuotePort', () => {
  it('asks the quote of the selection and writes it in pesos, with no math in the view', async () => {
    const p = await openReserve({ discount: 3_260_000 });
    await p.click('Agregar un viajero');
    expect(p.quotes.asked.at(-1)).toEqual({ departureId: 'dep-a', serviceIds: ['svc-1'], people: 2 });
    const cells = Array.from(p.host.querySelectorAll('.crp-booking-bar-pricing > div'), (d) => d.textContent?.replace(/\s+/g, ' ').trim());
    expect(cells).toEqual(['Valor proyectado $326.000', 'Descuento vigente -$32.600', 'Valor final $293.400']);
    expect(p.text('.crp-booking-bar-selection')).toBe('Seleccionado 14 nov 2026 - 2 viajeros');
    expect(p.host.textContent).not.toMatch(/dep-a|svc-1|PROGRAMADA|2026-11-14|32600/);
  });

  it('hides Descuento vigente when the quote brings none', async () => {
    const p = await openReserve();
    expect(p.host.textContent).not.toContain('Descuento vigente');
  });

  it('Continuar reserva opens Finalizar reserva with the selection as parameters', async () => {
    const p = await openReserve();
    await p.click('Agregar un viajero');
    await p.click('Continuar reserva');
    expect(p.navigation.selected()).toBe(RESERVATION_FLOW.finish);
    expect(p.navigation.params()).toEqual({ departure: 'dep-a', services: 'svc-1', people: '2' });
  });
});

describe('reservarTourShowsOneOfTheFourStates', () => {
  it('loading, error with retry, then data', async () => {
    const answers: Subject<readonly Departure[]>[] = [];
    const departures = new Observable<readonly Departure[]>((subscriber) => { const s = new Subject<readonly Departure[]>(); answers.push(s); return s.subscribe(subscriber); });
    const p = await openReserve({ departures });
    expect(p.host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('loading');
    answers[0].error(new Error('down')); await p.settle();
    expect(p.text('[data-state="error"]')).toContain('No pudimos cargar esta información.');
    await p.click('Reintentar');
    answers[1].next(DEPARTURES); answers[1].complete(); await p.settle();
    expect(p.host.querySelector('[data-state]')?.getAttribute('data-state')).toBe('data');
  });

  it('empty when the tour has no open departure, and when the tour is unknown', async () => {
    const p = await openReserve({ departures: of([]) });
    expect(p.text('[data-state="empty"]')).toBe('Este tour no tiene salidas abiertas para reservas en este momento.');
    expect(p.button('Continuar reserva').disabled).toBe(true);
    TestBed.resetTestingModule();
    const unknown = await openReserve({ tour: 'svc-404' });
    expect(unknown.text('[data-state="empty"]')).toContain('Tour no disponible');
  });
});

// The column and the bar inside it (001- amendment HC-3, 008- H-D11): portal-column.spec.ts.
describe('reservarTourKeepsTheConditionsOfTheMockup (Ver condiciones +)', () => {
  const css = readFileSync('src/styles/portal.css', 'utf8');
  const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';

  it('draws Ver condiciones with + and - instead of the disclosure triangle', async () => {
    const p = await openReserve();
    expect(p.text('.crp-booking-note details.crp-booking-conditions > summary')).toBe('Ver condiciones');
    expect(rule('.crp-root .crp-booking-conditions summary')).toMatch(/list-style:\s*none/);
    expect(rule('.crp-root .crp-booking-conditions summary::-webkit-details-marker')).toMatch(/display:\s*none/);
    expect(rule('.crp-root .crp-booking-conditions summary::after')).toMatch(/content:\s*"\+"/);
    expect(rule('.crp-root .crp-booking-conditions[open] summary::after')).toMatch(/content:\s*"-"/);
  });
});

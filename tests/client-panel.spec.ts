import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolvedPortalCss } from './css-tokens';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountRule } from '../src/app/discounts/model/discount-rule';
import { CLIENT_AREA, PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { ReservationSelectionSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { CustomerStanding, RESERVATION_FLOW, ReservationSelection } from '../src/app/self-service-reservation/model/self-service-reservation';
import { ClientPanelPageComponent } from '../src/app/self-service-reservation/pages/client-panel-page.component';
import { tourPhoto } from '../src/app/shared/tour-photo';
import { ControllableMyReservationsSource, CustomerAs, reservationFor, SELECTION, selectionAt } from './self-service-reservation.double';

const ALL_AREAS = [...Object.values(CLIENT_AREA), ...Object.values(RESERVATION_FLOW)];
const rule = (overrides: Partial<DiscountRule>): DiscountRule => ({
  id: 'r1', name: 'Tour Montañas', startsOn: '2000-01-01', endsOn: '2999-12-31', priority: 1, calculationBase: 'ORIGINAL_VALUE',
  type: 'PERCENTAGE', percentageBasisPoints: 2000, status: 'ACTIVE', ...overrides,
} as DiscountRule);
const tour = (n: number, overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  serviceId: `svc-${n}`, serviceType: 'TOUR', commercialName: `Tour ${n}`, catalogStatus: 'ACTIVE', baseRateCents: 18_000_000 + n * 100_000,
  baseOperationalCostCents: 9_000_000, configuredCapacity: 12, transportRequired: false, highRisk: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides,
});

interface Options {
  readonly standing?: CustomerStanding; readonly selection?: ReservationSelection | null; readonly areas?: readonly string[];
  readonly rules?: readonly DiscountRule[] | 'none'; readonly catalog?: readonly CatalogItem[] | 'fails';
}

async function openPanel(options: Options = {}) {
  const reservations = new ControllableMyReservationsSource();
  const navigation = new PortalNavigation();
  navigation.register(options.areas ?? ALL_AREAS);
  const catalog = options.catalog ?? [tour(1)];
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: new CustomerAs(options.standing ?? 'FINAL_CUSTOMER') },
    { provide: MyReservationsSource, useValue: reservations },
    { provide: ReservationSelectionSource, useValue: selectionAt(options.selection ?? null) },
    { provide: PortalNavigation, useValue: navigation },
    { provide: CatalogItemsSource, useValue: { list: () => (catalog === 'fails' ? throwError(() => new Error('down')) : of(catalog)) } },
    ...(options.rules === 'none' ? [] : [{ provide: DiscountRulesSource, useValue: { list: () => of(options.rules ?? []) } }]),
  ] });
  const fixture = TestBed.createComponent(ClientPanelPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const click = async (selector: string, label: string) => {
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === label)!.click();
    await settle();
  };
  return { host, reservations, navigation, settle, text, texts, click };
}

afterEach(() => TestBed.resetTestingModule());

describe('thePanelClienteIsTheLandingOfTheCustomer (panel-cliente.html, PR #361)', () => {
  it('is the Mis reservas area of the client header', () => {
    const panel = PORTAL_AREAS.find((area) => area.key === CLIENT_AREA.panel);
    expect(panel).toMatchObject({ label: 'Mis reservas', component: ClientPanelPageComponent, audience: 'customer', clientChrome: 'panel' });
    // panel-cliente.html and mis-reservas.html both use the compact header, without the footer (PR #361).
    expect(PORTAL_AREAS.find((area) => area.key === CLIENT_AREA.reservations)?.clientChrome).toBe('panel');
  });

  it('greets the customer as panel-cliente.html, with no name because the session carries none', async () => {
    const p = await openPanel();
    expect(p.text('.crp-panel-eyebrow')).toBe('Portal cliente');
    expect(p.text('h1')).toBe('Hola, te damos la bienvenida');
    expect(p.text('.crp-panel-hero > p:not(.crp-panel-eyebrow)')).toBe(
      'Consulta la oferta disponible, revisa tus reservas y continúa la gestión de tus próximos viajes desde un solo lugar.');
  });

  it('draws the search block with its chips, which open Explorar, Gastronomía and Alojamiento', async () => {
    const p = await openPanel();
    expect(p.text('.crp-panel-search label')).toBe('Buscar tours o establecimientos asociados');
    expect(p.host.querySelector('.crp-panel-search input')?.getAttribute('placeholder')).toBe('Buscar tours, alojamiento o experiencias...');
    expect(p.texts('.crp-panel-chips button')).toEqual(['Gastronomía', 'Tours', 'Alojamiento asociado']);
    await p.click('.crp-panel-chips button', 'Alojamiento asociado');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.lodging);
    await p.click('.crp-panel-search button', 'Buscar');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.tours);
  });

  it('summarizes the active reservations: count, breakdown by state and codes, and opens Mis reservas', async () => {
    const p = await openPanel();
    expect(p.host.querySelector('.crp-panel-reservations [data-state="loading"]')).not.toBeNull();
    p.reservations.requests[0].reply([
      reservationFor(SELECTION, 'RES-1843'),
      { ...reservationFor(SELECTION, 'RES-1844'), reservationStatus: 'CONFIRMED' },
      { ...reservationFor(SELECTION, 'RES-1845'), reservationStatus: 'CANCELLED' },
      { ...reservationFor(SELECTION, 'RES-1846'), reservationStatus: 'CONFIRMED' },
    ]);
    await p.settle();
    expect(p.text('.crp-panel-reservations h2')).toBe('Mis reservas');
    expect(p.text('.crp-panel-card strong')).toBe('3 reservas activas');
    expect(p.text('.crp-panel-card p')).toBe('1 Pendiente de pago · 2 Confirmada');
    expect(p.text('.crp-panel-card small')).toBe('RES-1843 · RES-1844 · RES-1846');
    expect(p.host.textContent).not.toMatch(/PENDING_PAYMENT|CONFIRMED|RES-1845/);
    expect(p.text('.crp-panel-card-pill')).toBe('Consulta en Mis reservas');
    expect(p.text('.crp-panel-card-status small')).toBe('Reservas propias');
    const actions = Array.from(p.host.querySelectorAll('.crp-panel-card-actions button'));
    expect(actions.map((b) => [b.textContent?.trim(), b.className])).toEqual([['Ver mis reservas', 'crp-primary'], ['Ver mis reservas', 'crp-panel-ghost']]);
    await p.click('.crp-panel-card button', 'Ver mis reservas');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.reservations);
  });

  it('sizes the panel as panel-cliente.html: big greeting, full-width search, two wide featured cards, grey quick texts', () => {
    const css = resolvedPortalCss();
    const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';
    expect(rule('.crp-root .crp-panel-hero h1')).toMatch(/font-size:\s*3\.1rem/);
    expect(rule('.crp-root .crp-panel-hero h1')).toMatch(/font-weight:\s*800/);
    expect(rule('.crp-root .crp-panel-search-row input')).toMatch(/max-width:\s*none/);
    expect(rule('.crp-root .crp-panel-featured ul')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(rule('.crp-root .crp-panel-featured img')).toMatch(/height:\s*240px/);
    expect(rule('.crp-root .crp-panel-quick-copy > span')).toMatch(/color:\s*#45555c/);
  });

  it('says there are no active reservations, and offers a retry when they fail', async () => {
    const p = await openPanel();
    p.reservations.requests[0].fail();
    await p.settle();
    await p.click('.crp-panel-card button', 'Reintentar');
    p.reservations.requests[1].reply([{ ...reservationFor(), reservationStatus: 'FINALIZED' }]);
    await p.settle();
    expect(p.text('.crp-panel-card strong')).toBe('No tienes reservas activas');
    expect(p.text('.crp-panel-card p')).toBe('Explora el catálogo y selecciona los servicios para comenzar una nueva reserva.');
  });

  it('reads no reservation for a visitor without a session and asks to sign in as a customer', async () => {
    const p = await openPanel({ standing: 'NO_SESSION' });
    expect(p.reservations.requests).toHaveLength(0);
    expect(p.text('.crp-panel-card')).toContain('Inicia sesión como cliente para ver tus reservas.');
  });

  it('offers only the quick actions of this story: Nueva reserva and Gastronomía', async () => {
    const p = await openPanel();
    expect(p.text('.crp-panel-quick h2')).toBe('Acciones rápidas');
    expect(p.texts('.crp-panel-quick button')).toEqual([
      'NR Nueva reserva Inicia una nueva reserva', 'GA Gastronomía Explora opciones gastronómicas disponibles.',
    ]);
    expect(p.host.textContent).not.toMatch(/Continuar pago|Mis pagos|Notificaciones|Responder propuesta/);
    await p.click('.crp-panel-quick button', 'NR Nueva reserva Inicia una nueva reserva');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.tours);
  });

  it('lists the discounts in force today, or says there are none', async () => {
    const p = await openPanel({ rules: [rule({}), rule({ id: 'r2', name: 'Vencido', endsOn: '2001-01-01' }), rule({ id: 'r3', name: 'Inactivo', status: 'INACTIVE' }),
      rule({ id: 'r4', name: 'Valor fijo', type: 'FIXED_AMOUNT', amountCents: 5_000_000, percentageBasisPoints: undefined })] });
    expect(p.text('.crp-panel-discounts h2')).toBe('Descuentos vigentes');
    expect(p.texts('.crp-panel-promo')).toEqual([
      '20% de descuento Tour Montañas Válido hasta 31 dic 2999', '$50.000 de descuento Valor fijo Válido hasta 31 dic 2999',
    ]);
    TestBed.resetTestingModule();
    for (const rules of [[], 'none'] as const) {
      const empty = await openPanel({ rules });
      expect(empty.text('.crp-panel-discounts p')).toBe('No hay descuentos vigentes en este momento.');
      TestBed.resetTestingModule();
    }
  });

  it('features up to four active tours with a photo, Desde, the price and Ver detalle', async () => {
    const p = await openPanel({ catalog: [tour(1), tour(2, { catalogStatus: 'INACTIVE' }), tour(3, { serviceType: 'TRANSPORTATION' }), tour(4), tour(5), tour(6), tour(7)] });
    expect(p.text('.crp-panel-featured h2')).toBe('Experiencias destacadas');
    const cards = Array.from(p.host.querySelectorAll('.crp-panel-featured li'));
    expect(cards.map((card) => card.querySelector('strong')?.textContent?.trim())).toEqual(['Tour 1', 'Tour 4', 'Tour 5', 'Tour 6']);
    expect(cards[0].querySelector('img')?.getAttribute('src')).toMatch(/^\/assets\/[\w-]+\.jpg$/);
    expect(cards[0].querySelector('img')?.getAttribute('alt')).toBe('Tour 1');
    expect(cards[0].textContent?.replace(/\s+/g, ' ')).toContain('Desde $181.000 Ver detalle');
    expect(p.host.textContent).not.toMatch(/9\.000\.000|\$90\.000|capacidad|cupo/i);
    await p.click('.crp-panel-featured button', 'Ver detalle');
    expect(p.navigation.selected()).toBe(CLIENT_AREA.tours);
  });

  it('keeps the panel when the featured tours cannot be read', async () => {
    const p = await openPanel({ catalog: 'fails' });
    expect(p.text('.crp-panel-featured [role="alert"]')).toBe('No pudimos cargar esta información.');
  });

  it('draws no link to an area the build does not have', async () => {
    const p = await openPanel({ areas: [CLIENT_AREA.panel, CLIENT_AREA.reservations] });
    expect(p.texts('.crp-panel-chips button')).toEqual([]);
    expect(p.texts('.crp-panel-quick button')).toEqual([]);
    expect(p.host.querySelector('.crp-panel-featured button')).toBeNull();
  });

  it('goes straight to Finalizar reserva when the URL carries a selection', async () => {
    const p = await openPanel({ selection: SELECTION });
    await vi.waitFor(() => expect(p.navigation.selected()).toBe(RESERVATION_FLOW.finish));
  });
});

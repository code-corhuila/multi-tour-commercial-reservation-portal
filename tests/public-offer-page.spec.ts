import { TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from '../src/app/public-offer/data/public-offer-sources';
import { PublicTour, TourValue } from '../src/app/public-offer/model/public-offer';
import { GastronomyOfferPageComponent, LodgingOfferPageComponent } from '../src/app/public-offer/pages/establishments-offer-page.component';
import { PublicOfferPageComponent } from '../src/app/public-offer/pages/public-offer-page.component';
import { CLIENT_AREA } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PUBLIC_OFFER_COPY } from '../src/app/public-offer/public-offer-copy';
import { tourPhoto } from '../src/app/shared/tour-photo';
import { actorAs } from './actor-context.double';
import { ControllablePublicEstablishmentsSource, ControllablePublicOfferSource, placeNamed, tourNamed } from './public-offer-sources.double';
import { listSourceFiles, withoutComments } from './source-files';
import { ActorContext } from '../src/app/shared/actor-context';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import type { Departure } from '../src/app/reservations/data/departures-source';
import { of } from 'rxjs';

interface Options {
  readonly value?: TourValueSource; readonly withoutPorts?: boolean; readonly role?: Parameters<typeof actorAs>[0];
  /** Which client page: tours.html (default), alojamiento.html or gastronomia.html. */
  readonly page?: 'tours' | 'lodging' | 'gastronomy';
  /** The shell's navigation, with the areas it can open; absent outside the shell. */
  readonly areas?: readonly string[];
  /** The departures port of HU-COM-007/008; absent where the container does not provide it. */
  readonly departures?: readonly Departure[];
}
const PAGES = { tours: PublicOfferPageComponent, lodging: LodgingOfferPageComponent, gastronomy: GastronomyOfferPageComponent };

async function openPage(options: Options = {}) {
  const tours = new ControllablePublicOfferSource();
  const places = new ControllablePublicEstablishmentsSource();
  TestBed.configureTestingModule({
    providers: [
      ...(options.withoutPorts ? [] : [
        { provide: PublicOfferSource, useValue: tours },
        { provide: PublicEstablishmentsSource, useValue: places },
      ]),
      ...(options.departures ? [{ provide: DeparturesSource, useValue: Object.assign(Object.create(DeparturesSource.prototype), { list: () => of(options.departures) }) }] : []),
      ...(options.value ? [{ provide: TourValueSource, useValue: options.value }] : []),
      ...(options.role ? [{ provide: ActorContext, useValue: actorAs(options.role) }] : []),
      ...(options.areas ? [{ provide: PortalNavigation, useFactory: () => { const nav = new PortalNavigation(); nav.register(options.areas!); return nav; } }] : []),
    ],
  });
  const fixture = TestBed.createComponent(PAGES[options.page ?? 'tours']);
  const host = fixture.nativeElement as HTMLElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const part = (name: 'tours' | 'establishments') => host.querySelector(`[data-part="${name}"]`) as HTMLElement;
  const stateOf = (name: 'tours' | 'establishments') => part(name).querySelector('[data-state]')?.getAttribute('data-state');
  const cards = (name: 'tours' | 'establishments') => Array.from<HTMLElement>(part(name).querySelectorAll('[data-state="data"] li'));
  const chooseDate = async (date: string) => { fireEvent.change(within(host).getByLabelText(PUBLIC_OFFER_COPY.date), { target: { value: date } }); await settle(); };
  const search = async (label: string, text: string) => {
    fireEvent.input(within(host).getByLabelText(label), { target: { value: text } });
    fireEvent.click(within(host).getByRole('button', { name: PUBLIC_OFFER_COPY.search }));
    await settle();
  };
  return { fixture, host, tours, places, settle, part, stateOf, cards, chooseDate, search };
}

afterEach(() => TestBed.resetTestingModule());

describe('onlyWhatIsAvailableForTheDateAppears (AC-PO.2, RN-PO2)', () => {
  it('drops a tour the port marks as not available, even when the port returns it', async () => {
    const page = await openPage();
    page.tours.requests[0].reply([tourNamed('Tatacoa'), tourNamed('Nevado', { available: false })]);
    await page.settle();
    expect(page.cards('tours').map((card) => card.textContent)).toEqual([expect.stringContaining('Tatacoa')]);
    expect(page.host.textContent).not.toContain('Nevado');
  });

  it('starts on the local date, not the UTC one, so a Colombian night still asks for today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 12, 23, 30));
    try {
      const page = await openPage();
      expect(page.tours.requests[0].date).toBe('2026-10-12');
    } finally { vi.useRealTimers(); }
  });

  it('asks again for the chosen date and only the newest answer reaches the screen', async () => {
    const page = await openPage();
    expect(page.tours.requests[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.chooseDate('2026-11-20');
    expect(page.tours.requests).toHaveLength(2);
    expect(page.tours.requests[1].date).toBe('2026-11-20');
    expect(page.tours.requests[0].isOpen()).toBe(false);
    page.tours.requests[1].reply([tourNamed('Pitalito')]);
    await page.settle();
    expect(page.cards('tours').map((card) => card.textContent)).toEqual([expect.stringContaining('Pitalito')]);
  });
});

describe('theToursShowFourStates (AC-PO.8)', () => {
  it('shows loading, then error with a retry that asks again, then empty, then data', async () => {
    const page = await openPage();
    expect(page.stateOf('tours')).toBe('loading');
    page.tours.requests[0].fail();
    await page.settle();
    expect(page.stateOf('tours')).toBe('error');
    fireEvent.click(within(page.part('tours')).getByRole('button', { name: PUBLIC_OFFER_COPY.retry }));
    await page.settle();
    expect(page.tours.requests).toHaveLength(2);
    page.tours.requests[1].reply([tourNamed('Nevado', { available: false })]);
    await page.settle();
    expect(page.stateOf('tours')).toBe('empty');
    await page.chooseDate('2026-11-21');
    page.tours.requests[2].reply([tourNamed('Tatacoa')]);
    await page.settle();
    expect(page.stateOf('tours')).toBe('data');
  });
});

describe('aTourWithTransportSaysSo (AC-PO.3)', () => {
  it('marks transport as included only on the tour that has it', async () => {
    const page = await openPage();
    page.tours.requests[0].reply([tourNamed('Suaza', { transportIncluded: true }), tourNamed('Pitalito')]);
    await page.settle();
    const detailOf = async (position: number) => {
      fireEvent.click(within(page.cards('tours')[position]).getByRole('button', { name: 'Ver detalle' }));
      await page.settle();
      const shown = page.host.querySelector('[data-part="detail"]')?.textContent ?? '';
      fireEvent.click(within(page.host).getByRole('button', { name: /Volver a tours/ }));
      await page.settle();
      return shown;
    };
    expect(page.cards('tours').map((card) => card.textContent).join(' ')).not.toContain(PUBLIC_OFFER_COPY.transportIncluded);
    expect(await detailOf(0)).toContain(PUBLIC_OFFER_COPY.transportIncluded);
    expect(await detailOf(1)).not.toContain(PUBLIC_OFFER_COPY.transportIncluded);
  });
});

describe('theValueComesFromTheValuePort (AC-PO.4, RN-PO4)', () => {
  const card = (page: Awaited<ReturnType<typeof openPage>>) => page.cards('tours')[0];

  it('shows only the base value when no value port is provided', async () => {
    const page = await openPage();
    page.tours.requests[0].reply([tourNamed('Tatacoa', { baseRateCents: 18_000_000 })]);
    await page.settle();
    expect(card(page).querySelector('[data-value="current"]')?.textContent).toContain('$180.000');
    expect(card(page).querySelector('[data-value="base"]')).toBeNull();
  });

  it('shows the discounted value the port returns for the chosen date, with the base beside it', async () => {
    const asked: Array<readonly [PublicTour, string]> = [];
    const value = new (class extends TourValueSource {
      override valueOf(tour: PublicTour, date: string): TourValue { asked.push([tour, date]); return { baseRateCents: tour.baseRateCents, currentValueCents: 16_200_000 }; }
    })();
    const page = await openPage({ value });
    await page.chooseDate('2026-11-22');
    page.tours.requests[1].reply([tourNamed('Tatacoa', { baseRateCents: 18_000_000 })]);
    await page.settle();
    expect(card(page).querySelector('[data-value="current"]')?.textContent).toContain('$162.000');
    expect(card(page).querySelector('[data-value="base"]')?.textContent).toContain('$180.000');
    expect(asked.at(-1)?.[1]).toBe('2026-11-22');
  });

  it('carries no money arithmetic of its own in public-offer/', () => {
    const code = listSourceFiles().filter((file) => file.startsWith('src/app/public-offer/'))
      .map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    expect(code).not.toMatch(/Cents\s*[-*/]|[-*/]\s*\w*Cents\b|\bpercent/i);
  });
});

describe('onlyActiveEstablishmentsAppear (AC-PO.5, RN-PO5)', () => {
  const offer = [
    placeNamed('Casa Neiva'), placeNamed('Hostal La Tatacoa', { active: false }),
    placeNamed('Sabores del Huila', { establishmentType: 'RESTAURANT' }),
  ];

  it('drops an inactive establishment even when the port returns it; Alojamiento shows the hotels with their contact', async () => {
    const page = await openPage({ page: 'lodging' });
    page.places.requests[0].reply(offer);
    await page.settle();
    expect(page.cards('establishments').map((card) => card.textContent)).toEqual([expect.stringContaining('Casa Neiva')]);
    expect(page.host.textContent).not.toContain('Hostal La Tatacoa');
  });

  it('shows the restaurants, and only them, under Gastronomía', async () => {
    const page = await openPage({ page: 'gastronomy' });
    page.places.requests[0].reply(offer);
    await page.settle();
    expect(page.cards('establishments').map((card) => card.textContent)).toEqual([expect.stringContaining('Sabores del Huila')]);
  });

  it('shows loading, error with retry, empty and data for the establishments', async () => {
    const page = await openPage({ page: 'lodging' });
    expect(page.stateOf('establishments')).toBe('loading');
    page.places.requests[0].fail();
    await page.settle();
    expect(page.stateOf('establishments')).toBe('error');
    fireEvent.click(within(page.part('establishments')).getByRole('button', { name: PUBLIC_OFFER_COPY.retry }));
    await page.settle();
    page.places.requests[1].reply([placeNamed('Cafe Altura', { active: false })]);
    await page.settle();
    expect(page.stateOf('establishments')).toBe('empty');
    expect(page.places.requests).toHaveLength(2);
  });

  it('does not ask for the establishments on the tours page', async () => {
    const page = await openPage();
    await page.chooseDate('2026-11-23');
    expect(page.places.requests).toHaveLength(0);
  });
});

describe('theOfferIsReadOnlyAndLeaksNothing (AC-PO.1, AC-PO.6, AC-PO.7, RN-PO7)', () => {
  async function fullPage(role?: Options['role']) {
    const page = await openPage({ role });
    page.tours.requests[0].reply([tourNamed('Tatacoa', { transportIncluded: true })]);
    await page.settle();
    return page;
  }

  it('has no form and no reservation button: only the search, the date and Ver detalle', async () => {
    const page = await fullPage();
    expect(page.host.querySelectorAll('form, textarea, select')).toHaveLength(0);
    expect(Array.from(page.host.querySelectorAll('button'), (b) => b.textContent?.trim())).toEqual(['Buscar', 'Ver detalle']);
    expect(Array.from(page.host.querySelectorAll('input'), (input) => input.type)).toEqual(['search', 'date']);
    fireEvent.click(within(page.host).getByRole('button', { name: PUBLIC_OFFER_COPY.detail }));
    await page.settle();
    expect(Array.from(page.host.querySelectorAll('button'), (b) => b.textContent?.trim())).toEqual(['← Volver a tours']);
  });

  it('never shows a cost, a capacity or a catalog status', async () => {
    const page = await fullPage();
    fireEvent.click(within(page.host).getByRole('button', { name: PUBLIC_OFFER_COPY.detail }));
    await page.settle();
    const shown = page.host.cloneNode(true) as HTMLElement;
    shown.querySelectorAll('h2').forEach((title) => title.remove());
    expect(shown.textContent ?? '').not.toMatch(/ACTIVE|INACTIVE|cost|costo|capacity|capacidad|cupo/i);
  });

  it('renders the same view for an internal role, an unknown role and no actor at all', async () => {
    const markup: string[] = [];
    for (const role of ['TENANT_ADMINISTRATOR', 'READ_ONLY', undefined] as const) {
      markup.push((await fullPage(role)).host.innerHTML);
      TestBed.resetTestingModule();
    }
    expect(new Set(markup).size).toBe(1);
  });

  it('shows the error state, not a crash, when the container provides no offer ports', async () => {
    expect((await openPage({ withoutPorts: true })).stateOf('tours')).toBe('error');
    TestBed.resetTestingModule();
    expect((await openPage({ withoutPorts: true, page: 'lodging' })).stateOf('establishments')).toBe('error');
  });

  it('never reads the actor, the session or an idempotency key', () => {
    const code = listSourceFiles().filter((file) => file.startsWith('src/app/public-offer/'))
      .map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    expect(code).not.toMatch(/ActorContext|session|Idempotency/i);
  });
});

const UNIFIED = 'La plataforma no crea reservas de habitación ni de mesa, ni gestiona tarifas, disponibilidad o inventario. Las condiciones de reserva, cambio o cancelación se acuerdan entre tú y el establecimiento.';

describe('theOfferFollowsItsAuthorizedScreens (tours.html, detalle-tour.html, alojamiento.html, gastronomia.html, restaurantes.html; PR #361)', () => {
  const discounted = (label?: string) => new (class extends TourValueSource {
    override valueOf(tour: PublicTour): TourValue {
      return tour.commercialName === 'Suaza'
        ? { baseRateCents: tour.baseRateCents, currentValueCents: 103_920_000, ...(label ? { discountLabel: label } : {}) }
        : { baseRateCents: tour.baseRateCents, currentValueCents: tour.baseRateCents };
    }
  })();
  const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();
  const withTours = async (options: Options = {}) => {
    const page = await openPage({ value: discounted('20% de descuento'), ...options });
    page.tours.requests[0].reply([tourNamed('Suaza', { baseRateCents: 129_900_000, transportIncluded: true }), tourNamed('Pitalito')]);
    await page.settle();
    return page;
  };

  it('draws the header of tours.html with its search, in Spanish', async () => {
    const page = await openPage();
    expect(text(page.host.querySelector('.crp-page-header-eyebrow'))).toBe('Catálogo de experiencias');
    expect(text(page.host.querySelector('h1'))).toBe('Tours');
    expect(page.host.querySelector('.crp-page-header-desc')).toBeNull();
    expect(page.host.textContent).not.toContain('Explora los tours disponibles');
    expect(within(page.host).getByLabelText('Buscar tours por nombre o destino').getAttribute('placeholder')).toBe('Buscar tours por nombre o destino...');
    const header = page.host.querySelector('header.crp-offer-head')!;
    const action = header.querySelector('.crp-page-header-action.crp-offer-search')!;
    expect(Array.from(action.children, (child) => child.tagName)).toEqual(['INPUT', 'BUTTON', 'LABEL']);
    expect(text(action.querySelector('label.crp-offer-date > span'))).toBe('Fecha');
    expect(within(page.host).getByLabelText('Fecha').closest('.crp-offer-search')).toBe(action);
    expect(page.host.querySelector('.crp-offer-when, [data-date]')).toBeNull();
    expect(page.host.textContent).not.toMatch(/Disponibles el|Fecha de consulta/);
    expect(page.part('tours').getAttribute('aria-label')).toBe('Listado de tours disponibles');
    expect(text(page.part('tours').querySelector('[data-state="loading"]'))).toBe('Cargando tours…');
    expect(page.host.querySelector('.crp-operator-panel, .crp-operator-panel-head')).toBeNull();
  });

  it('keeps the chosen date in the compact Fecha control and never writes it as an ISO date', async () => {
    const page = await openPage();
    await page.chooseDate('2026-11-22');
    expect(within(page.host).getByLabelText<HTMLInputElement>('Fecha').value).toBe('2026-11-22');
    expect(page.host.textContent).not.toContain('2026-11-22');
  });

  it('keeps the photo of a card at 140px (main.css refinement) and the search row narrow, with the buttons at the size of the mockup', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';
    expect(rule('.crp-root .crp-tour-media')).toMatch(/position:\s*relative;\s*overflow:\s*hidden;\s*height:\s*140px;/);
    expect(rule('.crp-root .crp-tour-media img')).toMatch(/position:\s*absolute;\s*inset:\s*0;.*width:\s*100%;\s*height:\s*100%;\s*object-fit:\s*cover;/);
    expect(rule('.crp-root .crp-offer-search')).toMatch(/display:\s*flex;.*width:\s*auto;\s*max-width:\s*100%;\s*align-self:\s*flex-end;/);
    expect(rule('.crp-root .crp-offer-search input[type="search"]')).toMatch(/flex:\s*0 1 180px;/);
    expect(rule('.crp-root .crp-tour-meta button')).toMatch(/font-size:\s*0\.8rem;/);
    expect(rule('.crp-root .crp-offer-reserve')).toMatch(/font-size:\s*0\.88rem;/);
  });

  it('draws a tour card as tours.html: photo, tag of the value port, struck base, from-value in green and Ver detalle', async () => {
    const page = await withTours();
    const [suaza, pitalito] = page.cards('tours');
    const photo = suaza.querySelector('.crp-tour-media img');
    expect(photo?.getAttribute('src')).toMatch(/^\/assets\/[\w-]+\.jpg$/);
    expect(photo?.getAttribute('alt')).toBe('Suaza');
    // The photo follows the tour id, not the card position, so the tour looks the same in Reservar tour and Finalizar reserva.
    expect(photo?.getAttribute('src')).toBe(tourPhoto('tour-Suaza'));
    expect(pitalito.querySelector('.crp-tour-media img')?.getAttribute('src')).toBe(tourPhoto('tour-Pitalito'));
    expect(text(suaza.querySelector('.crp-tour-media .crp-tour-discount-tag'))).toBe('20% de descuento');
    expect(text(suaza.querySelector('.crp-tour-body strong'))).toBe('Suaza');
    expect(text(suaza.querySelector('.crp-tour-price'))).toBe('Antes: $1.299.000 Desde $1.039.200');
    expect(suaza.querySelector('.crp-tour-price del')?.textContent).toBe('$1.299.000');
    expect(suaza.querySelector('.crp-tour-transport')).toBeNull();
    expect(suaza.textContent).not.toContain('Transporte incluido');
    const meta = suaza.querySelector('.crp-tour-meta')!;
    expect(Array.from(meta.children, (child) => child.className)).toEqual(['crp-tour-price', 'crp-outline']);
    expect(meta.querySelector('button.crp-outline')?.textContent?.trim()).toBe('Ver detalle');
    expect(suaza.querySelector('.crp-tour-body strong')?.getAttribute('title')).toBe('Suaza');
    expect(text(pitalito.querySelector('.crp-tour-price'))).toBe('Desde $18.000');
    expect(pitalito.querySelector('.crp-tour-discount-tag')).toBeNull();
    expect(pitalito.querySelector('.crp-tour-media img')?.getAttribute('src')).not.toBe(photo?.getAttribute('src'));
  });

  it('writes N% de descuento from the base and current values when the value port gives no label, as tours.html does', async () => {
    const page = await openPage({ value: discounted() });
    page.tours.requests[0].reply([tourNamed('Suaza', { baseRateCents: 129_900_000 })]);
    await page.settle();
    expect(text(page.cards('tours')[0].querySelector('.crp-tour-discount-tag'))).toBe('20% de descuento');
  });

  it('filters the tours by name with Buscar, without asking the port again', async () => {
    const page = await withTours();
    await page.search('Buscar tours por nombre o destino', 'pita');
    expect(page.cards('tours').map((card) => text(card.querySelector('strong')))).toEqual(['Pitalito']);
    await page.search('Buscar tours por nombre o destino', 'nevado');
    expect(page.stateOf('tours')).toBe('empty');
    expect(page.tours.requests).toHaveLength(1);
  });

  it('opens the detail of detalle-tour.html with Ver detalle and goes back with Volver a tours', async () => {
    const page = await withTours();
    await page.chooseDate('2026-11-22');
    page.tours.requests[1].reply([tourNamed('Suaza', { baseRateCents: 129_900_000, transportIncluded: true })]);
    await page.settle();
    fireEvent.click(within(page.cards('tours')[0]).getByRole('button', { name: 'Ver detalle' }));
    await page.settle();
    const detail = page.host.querySelector('[data-part="detail"]')!;
    expect(text(detail.querySelector('.crp-page-header-eyebrow'))).toBe('Detalle del tour');
    expect(text(detail.querySelector('h1'))).toBe('Suaza');
    expect(Array.from(detail.querySelectorAll('h2'), (h) => text(h))).toEqual(['Vigencia, capacidad y restricciones', 'Condiciones de reserva']);
    expect(text(detail.querySelector('.crp-offer-facts'))).toBe('Vigencia Disponible el 22 nov 2026 Transporte Transporte incluido');
    expect(Array.from(detail.querySelectorAll('.crp-offer-conditions li'), (li) => text(li))).toEqual([
      'La modificación o cancelación depende de las condiciones vigentes del tour.',
      'La disponibilidad y los valores se validan antes de registrar la reserva.',
    ]);
    const summary = detail.querySelector('.crp-offer-summary')!;
    expect(text(summary)).toBe('Resumen comercial 20% de descuento Antes: $1.299.000 Desde: $1.039.200 Vigencia Disponible el 22 nov 2026');
    expect(summary.querySelector('.crp-offer-summary-price .crp-tour-discount-tag')).not.toBeNull();
    expect(detail.textContent).not.toMatch(/Reservar/);
    fireEvent.click(within(page.host).getByRole('button', { name: /Volver a tours/ }));
    await page.settle();
    expect(page.cards('tours')).toHaveLength(1);
  });

  it('writes the validity the offer port gives as detalle-tour.html: a range and Vigente del … al …', async () => {
    const page = await openPage();
    page.tours.requests[0].reply([tourNamed('Suaza', { validity: { from: '2026-09-01', to: '2026-09-30' } })]);
    await page.settle();
    fireEvent.click(within(page.cards('tours')[0]).getByRole('button', { name: 'Ver detalle' }));
    await page.settle();
    const detail = page.host.querySelector('[data-part="detail"]')!;
    expect(text(detail.querySelector('.crp-offer-facts'))).toBe('Vigencia 01 sep 2026 - 30 sep 2026');
    expect(text(detail.querySelector('.crp-offer-summary .crp-offer-facts'))).toBe('Vigencia 01 sep 2026 - 30 sep 2026');
    expect(text(detail.querySelector('.crp-offer-validity'))).toBe('Vigente del 01 sep 2026 al 30 sep 2026.');
  });

  it('draws Reservar tour only when the shell can open Reservar tour of HU-COM-008, and opens it on the tour', async () => {
    const page = await openPage({ areas: [CLIENT_AREA.tours, 'reserve'] });
    page.tours.requests[0].reply([tourNamed('Suaza')]);
    await page.settle();
    expect(page.host.textContent).not.toContain('Elegir salida y reservar');
    fireEvent.click(within(page.cards('tours')[0]).getByRole('button', { name: 'Ver detalle' }));
    await page.settle();
    const reserve = within(page.host).getByRole('button', { name: 'Elegir salida y reservar' });
    expect(reserve.classList).toContain('crp-primary');
    expect(reserve.closest('.crp-offer-summary')).not.toBeNull();
    fireEvent.click(reserve);
    expect(TestBed.inject(PortalNavigation).selected()).toBe('reserve');
    expect(TestBed.inject(PortalNavigation).params()).toEqual({ tour: 'tour-Suaza' });
  });

  it('lays the cards of tours.html out in four columns with 140px photos and the price beside Ver detalle', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.crp-root .crp-offer-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toMatch(/\.crp-root \.crp-tour-media \{[^}]*height: 140px;/);
    expect(css).toMatch(/\.crp-root \.crp-tour-meta \{[^}]*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.crp-root \.crp-tour-card \.crp-tour-body strong \{[^}]*white-space: nowrap;/);
    expect(css).toMatch(/\.crp-root \.crp-offer-head \.crp-page-header-eyebrow \{[^}]*font-size: 1rem; font-weight: 400;[^}]*text-transform: none;/);
    expect(css).toMatch(/\.crp-root \.crp-offer-head \.crp-page-header-title \{[^}]*font-size: 2rem; font-weight: 700;/);
  });

  it('shows Volver al panel cliente only when the shell can open the panel, and opens it', async () => {
    expect((await openPage()).host.textContent).not.toContain('Volver al panel cliente');
    TestBed.resetTestingModule();
    const page = await openPage({ areas: [CLIENT_AREA.panel, CLIENT_AREA.tours] });
    fireEvent.click(within(page.host).getByRole('button', { name: /Volver al panel cliente/ }));
    expect(TestBed.inject(PortalNavigation).selected()).toBe(CLIENT_AREA.panel);
  });

  it('draws Alojamiento as alojamiento.html: header, agreement and a card with photo and contact', async () => {
    const page = await openPage({ page: 'lodging' });
    page.places.requests[0].reply([
      placeNamed('Casa Neiva', { region: 'Región Andina', contact: { email: 'reservas@casaneiva.co', phone: '+57 300 555 0184', address: 'Vía principal, km 8' } }),
      placeNamed('Posada', { commercialInformation: 'Alojamiento rural entre cafetales.' }),
    ]);
    await page.settle();
    expect(text(page.host.querySelector('.crp-page-header-eyebrow'))).toBe('Establecimientos asociados');
    expect(text(page.host.querySelector('h1'))).toBe('Alojamiento');
    expect(text(page.host.querySelector('.crp-page-header-desc'))).toBe('Hoteles asociados al operador, con sus datos de contacto para que coordines directamente con ellos.');
    expect(text(page.host.querySelector('.crp-offer-agreement'))).toBe('Información del convenio Coordina directamente con el establecimiento '
      + 'Multitour no genera reservas de habitación ni administra tarifas, disponibilidad o inventario. Las condiciones de reserva, cambio o cancelación se acuerdan directamente entre tú y el hotel.');
    const [hotel, posada] = page.cards('establishments');
    // The photo follows the TYPE of the establishment (a hotel for every card of Alojamiento), as alojamiento.html.
    expect(hotel.querySelector('img')?.getAttribute('src')).toBe('/assets/alojamiento-asociado.jpg');
    expect(posada.querySelector('img')?.getAttribute('src')).toBe('/assets/alojamiento-asociado.jpg');
    expect(hotel.querySelector('img')?.getAttribute('alt')).toBe('Casa Neiva');
    expect(text(hotel.querySelector('strong'))).toBe('Casa Neiva');
    expect(text(hotel.querySelector('.crp-establishment-type'))).toBe('Alojamiento asociado · Región Andina');
    expect(text(hotel.querySelector('.crp-establishment-contact'))).toBe('Contacto: reservas@casaneiva.co +57 300 555 0184 Vía principal, km 8');
    expect(Array.from(hotel.querySelectorAll('.crp-establishment-contact span'), (line) => text(line))).toEqual(['reservas@casaneiva.co', '+57 300 555 0184', 'Vía principal, km 8']);
    expect(text(posada.querySelector('.crp-establishment-type'))).toBe('Alojamiento asociado');
    expect(text(posada.querySelector('.crp-establishment-info'))).toBe('Alojamiento rural entre cafetales.');
    expect(posada.querySelector('.crp-establishment-contact')).toBeNull();
    expect(posada.textContent).not.toContain('Contacto:');
    expect(page.host.querySelector('input')).toBeNull();
  });

  const restaurants = () => [
    placeNamed('Sabores del Huila', { establishmentType: 'RESTAURANT', contact: { email: 'reservas@sabores.co', phone: '+57 310 555 0220' } }),
    placeNamed('Fogón', { establishmentType: 'RESTAURANT' }),
  ];
  const gastronomy = async () => {
    const page = await openPage({ page: 'gastronomy', areas: [CLIENT_AREA.panel, CLIENT_AREA.gastronomy] });
    page.places.requests[0].reply(restaurants());
    await page.settle();
    const click = async (name: string | RegExp, scope: HTMLElement = page.host) => { fireEvent.click(within(scope).getByRole('button', { name })); await page.settle(); };
    return { ...page, click };
  };

  it('draws Gastronomía as gastronomia.html: informative only, with the agreement and no search, filters or dishes (GAP-04)', async () => {
    const page = await gastronomy();
    expect(text(page.host.querySelector('.crp-page-header-eyebrow'))).toBe('Establecimientos asociados');
    expect(text(page.host.querySelector('h1'))).toBe('Gastronomía');
    expect(text(page.host.querySelector('.crp-page-header-desc'))).toBe('Restaurantes asociados al operador, con sus datos de contacto para que coordines directamente con ellos.');
    expect(text(page.host.querySelector('.crp-offer-agreement'))).toBe('Información del convenio Coordina directamente con el establecimiento '
      + 'Multitour no genera reservas de mesa ni administra tarifas, disponibilidad o inventario de alimentación. Las condiciones de reserva, cambio o cancelación se acuerdan directamente entre tú y el restaurante.');
    expect(page.host.querySelector('input, .crp-offer-filters')).toBeNull();
    expect(page.host.textContent).not.toMatch(/Platos del día|platos|Todos/);
    expect(page.part('establishments').getAttribute('aria-label')).toBe('Restaurantes asociados');
    expect(page.cards('establishments').map((card) => text(card.querySelector('strong')))).toEqual(['Sabores del Huila', 'Fogón']);
    expect(text(page.cards('establishments')[0].querySelector('.crp-establishment-type'))).toBe('Restaurante asociado');
    expect(page.cards('establishments').map((card) => card.querySelector('img')?.getAttribute('src'))).toEqual(Array(2).fill('/assets/restaurante-asociado.jpg'));
    expect(text(page.cards('establishments')[0].querySelector('.crp-establishment-contact'))).toBe('Contacto: reservas@sabores.co +57 310 555 0220');
    expect(text(page.cards('establishments')[0].querySelector('button.crp-offer-link'))).toBe('Ver contacto');
  });

  it('says No hay restaurantes asociados activos en este momento when there is none, and the same for hotels', async () => {
    const page = await openPage({ page: 'gastronomy' });
    page.places.requests[0].reply([placeNamed('Fogón', { establishmentType: 'RESTAURANT', active: false })]);
    await page.settle();
    expect(text(page.host.querySelector('[data-state="empty"]'))).toBe('No hay restaurantes asociados activos en este momento.');
    TestBed.resetTestingModule();
    const lodging = await openPage({ page: 'lodging' });
    lodging.places.requests[0].reply([]);
    await lodging.settle();
    expect(text(lodging.host.querySelector('[data-state="empty"]'))).toBe('No hay alojamientos asociados activos en este momento.');
  });

  it('opens detalle-gastronomia.html with Ver contacto: hero, name, category and the Contacto box', async () => {
    const page = await gastronomy();
    await page.click('Ver contacto', page.cards('establishments')[0]);
    const venue = page.host.querySelector('[data-part="venue"]')!;
    expect(text(venue.querySelector('.crp-offer-back'))).toBe('← Volver a gastronomía');
    expect(text(venue.querySelector('.crp-page-header-eyebrow'))).toBe('Restaurante asociado');
    expect(venue.querySelector('img.crp-venue-hero')?.getAttribute('src')).toBe('/assets/restaurante-asociado.jpg');
    expect(text(venue.querySelector('h1'))).toBe('Sabores del Huila');
    expect(text(venue.querySelector('.crp-venue-category'))).toBe('Restaurante asociado');
    expect(text(venue.querySelector('.crp-establishment-contact'))).toBe('Contacto: reservas@sabores.co +57 310 555 0220');
    expect(text(venue.querySelector('.crp-venue-contact'))).toBe('Contacto Coordina directamente con el establecimiento. '
      + UNIFIED);
    expect(page.host.querySelector('[data-part="establishments"]')).toBeNull();
    await page.click(/Volver a gastronomía/);
    expect(page.cards('establishments')).toHaveLength(2);
  });

  it('opens the contact of a hotel from Alojamiento and goes back with Volver a alojamiento', async () => {
    const page = await openPage({ page: 'lodging' });
    page.places.requests[0].reply([placeNamed('Casa Neiva', { commercialInformation: '' })]);
    await page.settle();
    fireEvent.click(within(page.cards('establishments')[0]).getByRole('button', { name: 'Ver contacto' }));
    await page.settle();
    const venue = page.host.querySelector('[data-part="venue"]')!;
    expect(text(venue.querySelector('.crp-venue-category'))).toBe('Alojamiento asociado');
    expect(text(venue.querySelector('.crp-venue-info'))).toBe('Sin información adicional registrada.');
    expect(venue.querySelector('.crp-establishment-contact')).toBeNull();
    expect(text(venue.querySelector('.crp-venue-contact p:last-child'))).toBe(UNIFIED);
    fireEvent.click(within(page.host).getByRole('button', { name: /Volver a alojamiento/ }));
    await page.settle();
    expect(text(page.host.querySelector('h1'))).toBe('Alojamiento');
  });

  const departureOf = (tourName: string, date: string, effectiveCapacity: number, over: Partial<Departure> = {}): Departure =>
    ({ id: `dep-${date}`, tourName, date, state: 'PROGRAMADA', openForReservations: true, effectiveCapacity, transportPerPersonCents: 0, conditions: '', ...over });
  const detailWith = async (departures?: readonly Departure[]) => {
    const page = await openPage({ departures, areas: [CLIENT_AREA.tours, 'reserve'] });
    page.tours.requests[0].reply([tourNamed('Canotaje en el Río Suaza')]);
    await page.settle();
    fireEvent.click(within(page.cards('tours')[0]).getByRole('button', { name: 'Ver detalle' }));
    await page.settle();
    return { page, detail: page.host.querySelector('[data-part="detail"]')! };
  };

  it('lists the Salidas programadas of the tour with the date and the seats left, and enables Elegir salida y reservar', async () => {
    const { page, detail } = await detailWith([
      departureOf('Canotaje en el rio Suaza', '2026-11-21', 8), departureOf('Canotaje en el rio Suaza', '2026-12-05', 0),
      departureOf('Ruta del café en Pitalito', '2026-11-14', 2), departureOf('Canotaje en el rio Suaza', '2026-11-01', 5, { state: 'CANCELADA' }),
    ]);
    expect(Array.from(detail.querySelectorAll('h2'), (h) => text(h))).toContain('Salidas programadas');
    expect(text(detail.querySelector('.crp-offer-departures > p'))).toBe('Cada reserva corresponde a una única salida. El cupo se controla por salida y se aparta con tu primer pago.');
    expect(Array.from(detail.querySelectorAll('.crp-offer-departures li'), (row) => text(row))).toEqual(['21 nov 2026 8 cupos disponibles', '05 dic 2026 Salida llena: sin cupos disponibles']);
    expect(within(page.host).getByRole('button', { name: 'Elegir salida y reservar' }).hasAttribute('disabled')).toBe(false);
  });

  it('disables the button when no departure has seats, and says there are none when the tour has no departures', async () => {
    const full = await detailWith([departureOf('Canotaje en el Río Suaza', '2026-12-05', 0)]);
    expect(within(full.page.host).getByRole('button', { name: 'Elegir salida y reservar' }).hasAttribute('disabled')).toBe(true);
    TestBed.resetTestingModule();
    const none = await detailWith([]);
    expect(text(none.detail.querySelector('.crp-offer-departures'))).toContain('No hay salidas programadas disponibles para este tour por ahora.');
    expect(within(none.page.host).getByRole('button', { name: 'Elegir salida y reservar' }).hasAttribute('disabled')).toBe(true);
  });

  it('draws no departures section where the container provides no departures port', async () => {
    const { detail } = await detailWith(undefined);
    expect(detail.querySelector('.crp-offer-departures')).toBeNull();
    expect(detail.textContent).not.toContain('Salidas programadas');
  });

  it('shows no raw code, no ISO date and no booking action of HU-COM-008', async () => {
    const page = await withTours();
    const all = page.host.textContent ?? '';
    expect(all).not.toMatch(/\bHOTEL\b|\bRESTAURANT\b|\d{4}-\d{2}-\d{2}|\d\.\d{2}(?!\d)|Reservar/);
  });
});

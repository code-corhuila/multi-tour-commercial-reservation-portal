import { TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActorContext } from '../src/app/catalog/data/catalog-api.service';
import { PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from '../src/app/public-offer/data/public-offer-sources';
import { PublicTour, TourValue } from '../src/app/public-offer/model/public-offer';
import { PublicOfferPageComponent } from '../src/app/public-offer/pages/public-offer-page.component';
import { PUBLIC_OFFER_COPY } from '../src/app/public-offer/public-offer-copy';
import { actorAs } from './actor-context.double';
import { ControllablePublicEstablishmentsSource, ControllablePublicOfferSource, placeNamed, tourNamed } from './public-offer-sources.double';
import { listSourceFiles, withoutComments } from './source-files';

interface Options { readonly value?: TourValueSource; readonly withoutPorts?: boolean; readonly role?: Parameters<typeof actorAs>[0] }

async function openPage(options: Options = {}) {
  const tours = new ControllablePublicOfferSource();
  const places = new ControllablePublicEstablishmentsSource();
  TestBed.configureTestingModule({
    providers: [
      ...(options.withoutPorts ? [] : [
        { provide: PublicOfferSource, useValue: tours },
        { provide: PublicEstablishmentsSource, useValue: places },
      ]),
      ...(options.value ? [{ provide: TourValueSource, useValue: options.value }] : []),
      ...(options.role ? [{ provide: ActorContext, useValue: actorAs(options.role) }] : []),
    ],
  });
  const fixture = TestBed.createComponent(PublicOfferPageComponent);
  const host = fixture.nativeElement as HTMLElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const part = (name: 'tours' | 'establishments') => host.querySelector(`[data-part="${name}"]`) as HTMLElement;
  const stateOf = (name: 'tours' | 'establishments') => part(name).querySelector('[data-state]')?.getAttribute('data-state');
  const cards = (name: 'tours' | 'establishments') => Array.from<HTMLElement>(part(name).querySelectorAll('[data-state="data"] li'));
  const chooseDate = async (date: string) => { fireEvent.change(within(host).getByLabelText(PUBLIC_OFFER_COPY.date), { target: { value: date } }); await settle(); };
  return { fixture, host, tours, places, settle, part, stateOf, cards, chooseDate };
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
    const [suaza, pitalito] = page.cards('tours');
    expect(suaza.textContent).toContain(PUBLIC_OFFER_COPY.transportIncluded);
    expect(pitalito.textContent).not.toContain(PUBLIC_OFFER_COPY.transportIncluded);
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
  it('drops an inactive establishment even when the port returns it, and shows the contact of the active ones', async () => {
    const page = await openPage();
    page.places.requests[0].reply([
      placeNamed('Casa Neiva'), placeNamed('Hostal La Tatacoa', { active: false }),
      placeNamed('Sabores del Huila', { establishmentType: 'RESTAURANT' }),
    ]);
    await page.settle();
    const texts = page.cards('establishments').map((card) => card.textContent);
    expect(texts).toEqual([expect.stringContaining('Contacto de Casa Neiva'), expect.stringContaining('Contacto de Sabores del Huila')]);
    expect(page.host.textContent).not.toContain('Hostal La Tatacoa');
  });

  it('shows loading, error with retry, empty and data for the establishments', async () => {
    const page = await openPage();
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

  it('does not ask for the establishments again when only the date changes', async () => {
    const page = await openPage();
    await page.chooseDate('2026-11-23');
    expect(page.places.requests).toHaveLength(1);
  });
});

describe('theOfferIsReadOnlyAndLeaksNothing (AC-PO.1, AC-PO.6, AC-PO.7, RN-PO7)', () => {
  async function fullPage(role?: Options['role']) {
    const page = await openPage({ role });
    page.tours.requests[0].reply([tourNamed('Tatacoa', { transportIncluded: true })]);
    page.places.requests[0].reply([placeNamed('Casa Neiva')]);
    await page.settle();
    return page;
  }

  it('has no form, no button and no field other than the date', async () => {
    const page = await fullPage();
    expect(page.host.querySelectorAll('form, textarea, select')).toHaveLength(0);
    expect(page.host.querySelectorAll('button')).toHaveLength(0);
    expect(Array.from(page.host.querySelectorAll('input')).map((input) => input.type)).toEqual(['date']);
  });

  it('never shows a cost, a capacity or a catalog status', async () => {
    const text = (await fullPage()).host.textContent ?? '';
    expect(text).not.toMatch(/ACTIVE|INACTIVE|cost|costo|capacity|capacidad|cupo/i);
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
    const page = await openPage({ withoutPorts: true });
    expect(page.stateOf('tours')).toBe('error');
    expect(page.stateOf('establishments')).toBe('error');
  });

  it('never reads the actor, the session or an idempotency key', () => {
    const code = listSourceFiles().filter((file) => file.startsWith('src/app/public-offer/'))
      .map((file) => withoutComments(readFileSync(file, 'utf8'))).join('\n');
    expect(code).not.toMatch(/ActorContext|session|Idempotency/i);
  });
});

describe('theOfferFollowsItsAuthorizedScreens (tours.html, alojamiento.html, restaurantes.html; PR #361)', () => {
  const discounted = new (class extends TourValueSource {
    override valueOf(tour: PublicTour): TourValue {
      return { baseRateCents: tour.baseRateCents, currentValueCents: tour.commercialName === 'Suaza' ? 103_920_000 : tour.baseRateCents };
    }
  })();
  const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim();

  it('draws the header and the numbered panels in Spanish', async () => {
    const page = await openPage();
    expect(text(page.host.querySelector('.crp-page-header-eyebrow'))).toBe('Catálogo de experiencias');
    expect(text(page.host.querySelector('h1'))).toBe('Tours y establecimientos asociados');
    expect(text(page.part('tours').querySelector('h2'))).toBe('01. Tours disponibles');
    expect(text(page.part('establishments').querySelector('h2'))).toBe('02. Establecimientos asociados');
    expect(text(page.part('tours').querySelector('[data-state="loading"]'))).toBe('Cargando tours…');
    expect(text(page.part('establishments').querySelector('[data-state="loading"]'))).toBe('Cargando establecimientos…');
  });

  it('uses the client page of tours.html, not the operator panels', async () => {
    const page = await openPage();
    page.tours.requests[0].fail();
    await page.settle();
    expect(page.host.querySelector('.crp-operator-panel, .crp-operator-panel-head, .crp-operator-outline')).toBeNull();
    expect(Array.from(page.host.querySelectorAll('.crp-offer-section'), (section) => section.getAttribute('data-part'))).toEqual(['tours', 'establishments']);
    expect(page.part('tours').querySelector('.crp-offer-section-head h2')).not.toBeNull();
    expect(page.part('tours').querySelector('[data-state="error"] button.crp-outline')).not.toBeNull();
  });

  it('writes the chosen date as the screens do, never as an ISO date', async () => {
    const page = await openPage();
    await page.chooseDate('2026-11-22');
    expect(text(page.part('tours').querySelector('[data-date]'))).toBe('Disponibles el 22 nov 2026');
  });

  it('draws a tour card as tours.html: name, from-value in pesos, discount tag and transport', async () => {
    const page = await openPage({ value: discounted });
    page.tours.requests[0].reply([tourNamed('Suaza', { baseRateCents: 129_900_000, transportIncluded: true }), tourNamed('Pitalito')]);
    await page.settle();
    const [suaza, pitalito] = page.cards('tours');
    expect(text(suaza.querySelector('strong'))).toBe('Suaza');
    expect(text(suaza.querySelector('.crp-tour-price'))).toBe('Antes: $1.299.000 Desde $1.039.200');
    expect(text(suaza.querySelector('.crp-tour-discount-tag'))).toBe('Con descuento');
    expect(text(suaza.querySelector('.crp-tour-transport'))).toBe('Transporte incluido');
    expect(text(pitalito.querySelector('.crp-tour-price'))).toBe('Desde $18.000');
    expect(pitalito.querySelector('.crp-tour-discount-tag')).toBeNull();
    expect(pitalito.querySelector('.crp-tour-transport')).toBeNull();
  });

  it('draws an establishment as alojamiento.html and restaurantes.html, with the contact only when it exists', async () => {
    const page = await openPage();
    page.places.requests[0].reply([
      placeNamed('Casa Neiva'), placeNamed('Sabores del Huila', { establishmentType: 'RESTAURANT', commercialInformation: '' }),
    ]);
    await page.settle();
    const [hotel, restaurant] = page.cards('establishments');
    expect(text(hotel.querySelector('strong'))).toBe('Casa Neiva');
    expect(text(hotel.querySelector('.crp-establishment-type'))).toBe('Hotel asociado');
    expect(text(hotel.querySelector('.crp-establishment-contact'))).toBe('Contacto: Contacto de Casa Neiva: 300 000 0000');
    expect(text(restaurant.querySelector('.crp-establishment-type'))).toBe('Restaurante asociado');
    expect(restaurant.querySelector('.crp-establishment-contact')).toBeNull();
    expect(text(page.part('establishments'))).toContain('Coordina directamente con el establecimiento');
  });

  it('shows no raw code, no ISO date and no booking action of HU-COM-008', async () => {
    const page = await openPage({ value: discounted });
    await page.chooseDate('2026-11-22');
    page.tours.requests[1].reply([tourNamed('Suaza', { baseRateCents: 129_900_000 })]);
    page.places.requests[0].reply([placeNamed('Casa Neiva'), placeNamed('Sabores', { establishmentType: 'RESTAURANT' })]);
    await page.settle();
    const all = page.host.textContent ?? '';
    expect(all).not.toMatch(/\bHOTEL\b|\bRESTAURANT\b|\d{4}-\d{2}-\d{2}|\d\.\d{2}(?!\d)|Reservar/);
  });
});

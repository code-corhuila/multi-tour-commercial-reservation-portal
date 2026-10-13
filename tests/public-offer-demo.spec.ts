import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { DemoPublicEstablishmentsSource, DemoPublicOfferSource, seedTransportTour } from '../src/app/demo/public-offer-demo';
import { PublicEstablishmentsSource, PublicOfferSource } from '../src/app/public-offer/data/public-offer-sources';
import { sourceProviders } from '../src/app/sources.demo';
import * as entry from '../src/mount-entry';
import { PUBLIC_OFFER_COPY } from '../src/app/public-offer/public-offer-copy';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

const toursOf = (source: DemoPublicOfferSource) => firstValueFrom(source.listAvailable('2026-11-20'));
const placesOf = (source: DemoPublicEstablishmentsSource) => firstValueFrom(source.listActive());

describe('theDemoOfferReadsTheCatalogStore (plan D-05)', () => {
  it('lists only the active tours of the store, never the inactive one or a transport service', async () => {
    const names = (await toursOf(new DemoPublicOfferSource(new DemoCatalogStore()))).map((tour) => tour.commercialName);
    expect(names).toContain('Desierto de la Tatacoa al atardecer');
    expect(names).not.toContain('Caminata al Nevado del Huila');
    expect(names).not.toContain('Traslado aeropuerto Neiva');
  });

  it('projects no cost, capacity or status (RN-PO6)', async () => {
    const [tour] = await toursOf(new DemoPublicOfferSource(new DemoCatalogStore()));
    expect(Object.keys(tour).sort()).toEqual(['available', 'baseRateCents', 'commercialName', 'serviceId', 'transportIncluded']);
  });

  it('follows the store: a tour inactivated in the catalog leaves the offer, so no data is duplicated', async () => {
    const store = new DemoCatalogStore();
    const offer = new DemoPublicOfferSource(store);
    await firstValueFrom(new DemoCatalogWriter(store).inactivate('demo-svc-1'));
    expect((await toursOf(offer)).map((tour) => tour.serviceId)).not.toContain('demo-svc-1');
  });

  it('appends one tour with transport to the store, once, so AC-PO.3 has demo evidence', async () => {
    const store = new DemoCatalogStore();
    seedTransportTour(store);
    seedTransportTour(store);
    const withTransport = (await toursOf(new DemoPublicOfferSource(store))).filter((tour) => tour.transportIncluded);
    expect(withTransport).toHaveLength(1);
    expect((await firstValueFrom(store.list())).filter((item) => item.transportRequired && item.serviceType === 'TOUR')).toHaveLength(1);
    expect(withTransport[0].commercialName).toBe('San Agustín con traslado incluido');
  });
});

describe('theDemoEstablishmentsReadTheEstablishmentsStore (plan D-05)', () => {
  it('lists only the active establishments, with their commercial information', async () => {
    const places = await placesOf(new DemoPublicEstablishmentsSource(new DemoEstablishmentsStore()));
    // The demo names gain their accents in the screen fix of HU-COM-001; the order and the set are what this story reads.
    const plain = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    expect(places.map((place) => plain(place.commercialName))).toEqual(['Hotel Casa Neiva', 'Posada del Cafe', 'Sabores del Huila', 'Fogon del Desierto']);
    expect(places.every((place) => place.active && place.commercialInformation.length > 0)).toBe(true);
  });

  it('follows the store: an inactivated association disappears from the next consultation', async () => {
    const store = new DemoEstablishmentsStore();
    await firstValueFrom(new DemoEstablishmentsWriter(store).inactivate('demo-est-1'));
    expect((await placesOf(new DemoPublicEstablishmentsSource(store))).map((place) => place.establishmentId)).not.toContain('demo-est-1');
  });
});

describe('theDemoBuildProvidesTheOfferPorts', () => {
  it('provides both ports over the same stores as the management screens', () => {
    const provided = sourceProviders({} as never) as Array<{ provide: unknown; useValue: unknown }>;
    expect(provided.find((p) => p.provide === PublicOfferSource)?.useValue).toBeInstanceOf(DemoPublicOfferSource);
    expect(provided.find((p) => p.provide === PublicEstablishmentsSource)?.useValue).toBeInstanceOf(DemoPublicEstablishmentsSource);
  });
});

describe('theShellOffersTheOfferToTheCustomer (PR #361)', () => {
  let cleanup: (() => void) | undefined;
  let host: HTMLElement;
  afterEach(() => { cleanup?.(); host.remove(); });

  it('shows the Explorar entry of the client header to an unknown role and opens the read-only view', async () => {
    host = document.createElement('div');
    document.body.append(host);
    const request = vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }));
    cleanup = entry.mountWith(host, { apiClient: { request } as never, session: { roles: ['SOMETHING_ELSE'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(Array.from(host.querySelectorAll('nav button')).some((b) => b.textContent?.trim() === 'Explorar')).toBe(true));
    Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find((b) => b.textContent?.trim() === 'Explorar')!.click();
    await vi.waitFor(() => expect(host.querySelector('h1')?.textContent).toContain(PUBLIC_OFFER_COPY.title));
  });
});

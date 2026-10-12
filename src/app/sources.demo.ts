import { Provider } from '@angular/core';
import { CatalogItemsSource, CatalogItemsWriter } from './catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from './demo/demo-sources';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './establishments/data/associated-establishments-writer';
import { PortalApiClient } from './shell-contract';
import { DemoPublicEstablishmentsSource, DemoPublicOfferSource, seedTransportTour } from './demo/public-offer-demo';
import { PublicEstablishmentsSource, PublicOfferSource } from './public-offer/data/public-offer-sources';

/** DEMO build only: in-memory data to show the portal without a backend. The client is ignored on purpose. */
export function sourceProviders(_client: PortalApiClient): Provider[] {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  seedTransportTour(catalog);
  return [
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    { provide: PublicOfferSource, useValue: new DemoPublicOfferSource(catalog) },
    { provide: PublicEstablishmentsSource, useValue: new DemoPublicEstablishmentsSource(establishments) },
  ];
}

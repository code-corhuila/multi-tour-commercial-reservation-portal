import { Provider } from '@angular/core';
import { CatalogItemsSource, CatalogItemsWriter } from './catalog/data/catalog-api.service';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './establishments/data/associated-establishments-writer';
import { CatalogApiSource, CatalogApiWriter } from './http/catalog-api-sources';
import { EstablishmentsApiSource, EstablishmentsApiWriter } from './http/establishments-api-sources';
import { PortalApiClient } from './shell-contract';

/** Default: every read and write goes through the container client. `build:module:demo` swaps this file for sources.demo.ts. */
export function sourceProviders(client: PortalApiClient): Provider[] {
  return [
    { provide: CatalogItemsSource, useValue: new CatalogApiSource(client) },
    { provide: CatalogItemsWriter, useValue: new CatalogApiWriter(client) },
    { provide: AssociatedEstablishmentsSource, useValue: new EstablishmentsApiSource(client) },
    { provide: AssociatedEstablishmentsWriter, useValue: new EstablishmentsApiWriter(client) },
  ];
}

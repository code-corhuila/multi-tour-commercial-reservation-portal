import { Provider } from '@angular/core';
import { CatalogItemsSource, CatalogItemsWriter } from './catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from './demo/demo-sources';
import { DemoDiscountRulesStore } from './demo/discounts-demo';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './establishments/data/associated-establishments-writer';
import { PortalApiClient } from './shell-contract';

/** DEMO build only: in-memory data to show the portal without a backend. The client is ignored on purpose. */
export function sourceProviders(_client: PortalApiClient): Provider[] {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  return [
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    { provide: DiscountRulesSource, useValue: new DemoDiscountRulesStore() },
  ];
}

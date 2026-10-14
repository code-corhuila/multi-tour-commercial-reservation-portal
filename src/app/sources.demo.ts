import { Provider } from '@angular/core';
import { CatalogItemsSource, CatalogItemsWriter } from './catalog/data/catalog-api.service';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter, oncePerPage } from './demo/demo-sources';
import { DemoDiscountRulesStore, DemoDiscountRulesWriter } from './demo/discounts-demo';
import { DiscountRulesWriter } from './discounts/data/discount-rules-writer';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './establishments/data/associated-establishments-writer';
import { PortalApiClient } from './shell-contract';
import { DemoPublicEstablishmentsSource, DemoPublicOfferSource, seedTransportTour } from './demo/public-offer-demo';
import { PublicEstablishmentsSource, PublicOfferSource } from './public-offer/data/public-offer-sources';
import { currentDiscountsProviders } from './demo/current-discounts-demo';
import { customersDemoProviders } from './demo/customers-demo';
import { reservationDemoProviders } from './demo/reservations-demo';
import { selfServiceDemoProviders } from './demo/self-service-reservation-demo';
import { paymentsDemoProviders } from './demo/payments-demo';
import { reservationChangesDemoProviders } from './demo/reservation-changes-demo';
import { refundsDemoProviders } from './demo/refunds-demo';
import { proofReviewDemoProviders } from './demo/proof-review-demo';
import { paymentFollowupDemoProviders } from './demo/payment-followup-demo';
import { reservationModificationDemoProviders } from './demo/reservation-modification-demo';
import { myPaymentsDemoProviders } from './demo/my-payments-demo';
import { reschedulingDemoProviders } from './demo/rescheduling-demo';
import { demoSessionProviders } from './demo/demo-fixtures';

/** DEMO build only: in-memory data to show the portal without a backend. The client is ignored on purpose. */
export function sourceProviders(_client: PortalApiClient): Provider[] {
  const stores = oncePerPage(demoStores);
  const named = demoSessionProviders();
  return named.length ? [...stores, ...named] : stores;
}

function demoStores(): Provider[] {
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  const discounts = new DemoDiscountRulesStore();
  seedTransportTour(catalog);
  return [
    { provide: CatalogItemsSource, useValue: catalog },
    { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
    { provide: AssociatedEstablishmentsSource, useValue: establishments },
    { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    { provide: DiscountRulesSource, useValue: discounts },
    { provide: DiscountRulesWriter, useValue: new DemoDiscountRulesWriter(discounts, catalog) },
    { provide: PublicOfferSource, useValue: new DemoPublicOfferSource(catalog) },
    { provide: PublicEstablishmentsSource, useValue: new DemoPublicEstablishmentsSource(establishments) },
    ...currentDiscountsProviders(),
    ...customersDemoProviders(),
    ...reservationDemoProviders(),
    ...selfServiceDemoProviders(),
    ...paymentsDemoProviders(),
    ...reservationChangesDemoProviders(),
    ...proofReviewDemoProviders(),
    ...paymentFollowupDemoProviders(),
    ...reservationModificationDemoProviders(),
    ...myPaymentsDemoProviders(),
    ...refundsDemoProviders(),
    ...reschedulingDemoProviders(),
  ];
}

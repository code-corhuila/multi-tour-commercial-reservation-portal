import { Provider, inject } from '@angular/core';
import { CustomersSource } from './customers/data/customers-source';
import { CustomersWriter } from './customers/data/customers-writer';
import { CatalogItemsSource, CatalogItemsWriter } from './catalog/data/catalog-api.service';
import { AdditionalDiscountContexts } from './current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountWriter } from './current-discounts/data/additional-discount-writer';
import { AuthorizableReasons } from './current-discounts/data/authorizable-reasons';
import { AssociatedEstablishmentsSource } from './establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './establishments/data/associated-establishments-writer';
import { AdditionalDiscountApiContexts, AdditionalDiscountApiWriter, AuthorizableReasonsApi } from './http/additional-discount-api-sources';
import { CatalogApiSource, CatalogApiWriter } from './http/catalog-api-sources';
import { CustomersApiSource, CustomersApiWriter } from './http/customers-api-sources';
import { DepartureApiCapacity, DeparturesApiSource } from './http/departures-api-source';
import { DepartureCapacity } from './reservations/data/departure-capacity';
import { DeparturesSource } from './reservations/data/departures-source';
import { ReservationQuoteApiSource } from './http/reservation-quote-api-source';
import { ReservationQuoteSource } from './reservations/data/reservation-quote-source';
import { ReservationsApiSource, ReservationsApiWriter } from './http/reservations-api-sources';
import { ReservationsSource } from './reservations/data/reservations-source';
import { ReservationsWriter } from './reservations/data/reservations-writer';
import { DiscountRulesApiSource, DiscountRulesApiWriter } from './http/discount-rules-api-sources';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { DiscountRulesWriter } from './discounts/data/discount-rules-writer';
import { EstablishmentsApiSource, EstablishmentsApiWriter } from './http/establishments-api-sources';
import { PublicEstablishmentsApiSource, PublicOfferApiSource, PublicTourValueSource } from './http/public-offer-api-sources';
import { PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from './public-offer/data/public-offer-sources';
import { PortalApiClient, TENANT_IDENTIFIER } from './shell-contract';

/** Default: every read and write goes through the container client. `build:module:demo` swaps this file for sources.demo.ts. */
export function sourceProviders(client: PortalApiClient): Provider[] {
  return [
    { provide: CatalogItemsSource, useValue: new CatalogApiSource(client) },
    { provide: CatalogItemsWriter, useValue: new CatalogApiWriter(client) },
    { provide: AssociatedEstablishmentsSource, useValue: new EstablishmentsApiSource(client) },
    { provide: AssociatedEstablishmentsWriter, useValue: new EstablishmentsApiWriter(client) },
    { provide: DiscountRulesSource, useValue: new DiscountRulesApiSource(client) },
    { provide: DiscountRulesWriter, useValue: new DiscountRulesApiWriter(client) },
    { provide: AdditionalDiscountContexts, useValue: new AdditionalDiscountApiContexts(client) },
    { provide: AdditionalDiscountWriter, useValue: new AdditionalDiscountApiWriter(client) },
    { provide: AuthorizableReasons, useValue: new AuthorizableReasonsApi(client) },
    { provide: CustomersSource, useValue: new CustomersApiSource(client) },
    { provide: CustomersWriter, useValue: new CustomersApiWriter(client) },
    // HU-COM-007: the open departures of the active tours and the seat rule over what the service says is left (PROPOSED routes).
    { provide: DeparturesSource, useValue: new DeparturesApiSource(client) },
    { provide: DepartureCapacity, useValue: new DepartureApiCapacity() },
    // HU-COM-007 (amendment 2026-10-13, RN-RC5): the value comes calculated by the service; the portal adds nothing up.
    { provide: ReservationQuoteSource, useValue: new ReservationQuoteApiSource(client) },
    { provide: ReservationsSource, useValue: new ReservationsApiSource(client) },
    { provide: ReservationsWriter, useValue: new ReservationsApiWriter(client) },
    // HU-COM-006: the public routes; the tenant is the identifier of the link the container mounted the portal with.
    { provide: PublicOfferSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new PublicOfferApiSource(client, () => tenant); } },
    { provide: PublicEstablishmentsSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new PublicEstablishmentsApiSource(client, () => tenant); } },
    // HU-COM-006 AC-PO.4: the value in force arrives calculated with each tour; HU-COM-004's pure function stays the service's.
    { provide: TourValueSource, useValue: new PublicTourValueSource() },
  ];
}

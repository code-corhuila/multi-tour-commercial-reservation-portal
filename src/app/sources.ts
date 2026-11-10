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
import { ReservationsApiWriter } from './http/reservations-api-sources';
import { ReservationsSource } from './reservations/data/reservations-source';
import { ReservationsWriter } from './reservations/data/reservations-writer';
import { DiscountRulesApiSource, DiscountRulesApiWriter } from './http/discount-rules-api-sources';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { DiscountRulesWriter } from './discounts/data/discount-rules-writer';
import { EstablishmentsApiSource, EstablishmentsApiWriter } from './http/establishments-api-sources';
import { PublicDeparturesApiSource, PublicEstablishmentsApiSource, PublicOfferApiSource, PublicTourValueSource } from './http/public-offer-api-sources';
import { PublicDeparturesSource, PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from './public-offer/data/public-offer-sources';
import { PaymentMethodsApiSource, PaymentsApiWriter, ReservationsWithPaymentsApiSource } from './http/payments-api-sources';
import { PendingProofsApiSource, ProofReviewApiWriter } from './http/proof-review-api-sources';
import { PendingProofsSource, ProofReviewWriter } from './payments/data/proof-review-ports';
import { PaymentParametersApiSource, PaymentParametersApiWriter } from './http/payment-parameters-api-sources';
import { PaymentParametersSource, PaymentParametersWriter } from './payment-parameters/data/payment-parameters-ports';
import { PaymentsWriter } from './payments/data/payments-writer';
import { PaymentMethodsSource } from './self-service-reservation/data/reservation-confirmation-ports';
import { MyReservationsApiSource, ReservationRequesterApi, SelectionQuoteApiSource } from './http/self-service-api-sources';
import { MyReservationsSource } from './self-service-reservation/data/my-reservations-source';
import { ReservationRequester, SelectionQuoteSource } from './self-service-reservation/data/reservation-confirmation-ports';
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
    { provide: ReservationsSource, useValue: new ReservationsWithPaymentsApiSource(client) },
    { provide: ReservationsWriter, useValue: new ReservationsApiWriter(client) },
    // HU-COM-008: the customer's panel, the summary of a selection and the creation, over the routes of HU-COM-007 (the service filters by the token).
    { provide: MyReservationsSource, useValue: new MyReservationsApiSource(client) },
    { provide: SelectionQuoteSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new SelectionQuoteApiSource(client, () => tenant); } },
    { provide: ReservationRequester, useValue: new ReservationRequesterApi(client) },
    // HU-COM-009: the enabled types and methods, and the payment register (multipart for a transfer, JSON for cash).
    { provide: PaymentMethodsSource, useValue: new PaymentMethodsApiSource(client) },
    { provide: PaymentsWriter, useValue: new PaymentsApiWriter(client) },
    // HU-COM-010: the panel of proofs and the decision (approve or reject) over the proof routes.
    { provide: PendingProofsSource, useValue: new PendingProofsApiSource(client) },
    { provide: ProofReviewWriter, useValue: new ProofReviewApiWriter(client) },
    // HU-COM-009: the payment parameters (the Administrator's screen) and the minimum deposit of a reservation.
    { provide: PaymentParametersSource, useValue: new PaymentParametersApiSource(client) },
    { provide: PaymentParametersWriter, useValue: new PaymentParametersApiWriter(client) },
    // HU-COM-006: the public routes; the tenant is the identifier of the link the container mounted the portal with.
    { provide: PublicOfferSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new PublicOfferApiSource(client, () => tenant); } },
    { provide: PublicEstablishmentsSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new PublicEstablishmentsApiSource(client, () => tenant); } },
    // HU-COM-006 portal spec A.6b: a visitor's departures come from the public tour detail, not from the authenticated reader above.
    { provide: PublicDeparturesSource, useFactory: () => { const tenant = inject(TENANT_IDENTIFIER); return new PublicDeparturesApiSource(client, () => tenant); } },
    // HU-COM-006 AC-PO.4: the value in force arrives calculated with each tour; HU-COM-004's pure function stays the service's.
    { provide: TourValueSource, useValue: new PublicTourValueSource() },
  ];
}

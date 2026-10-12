import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CustomerReservation, PaymentMethod, ReservationSelection, SelectionQuote, selectionFromQuery } from '../model/self-service-reservation';

/** DP-RS1: the selection is read from the URL the container mounted the portal on. */
@Injectable({ providedIn: 'root', useFactory: () => new UrlSelection() })
export abstract class ReservationSelectionSource {
  abstract current(): ReservationSelection | null;
}

class UrlSelection extends ReservationSelectionSource {
  override current(): ReservationSelection | null { return selectionFromQuery(globalThis.location?.search ?? ''); }
}

/** The methods the tenant enabled (AC-RS.4). */
export abstract class PaymentMethodsSource {
  abstract listEnabled(): Observable<readonly PaymentMethod[]>;
}

/**
 * PENDING INTEGRATION (G-DEP): adapted to the creation port and calculation of HU-COM-007 once they are
 * in develop, never copied (plan D-03). The service computes the values and checks the capacity (RN-RS6);
 * a refusal arrives as an ApiError of shell-contract.ts. The key is reused while the same intention is retried.
 */
export abstract class ReservationRequester {
  abstract request(selection: ReservationSelection, paymentMethod: string, idempotencyKey: string): Observable<CustomerReservation>;
}

/** PENDING INTEGRATION (G-DEP): the summary and values of the selection, from the calculation of HU-COM-007 (RN-RS4). */
export abstract class SelectionQuoteSource {
  abstract quote(selection: ReservationSelection): Observable<SelectionQuote>;
}

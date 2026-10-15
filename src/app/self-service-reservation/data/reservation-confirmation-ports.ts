import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { CustomerReservation, PaymentMethod, ReservationSelection, SelectionQuote, selectionFromParams } from '../model/self-service-reservation';

/**
 * DP-RS1, 008- H-D10: the selection the container handed over when it mounted the portal (MountProps.initialParams,
 * PROPUESTO for ADR-007). The portal never reads the address: without parameters there is no selection.
 */
@Injectable({ providedIn: 'root', useFactory: () => selectionSourceFor(undefined) })
export abstract class ReservationSelectionSource {
  abstract current(): ReservationSelection | null;
}

/** DP-RS1: the selection Reservar tour opened the area with, else the one the portal was mounted with. */
export function injectSelection(): ReservationSelection | null {
  return selectionFromParams(inject(PortalNavigation, { optional: true })?.params() ?? {}) ?? inject(ReservationSelectionSource).current();
}

export function selectionSourceFor(params: Readonly<Record<string, string>> | undefined): ReservationSelectionSource {
  const selection = params ? selectionFromParams(params) : null;
  return new (class extends ReservationSelectionSource { override current() { return selection; } })();
}

/** What HU-COM-009 reads through this port instead of the model of 008-. */
export type { CustomerReservation, SelectionQuote } from '../model/self-service-reservation';
export { reservationState } from '../model/self-service-reservation';
/** HU-COM-009 "Datos bancarios" of 24 (DP-PY4: who configures them is NO DEFINIDO). */
export type BankAccount = { readonly bank: string; readonly accountType: string; readonly accountNumber: string; readonly holder: string };

/** The methods the tenant enabled (AC-RS.4); HU-COM-009 widens it with the enabled types and the bank data (plan D-03, DP-PY4). */
export abstract class PaymentMethodsSource {
  abstract listEnabled(): Observable<readonly PaymentMethod[]>;
  /** Pago total, Abono. */
  abstract listTypes(): Observable<readonly PaymentMethod[]>;
  abstract bankAccount(): Observable<BankAccount>;
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

import { InjectionToken, Type } from '@angular/core';
import { Observable } from 'rxjs';

/** The key of admin-cancelar-modificar-reserva.html, opened from 10A with { reservation }; a sub-screen of Reservas. */
export const RESERVATION_CHANGE_SCREEN = 'reservation-change';

/** What "Registrar novedad" sends for the selected type; the key is created when the screen opens and reused on retry. */
export interface ReservationChangeInput { readonly reservationCode: string; readonly cause: string; readonly idempotencyKey: string }
/** Registered, or refused with the Spanish reason the screen shows. */
export type ReservationChangeOutcome = { readonly kind: 'registered' } | { readonly kind: 'refused'; readonly reason: string };

/** One option of Tipo. `form` draws the extra fields of the type (input: reservation). */
export interface ReservationChangeType {
  readonly key: string;
  readonly label: string;
  readonly form?: Type<unknown>;
  /** False keeps "Registrar novedad" disabled for this type (HU-COM-012 AC-MD.9); absent means it can be sent. */
  readonly submittable?: boolean;
  /** False hides the cancellation "Valor potencial a devolver" row; Devolución keeps the title and note of the mockup. */
  readonly showsRefundable?: boolean;
  submit(input: ReservationChangeInput): Observable<ReservationChangeOutcome>;
}

/**
 * Plan D-08, the only file other stories import from this feature: HU-COM-013 provides "Cancelación";
 * HU-COM-012 adds "Modificación de viajeros" from its own providers, never importing the page.
 */
export const RESERVATION_CHANGE_TYPES = new InjectionToken<readonly ReservationChangeType[]>('RESERVATION_CHANGE_TYPES');

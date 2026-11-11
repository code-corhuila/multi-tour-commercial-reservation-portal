import { Provider } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { Reservation } from '../../../reservations/data/reservations-source';
import { RESERVATION_CHANGE_TYPES, ReservationChangeType } from '../../data/reservation-change-types';
import { TravellersModificationFormComponent } from '../components/travellers-modification-form.component';
import { TRAVELLERS_MODIFICATION_COPY } from '../travellers-modification-copy';

export const TRAVELLERS_MODIFICATION_KEY = 'travellers-modification';

/** RN-MD4: allowed, or refused by state (before execution only) or by the tour policy (DP-MD2). */
export type Admission = { readonly kind: 'allowed' } | { readonly kind: 'refused'; readonly reason: 'not-allowed' | 'not-before-execution' };
/** Travellers added and removed; named companions wait for DP-MD5 and the public port of HU-COM-005 (plan D-06). */
export interface TravellersChange { readonly added: number; readonly removed: number }
/** Plan D-04, already resolved by the service: the new quote, the balance and the difference or excess. */
export interface Recalculation {
  readonly quote: Reservation['quote']; readonly balanceCents: number; readonly differenceCents: number; readonly excessCents: number;
}
/** RN-MD8 (AC-MD.6); RN-MD6: the excess opens "Excedente por modificación" (06-data decisionKind), never refunded here. */
export interface ModificationTrace {
  readonly reservationCode: string; readonly originalCents: number; readonly recalculatedCents: number; readonly balanceCents: number;
  readonly differenceCents: number; readonly cause: string; readonly by: string; readonly at: string;
  readonly decision: { readonly kind: 'MODIFICATION_EXCESS'; readonly excessCents: number; readonly outcome: null } | null;
}

/** Plan D-03: whether the reservation admits the change, and the recalculation; null when the reservation is unknown. */
export abstract class ModificationQuote {
  abstract admits(code: string): Observable<Admission | null>;
  abstract preview(code: string, change: TravellersChange): Observable<Recalculation | null>;
}

/** RN-MD3 (DP-MD3): the per-person transport fare; the rule is NO DEFINIDO, the demo answers a seeded fare. */
export abstract class TransportFareSource {
  abstract perPerson(reservation: Reservation): number;
}

export interface ModifyCommand { readonly code: string; readonly change: TravellersChange; readonly cause: string; readonly idempotencyKey: string }
export type ModificationOutcome = { readonly kind: 'modified'; readonly reservation: Reservation; readonly trace: ModificationTrace }
  | { readonly kind: 'refused'; readonly reason: 'not-allowed' | 'not-before-execution' | 'no-capacity' };

/** Plan D-05: one modification per Idempotency-Key; the service is the authority (gap G-B: no path yet). */
export abstract class ReservationModificationWriter {
  abstract modify(command: ModifyCommand): Observable<ModificationOutcome>;
}

/** Plan D-01, D-06: the "Modificación de viajeros" entry of Tipo. Not submittable until DP-MD5 gives it fields, so the page never sends it. */
export function travellersModificationType(): ReservationChangeType {
  return {
    key: TRAVELLERS_MODIFICATION_KEY, label: TRAVELLERS_MODIFICATION_COPY.label, form: TravellersModificationFormComponent, submittable: false, showsRefundable: false,
    submit: () => throwError(() => new Error('DP-MD5: the travellers modification has no fields to send yet')),
  };
}

/** Registered once in mount-entry, next to the "Cancelación" entry of HU-COM-013. */
export function provideTravellersModification(): Provider {
  return { provide: RESERVATION_CHANGE_TYPES, multi: true, useFactory: travellersModificationType };
}

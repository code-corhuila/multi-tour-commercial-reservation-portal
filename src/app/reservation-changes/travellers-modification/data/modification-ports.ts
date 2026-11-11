import { Provider, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { Reservation } from '../../../reservations/data/reservations-source';
import { RESERVATION_CHANGE_TYPES, ReservationChangeOutcome, ReservationChangeType } from '../../data/reservation-change-types';
import { TravellersModificationFormComponent } from '../components/travellers-modification-form.component';
import { TRAVELLERS_MODIFICATION_COPY } from '../travellers-modification-copy';
import { ModificationDraft } from './modification-draft';

export const TRAVELLERS_MODIFICATION_KEY = 'travellers-modification';

/** RN-MD4: allowed, or refused by state (before execution only) or by the tour policy (DP-MD2). */
export type Admission = { readonly kind: 'allowed' } | { readonly kind: 'refused'; readonly reason: 'not-allowed' | 'not-before-execution' };
/** Travellers added and removed; named companions wait for DP-MD5 and the public port of HU-COM-005 (plan D-06). */
export interface TravellersChange { readonly added: number; readonly removed: number }
/** Plan D-04, already resolved by the service: the new quote, the balance and the difference or excess. */
export interface Recalculation {
  readonly quote: Reservation['quote']; readonly balanceCents: number; readonly differenceCents: number; readonly excessCents: number;
}
/**
 * What the screen draws under the fields (mockup "Valor proyectado", "Descuentos", "Valor final", "Saldo pendiente"), already resolved by the service.
 * The projected value and the discounts are null when the service answers only the totals; the view never fills them in.
 */
export interface ModificationLines {
  readonly allowed: boolean; readonly projectedCents: number | null; readonly discountCents: number | null; readonly finalCents: number;
  readonly balanceCents: number; readonly differenceCents: number; readonly excessCents: number; readonly seatsAvailable: boolean;
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
  /** The lines of the change, null when the reservation is unknown (AC-MD.1, AC-MD.3, AC-MD.5). */
  abstract lines(code: string, change: TravellersChange): Observable<ModificationLines | null>;
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

/**
 * Plan D-01, D-09: the "Modificación de servicio, salida o viajeros" entry of Tipo. It can be sent once the panel holds a valid count that differs from the
 * reservation; the cause and the key come from the page, the travellers from the draft. The key is joined to the count: another count is another request.
 */
export function travellersModificationType(writer: ReservationModificationWriter | null, draft: ModificationDraft): ReservationChangeType {
  const t = TRAVELLERS_MODIFICATION_COPY;
  return {
    key: TRAVELLERS_MODIFICATION_KEY, label: t.label, form: TravellersModificationFormComponent, showsRefundable: false,
    get submittable() { return draft.change() !== null; },
    submit: (input) => {
      const change = draft.change();
      if (!writer || !change) return throwError(() => new Error('No modification to register'));
      return writer.modify({ code: input.reservationCode, change, cause: input.cause, idempotencyKey: `${input.idempotencyKey}:${draft.people()}` }).pipe(
        map((outcome): ReservationChangeOutcome => (outcome.kind === 'modified'
          ? { kind: 'registered', message: t.registered(outcome.trace.decision?.excessCents ?? 0) }
          : { kind: 'refused', reason: outcome.reason === 'no-capacity' ? t.noSeats : t.refused[outcome.reason] })));
    },
  };
}

/** Registered once in mount-entry, next to the "Cancelación" entry of HU-COM-013. */
export function provideTravellersModification(): Provider {
  return { provide: RESERVATION_CHANGE_TYPES, multi: true,
    useFactory: () => travellersModificationType(inject(ReservationModificationWriter, { optional: true }), inject(ModificationDraft)) };
}

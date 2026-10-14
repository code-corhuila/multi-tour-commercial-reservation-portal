import { Observable } from 'rxjs';

/** A departure the episode can move to, its free seats already resolved behind the port (RN-RP2). */
export interface ProposedDeparture { readonly id: string; readonly tourName: string; readonly startsAt: string; readonly freeSeats: number }
/** RN-RP4 (FINAL-011): the instants of the episode from its origin, and the hours left at the port's clock. Shown, never applied (DD-3). */
export interface EpisodeDeadlines { readonly proposeBy: string; readonly respondBy: string | null; readonly episodeEndsAt: string; readonly remainingHours: number }
export type EpisodeAnswer = 'ACCEPTED' | 'REJECTED' | 'NO_ALTERNATIVE';
/** One rescheduling episode as the screens read it; field names follow rescheduling_records (G-B). The view only formats. */
export interface ReschedulingEpisodeView {
  readonly reservationId: string; readonly tourName: string; readonly people: number;
  /** The reservation_status code of HU-COM-007, never shown raw. */
  readonly status: string;
  readonly original: { readonly tourName: string; readonly startsAt: string };
  readonly proposal: ProposedDeparture | null;
  readonly answer: EpisodeAnswer | null;
  readonly deadlines: EpisodeDeadlines;
  readonly options: readonly ProposedDeparture[];
  /** AC-RP.7: 100 % of the validated values, determined on cancelling; HU-COM-016 executes it. */
  readonly refundCents: number | null;
}
export type ReschedulingRefusal = 'proof-in-validation' | 'no-seats' | 'already-answered' | 'closed';
export type ReschedulingOutcome = { readonly kind: 'done'; readonly episode: ReschedulingEpisodeView }
  | { readonly kind: 'refused'; readonly reason: ReschedulingRefusal };
/** Plan D-03: the episode of a reservation, null when it has none. */
export abstract class ReschedulingSource {
  abstract episode(code: string): Observable<ReschedulingEpisodeView | null>;
}
/** Plan D-03, D-05: one proposal or one cancellation per Idempotency-Key; the service re-checks and is the authority (G-B: no path yet). */
export abstract class ReschedulingWriter {
  abstract propose(command: { readonly code: string; readonly departureId: string; readonly idempotencyKey: string }): Observable<ReschedulingOutcome>;
  abstract cancelWithFullRefund(command: { readonly code: string; readonly idempotencyKey: string }): Observable<ReschedulingOutcome>;
}
/** Plan D-03: the deadlines of FINAL-011 from the origin, the proposal and the clock; never Date.now() in a view. */
export abstract class ReschedulingDeadlines {
  abstract resolve(originAt: string, proposal: { readonly sentAt: string; readonly startsAt: string } | null): EpisodeDeadlines;
}
/** admin-reprogramar-reserva.html: entered from the 10A header (DP-RP4, owner decision); opened with PortalNavigation.open(RESCHEDULING_AREA, { reservation }). */
export const RESCHEDULING_AREA = 'rescheduling';

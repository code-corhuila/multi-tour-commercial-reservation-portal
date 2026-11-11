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
  readonly history?: readonly EpisodeHistoryEntry[];
  /** 24A: when the proposal was notified and the three instants the response deadline is the lowest of (FINAL-011), resolved by the port and written as the tenant does. */
  readonly notice?: { readonly notifiedAt: string; readonly windowEndsAt: string; readonly episodeEndsAt: string; readonly startsAt: string; readonly dueAt: string };
  /** The list of episodes (AC-RP.12): the customer, the origin departure and the next clock the port resolved, in hours (never computed by the view). */
  readonly customer?: string; readonly originalDepartureId?: string;
  readonly dueIn?: { readonly kind: 'propose' | 'respond'; readonly hours: number } | null;
}
/** The narrowing of the list: one reservation or one departure (the entry of Salidas, domain 03). */
export interface EpisodeFilter { readonly reservation?: string; readonly departure?: string }
export type ReschedulingRefusal = 'proof-in-validation' | 'no-seats' | 'already-answered' | 'closed' | 'no-channel' | 'no-evidence' | 'bad-time' | 'after-deadline';
/** One row of the history of an episode (AC-RP.13): who, what and the channel when it came from outside; the evidence is never part of it (AC-18.19). */
export interface EpisodeHistoryEntry { readonly at: string; readonly actor: string; readonly action: string; readonly detail: string }
export type ReschedulingOutcome = { readonly kind: 'done'; readonly episode: ReschedulingEpisodeView }
  | { readonly kind: 'refused'; readonly reason: ReschedulingRefusal };
/** Plan D-03: the episode of a reservation, null when it has none. */
export abstract class ReschedulingSource {
  abstract episode(code: string): Observable<ReschedulingEpisodeView | null>;
  abstract list(filter: EpisodeFilter): Observable<readonly ReschedulingEpisodeView[]>;
}
/** Plan D-03, D-05: one proposal or one cancellation per Idempotency-Key; the service re-checks and is the authority (G-B: no path yet). */
export abstract class ReschedulingWriter {
  abstract propose(command: { readonly code: string; readonly departureId: string; readonly idempotencyKey: string }): Observable<ReschedulingOutcome>;
  abstract cancelWithFullRefund(command: { readonly code: string; readonly idempotencyKey: string }): Observable<ReschedulingOutcome>;
}
/** Plan D-03: the deadlines of FINAL-011 from the origin, the proposal and the clock; never Date.now() in a view. */
export abstract class ReschedulingDeadlines {
  abstract resolve(originAt: string, proposal: { readonly sentAt: string; readonly startsAt: string } | null): EpisodeDeadlines;
  /** Whole hours from the port's clock to an instant, never below zero. */
  abstract hoursUntil(at: string): number;
}
/** admin-reprogramar-reserva.html: entered from the 10A header (DP-RP4, owner decision); opened with PortalNavigation.open(RESCHEDULING_AREA, { reservation }). */
export const RESCHEDULING_AREA = 'rescheduling';

/** The customer's own episodes with a proposal (RN-M-13): the service decides whose they are; the portal sends no customer. */
export abstract class MyProposalsSource {
  abstract mine(): Observable<readonly ReschedulingEpisodeView[]>;
}

/** GAP-008: accept or reject is the whole answer, recorded once per Idempotency-Key (RN-RP5). */
export abstract class ProposalAnswerWriter {
  abstract answer(command: { readonly code: string; readonly decision: 'ACCEPTED' | 'REJECTED'; readonly idempotencyKey: string }): Observable<ReschedulingOutcome>;
}

/** 24A (propuesta-reprogramacion.html), opened with PortalNavigation.open(PROPOSAL_AREA, { reservation }). */
export const PROPOSAL_AREA = 'rescheduling-proposal';

/** The four channels of an answer received outside the portal (the contract's codes). */
export const EXTERNAL_CHANNELS = ['EMAIL', 'PHONE', 'WHATSAPP', 'IN_PERSON'] as const;
export interface ExternalAnswerCommand {
  readonly code: string; readonly decision: 'ACCEPTED' | 'REJECTED'; readonly channel: string; readonly evidence: string; readonly answeredAt: string; readonly idempotencyKey: string;
}
/** AC-RP.6: staff records the answer a customer gave by an outside channel; the service checks channel, evidence (1 to 500), time and deadline, and stamps the person. */
export abstract class ExternalAnswerWriter {
  abstract record(command: ExternalAnswerCommand): Observable<ReschedulingOutcome>;
}

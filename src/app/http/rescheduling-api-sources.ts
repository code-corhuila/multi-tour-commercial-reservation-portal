import { Observable, forkJoin, map } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import type { Departure, Reservation } from '../reservations/model/reservation';
import { EpisodeAnswer, EpisodeFilter, MyProposalsSource, ProposedDeparture, ReschedulingEpisodeView, ReschedulingSource } from '../rescheduling/data/rescheduling-ports';
import { CHANNEL_LABEL } from '../rescheduling/rescheduling-copy';
import { PortalApiClient } from '../shell-contract';
import { API_BASE, listAll } from './api-paths';

/** Rescheduling of the contract (HU-COM-018, ReschedulingResponse): the episode, its proposals and its history. The history is not read here (it carries codes, never the evidence, AC-18.19). */
export interface ProposalDto {
  readonly proposalId: string; readonly proposedDepartureId: string; readonly state: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'VOID' | 'EXPIRED';
  readonly notifiedAt: string; readonly responseDeadlineAt: string; readonly heldSeats: number;
}
export interface ReschedulingDto {
  readonly reschedulingId: string; readonly reservationId: string; readonly originalDepartureId: string;
  readonly state: 'OPEN' | 'RESCHEDULED' | 'CANCELLED'; readonly closingReason?: string;
  readonly proposalDeadlineAt: string; readonly episodeLimitAt: string; readonly frozen: boolean; readonly proposals: readonly ProposalDto[];
  readonly history?: readonly { readonly at: string; readonly actor?: string; readonly action: string; readonly detail?: string }[];
}
export const reschedulingsPath = `${API_BASE}/reschedulings`;
const HOUR = 3_600_000;
const hoursUntil = (at: string, now: number): number => Math.max(0, Math.floor((Date.parse(at) - now) / HOUR));

/** The proposal the screens show: the pending one, else the last one answered (a voided or expired proposal is history). */
export const shownProposal = (e: ReschedulingDto): ProposalDto | undefined =>
  [...e.proposals].reverse().find((p) => p.state === 'PENDING' || p.state === 'ACCEPTED' || p.state === 'REJECTED');

const answerOf = (e: ReschedulingDto, p: ProposalDto | undefined): EpisodeAnswer | null =>
  e.closingReason === 'NO_ALTERNATIVE' ? 'NO_ALTERNATIVE' : p?.state === 'ACCEPTED' ? 'ACCEPTED' : p?.state === 'REJECTED' ? 'REJECTED' : null;

/** The history of the service: codes for the action and the channel (never the evidence, AC-18.19), written in the words of the screens. */
const ACTION: Record<string, string> = { EPISODE_OPENED: 'Episodio abierto', PROPOSAL_SENT: 'Propuesta enviada', PROPOSAL_ACCEPTED: 'Propuesta aceptada', PROPOSAL_REJECTED: 'Propuesta rechazada',
  PROPOSAL_VOID: 'Propuesta sin efecto', PROPOSAL_EXPIRED: 'Propuesta vencida', EPISODE_RESCHEDULED: 'Reprogramación aceptada', EPISODE_CANCELLED: 'Episodio cancelado' };
function historyOf(e: ReschedulingDto): ReschedulingEpisodeView['history'] {
  return (e.history ?? []).map((h) => { const [source, channel] = (h.detail ?? '').split(':');
    return { at: h.at, actor: h.actor ? 'Usuario' : 'Sistema', action: ACTION[h.action] ?? h.action, detail: channel ? `Canal: ${CHANNEL_LABEL[channel] ?? channel}` : source === 'CUSTOMER' ? 'Respuesta del cliente' : '' }; });
}

/** Everything the screens need that the episode does not carry (tour, travellers, departures) is joined from the reservation and the open departures. */
export function viewOf(e: ReschedulingDto, reservation: Reservation, departures: readonly Departure[], now: number): ReschedulingEpisodeView {
  const proposal = shownProposal(e), as = (d: Departure): ProposedDeparture => ({ id: d.id, tourName: d.tourName, startsAt: d.date, freeSeats: d.effectiveCapacity });
  const proposed = proposal && departures.find((d) => d.id === proposal.proposedDepartureId);
  const original = departures.find((d) => d.id === e.originalDepartureId);
  const answer = answerOf(e, proposal);
  return {
    reservationId: reservation.id, tourName: reservation.tourName, people: reservation.people, status: reservation.status, customer: reservation.leadCustomerName, originalDepartureId: e.originalDepartureId,
    dueIn: answer ? null : proposal ? { kind: 'respond', hours: hoursUntil(proposal.responseDeadlineAt, now) } : { kind: 'propose', hours: hoursUntil(e.proposalDeadlineAt, now) },
    original: { tourName: original?.tourName ?? reservation.tourName, startsAt: original?.date ?? reservation.departureDate },
    proposal: proposal ? { id: proposal.proposedDepartureId, tourName: proposed?.tourName ?? reservation.tourName, startsAt: proposed?.date ?? '', freeSeats: proposed?.effectiveCapacity ?? 0 } : null,
    answer,
    deadlines: { proposeBy: e.proposalDeadlineAt, respondBy: proposal?.responseDeadlineAt ?? null, episodeEndsAt: e.episodeLimitAt,
      remainingHours: hoursUntil(e.episodeLimitAt, now) },
    options: departures.filter((d) => d.tourName === reservation.tourName && d.id !== e.originalDepartureId).map(as),
    // AC-RP.7: the 100 % of the validated values a closed episode leaves; HU-COM-016 decides and executes it. Read from the reservation, never computed.
    history: historyOf(e),
    refundCents: e.state === 'CANCELLED' ? reservation.validatedCents ?? 0 : null,
  };
}

/** The episode of a reservation over GET /reschedulings?reservationId= (the service decides who may read it); the latest one, null when there is none. */
export class ReschedulingApiSource extends ReschedulingSource {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource, private readonly departures: DeparturesSource,
    private readonly now: () => number = Date.now) { super(); }

  override episode(code: string): Observable<ReschedulingEpisodeView | null> {
    return forkJoin([listAll<ReschedulingDto>(this.client, reschedulingsPath, { reservationId: code }), this.reservations.list(), this.departures.list()]).pipe(map(([found, all, open]) => {
      const reservation = all.find((r) => r.id === code), latest = found.at(-1);
      return latest && reservation ? viewOf(latest, reservation, open, this.now()) : null;
    }));
  }

  /** The list of the operator over GET /reschedulings narrowed by the service (reservationId, departureId); the customer name comes from the reservation. */
  override list({ reservation, departure }: EpisodeFilter): Observable<readonly ReschedulingEpisodeView[]> {
    return forkJoin([listAll<ReschedulingDto>(this.client, reschedulingsPath, { reservationId: reservation, departureId: departure }), this.reservations.list(), this.departures.list()]).pipe(map(([found, all, open]) =>
      found.flatMap((e) => { const r = all.find((x) => x.id === e.reservationId); return r ? [viewOf(e, r, open, this.now())] : []; })));
  }
}

/** The customer's own episodes with a proposal over GET /reschedulings (the service answers only the customer's own, AC-18.16); one closed with no alternative is not one to answer. */
export class MyProposalsApiSource extends MyProposalsSource {
  constructor(private readonly client: PortalApiClient, private readonly reservations: ReservationsSource, private readonly departures: DeparturesSource,
    private readonly now: () => number = Date.now) { super(); }

  override mine(): Observable<readonly ReschedulingEpisodeView[]> {
    return forkJoin([listAll<ReschedulingDto>(this.client, reschedulingsPath), this.reservations.list(), this.departures.list()]).pipe(map(([found, all, open]) =>
      found.filter((e) => shownProposal(e) && e.closingReason !== 'NO_ALTERNATIVE').flatMap((e) => {
        const reservation = all.find((r) => r.id === e.reservationId);
        return reservation ? [viewOf(e, reservation, open, this.now())] : [];
      })));
  }
}

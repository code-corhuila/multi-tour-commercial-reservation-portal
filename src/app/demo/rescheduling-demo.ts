import { Provider } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import {
  EpisodeAnswer, EpisodeDeadlines, MyProposalsSource, ProposalAnswerWriter, ProposedDeparture, ReschedulingDeadlines, ReschedulingEpisodeView, ReschedulingOutcome,
  ReschedulingSource, ReschedulingWriter,
} from '../rescheduling/data/rescheduling-ports';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { MyReservationsSource } from '../self-service-reservation/data/my-reservations-source';
import type { Departure, Reservation } from '../reservations/model/reservation';
import type { DemoDeparturesStore, DemoReservationsStore } from './reservations-demo';
// DEMO (spec 018- DD-1, plan D-02): the episode lives on the reservation of the one store of HU-COM-007, so the operator and
// the customer read the same proposal; the refund is left there for HU-COM-016. Deadlines are shown, never applied (DD-3).
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
/** FINAL-011: L1 = origin + 24 h; response = lowest of sent + 72 h, origin + 96 h and the proposed start; episode = origin + 96 h. */
export class DemoReschedulingDeadlines extends ReschedulingDeadlines {
  constructor(private readonly clock: Clock) { super(); }
  override resolve(originAt: string, proposal: { readonly sentAt: string; readonly startsAt: string } | null): EpisodeDeadlines {
    const origin = Date.parse(originAt), end = origin + 96 * HOUR;
    const respondBy = proposal ? Math.min(Date.parse(proposal.sentAt) + 72 * HOUR, end, Date.parse(proposal.startsAt)) : null;
    return { proposeBy: iso(origin + 24 * HOUR), respondBy: respondBy === null ? null : iso(respondBy), episodeEndsAt: iso(end),
      remainingHours: Math.max(0, Math.floor((end - Date.parse(this.clock.now())) / HOUR)) };
  }
}
/** The episodes over the shared stores; the writers below change them in one store update each. */
export class DemoReschedulingSource extends ReschedulingSource {
  constructor(readonly store: DemoReservationsStore, readonly departures: DemoDeparturesStore, private readonly deadlines: ReschedulingDeadlines) { super(); }
  override episode(code: string): Observable<ReschedulingEpisodeView | null> { const r = this.find(code); return of(r?.reschedulingEpisode ? this.view(r) : null); }
  find(code: string): Reservation | undefined { return this.store.items.find((r) => r.id === code); }
  departure(id: string): Departure | undefined { return this.departures.items.find((d) => d.id === id); }
  /** RN-RP2: capacity minus the seats of the reservations on the departure and the seats held by open proposals to it. */
  freeSeats(d: Departure): number {
    const used = this.store.items.reduce((n, r) => {
      const e = r.reschedulingEpisode, held = e?.proposal?.departureId === d.id && !e.answer ? e.proposal.heldSeats : 0;
      return n + held + (r.seatHeld && r.departureId === d.id ? r.people : 0);
    }, 0);
    return Math.max(0, d.effectiveCapacity - used);
  }
  view(r: Reservation): ReschedulingEpisodeView {
    const e = r.reschedulingEpisode!, origin = this.departure(e.originDepartureId), proposed = e.proposal && this.departure(e.proposal.departureId);
    const as = (d: Departure): ProposedDeparture => ({ id: d.id, tourName: d.tourName, startsAt: d.date, freeSeats: this.freeSeats(d) });
    return {
      reservationId: r.id, tourName: r.tourName, people: r.people, status: r.status,
      original: { tourName: origin?.tourName ?? r.tourName, startsAt: origin?.date ?? r.departureDate },
      proposal: proposed ? as(proposed) : null, answer: e.answer?.decision ?? null,
      deadlines: this.deadlines.resolve(e.originAt, e.proposal && proposed ? { sentAt: e.proposal.sentAt, startsAt: proposed.date } : null),
      options: this.departures.items.filter((d) => d.state === 'PROGRAMADA' && d.tourName === r.tourName && d.id !== e.originDepartureId).map(as),
      refundCents: r.financialDecision?.origin === 'HU-COM-018' ? r.financialDecision.refundableCents : null,
    };
  }
  save(next: Reservation): ReschedulingOutcome { this.store.items = this.store.items.map((r) => (r.id === next.id ? next : r)); return { kind: 'done', episode: this.view(next) }; }
  /** RN-RP6: Cancelada, the hold released and 100 % of the validated values determined with origin HU-COM-018 (AC-RP.7). */
  close(r: Reservation, decision: EpisodeAnswer, by: string, at: string, cause: string): ReschedulingOutcome {
    const validated = r.validatedCents ?? 0;
    return this.save({ ...r, status: 'CANCELADA', seatHeld: false, reschedulingPending: false, cancellation: { cause, by, at },
      reschedulingEpisode: { ...r.reschedulingEpisode!, answer: { decision, at, by } },
      financialDecision: { kind: 'RESCHEDULING_NOT_ACCEPTED', origin: 'HU-COM-018', baseAmountCents: validated, penaltyAmountCents: 0, refundableCents: validated,
        recognizedAt: at, outcome: null } });
  }
}
const refused = (reason: Extract<ReschedulingOutcome, { kind: 'refused' }>['reason']): ReschedulingOutcome => ({ kind: 'refused', reason });
export const proofInValidation = (r: Reservation) => (r.payments ?? []).some((p) => p.proofStatus === 'EN_VALIDACION');
/** One done outcome per Idempotency-Key: a retry or a double click records nothing more (norm 5.3.8). */
export function once(byKey: Map<string, ReschedulingOutcome>, key: string, act: () => ReschedulingOutcome): Observable<ReschedulingOutcome> {
  const outcome = byKey.get(key) ?? act();
  if (outcome.kind === 'done') byKey.set(key, outcome);
  return of(outcome);
}
/** Plan D-05, in order: proof En validación, an answer already recorded, then the seats of the proposed departure. */
export class DemoReschedulingWriter extends ReschedulingWriter {
  constructor(private readonly source: DemoReschedulingSource, private readonly clock: Clock, private readonly by: string,
    private readonly byKey = new Map<string, ReschedulingOutcome>()) { super(); }
  override propose({ code, departureId, idempotencyKey }: { code: string; departureId: string; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return once(this.byKey, idempotencyKey, () => {
      const r = this.source.find(code), e = r?.reschedulingEpisode, d = this.source.departure(departureId);
      if (!r || !e) return refused('closed');
      if (proofInValidation(r)) return refused('proof-in-validation');
      if (e.answer) return refused('already-answered');
      const own = e.proposal?.departureId === departureId ? e.proposal.heldSeats : 0;
      if (!d || d.state !== 'PROGRAMADA' || this.source.freeSeats(d) + own < r.people) return refused('no-seats');
      return this.source.save({ ...r, reschedulingPending: true,
        reschedulingEpisode: { ...e, proposal: { departureId, sentAt: this.clock.now(), heldSeats: r.people } } });
    });
  }
  override cancelWithFullRefund({ code, idempotencyKey }: { code: string; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return once(this.byKey, idempotencyKey, () => {
      const r = this.source.find(code);
      if (!r?.reschedulingEpisode) return refused('closed');
      if (r.reschedulingEpisode.answer) return refused('already-answered');
      return this.source.close(r, 'NO_ALTERNATIVE', this.by, this.clock.now(), 'Salida cancelada o interrumpida');
    });
  }
}

/** The customer's own reservations (008- MyReservationsSource) that have a proposal; an episode closed with no alternative is not one to answer. */
export class DemoMyProposals extends MyProposalsSource {
  constructor(private readonly source: DemoReschedulingSource, private readonly own: MyReservationsSource) { super(); }
  override mine(): Observable<readonly ReschedulingEpisodeView[]> {
    return this.own.listMine().pipe(map((all) => all.map((r) => this.source.find(r.reservationId))
      .filter((r): r is Reservation => !!r?.reschedulingEpisode?.proposal && r.reschedulingEpisode.answer?.decision !== 'NO_ALTERNATIVE')
      .map((r) => this.source.view(r))));
  }
}

/** Accept moves the departure and turns the hold into its seat in one update (RN-RP1, RN-RP2); reject cancels with 100 % (RN-RP6). */
export class DemoProposalAnswerWriter extends ProposalAnswerWriter {
  constructor(private readonly source: DemoReschedulingSource, private readonly clock: Clock, private readonly by: string,
    private readonly byKey = new Map<string, ReschedulingOutcome>()) { super(); }

  override answer({ code, decision, idempotencyKey }: { code: string; decision: 'ACCEPTED' | 'REJECTED'; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return once(this.byKey, idempotencyKey, () => {
      const r = this.source.find(code), e = r?.reschedulingEpisode, d = e?.proposal && this.source.departure(e.proposal.departureId);
      if (!r || !e?.proposal || !d) return refused('closed');
      if (proofInValidation(r)) return refused('proof-in-validation');
      if (e.answer) return refused('already-answered');
      const at = this.clock.now();
      if (decision === 'REJECTED') return this.source.close(r, 'REJECTED', this.by, at, 'Cancelada por rechazo o vencimiento de reprogramación');
      return this.source.save({ ...r, departureId: d.id, departureDate: d.date, seatHeld: true, reschedulingPending: false,
        reschedulingEpisode: { ...e, answer: { decision, at, by: this.by } } });
    });
  }
}

/** After reservationDemoProviders(), selfServiceDemoProviders() and reservationChangesDemoProviders() (its Clock); key maps per page. */
export function reschedulingDemoProviders(): Provider[] {
  const byKey = new Map<string, ReschedulingOutcome>(), answers = new Map<string, ReschedulingOutcome>();
  return [
    { provide: ReschedulingDeadlines, useFactory: (c: Clock) => new DemoReschedulingDeadlines(c), deps: [Clock] },
    { provide: ReschedulingSource, deps: [ReservationsSource, DeparturesSource, ReschedulingDeadlines],
      useFactory: (s: DemoReservationsStore, d: DemoDeparturesStore, l: ReschedulingDeadlines) => new DemoReschedulingSource(s, d, l) },
    { provide: ReschedulingWriter, deps: [ReschedulingSource, Clock, PortalCapabilities],
      useFactory: (s: DemoReschedulingSource, c: Clock, p: PortalCapabilities) => new DemoReschedulingWriter(s, c, p.roleLabel(), byKey) },
    { provide: MyProposalsSource, deps: [ReschedulingSource, MyReservationsSource],
      useFactory: (s: DemoReschedulingSource, m: MyReservationsSource) => new DemoMyProposals(s, m) },
    // G-USR: the session carries no user, so the customer's answer is recorded as "Cliente".
    { provide: ProposalAnswerWriter, deps: [ReschedulingSource, Clock], useFactory: (s: DemoReschedulingSource, c: Clock) => new DemoProposalAnswerWriter(s, c, 'Cliente', answers) },
  ];
}

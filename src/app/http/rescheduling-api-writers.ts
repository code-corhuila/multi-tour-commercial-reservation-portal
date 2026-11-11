import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import { ProposalAnswerWriter, ReschedulingOutcome, ReschedulingRefusal, ReschedulingSource, ReschedulingWriter } from '../rescheduling/data/rescheduling-ports';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll } from './api-paths';

/** The part of Rescheduling (HU-COM-018, ReschedulingResponse) the writes need: the episode, and the proposal that waits for an answer. */
interface EpisodeDto { readonly reschedulingId: string; readonly state: string; readonly proposals: readonly { readonly proposalId: string; readonly state: string }[] }
const base = `${API_BASE}/reschedulings`;
const refused = (reason: ReschedulingRefusal): ReschedulingOutcome => ({ kind: 'refused', reason });

/**
 * A 422 is a refusal that changed nothing: the proof in validation and the seats are rules of the service (their message names them); a transition refusal is an episode
 * that is already answered. Any other 422 (a deadline passed, a period ended) reads as closed. Any other failure goes to the page.
 */
function refusal(error: ApiError): ReschedulingRefusal | null {
  if (error.status !== 422) return null;
  if (error.code === 'INVALID_STATUS_TRANSITION') return 'already-answered';
  if (/proof/i.test(error.message)) return 'proof-in-validation';
  if (/seats/i.test(error.message)) return 'no-seats';
  return 'closed';
}

const episodesOf = (client: PortalApiClient, code: string) => listAll<EpisodeDto>(client, base, { reservationId: code }).pipe(map((all) => all.at(-1)));

/** Runs one write on the service and reads the episode again, so the screen shows what the service holds; a refusal of the service becomes an outcome. */
function write(source: ReschedulingSource, code: string, request: Observable<unknown>): Observable<ReschedulingOutcome> {
  return request.pipe(
    switchMap(() => source.episode(code)),
    map((episode): ReschedulingOutcome => (episode ? { kind: 'done', episode } : refused('closed'))),
    catchError((error: ApiError) => { const reason = refusal(error); return reason ? of(refused(reason)) : throwError(() => error); }),
  );
}

/** The proposal over POST /reschedulings/{id}/proposals and the declaration of no alternative over POST /reschedulings/{id}/no-alternative; the person and the instant are the token's. */
export class ReschedulingApiWriter extends ReschedulingWriter {
  constructor(private readonly client: PortalApiClient, private readonly source: ReschedulingSource) { super(); }

  override propose({ code, departureId, idempotencyKey }: { code: string; departureId: string; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return this.onOpen(code, (id) => call(this.client, `${base}/${id}/proposals`, { method: 'POST', body: { proposedDepartureId: departureId }, headers: { 'Idempotency-Key': idempotencyKey } }));
  }

  /** No alternative closes the episode cancelled; the 100 % refund is determined by the service and executed by HU-COM-016. */
  override cancelWithFullRefund({ code }: { code: string; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return this.onOpen(code, (id) => call(this.client, `${base}/${id}/no-alternative`, { method: 'POST', body: {} }));
  }

  private onOpen(code: string, request: (id: string) => Observable<unknown>): Observable<ReschedulingOutcome> {
    return episodesOf(this.client, code).pipe(switchMap((e) => (e?.state === 'OPEN' ? write(this.source, code, request(e.reschedulingId)) : of(refused('closed')))));
  }
}

/** The customer's answer over POST /reschedulings/{id}/proposals/{proposalId}/answer: ACCEPT or REJECT, once per Idempotency-Key (RN-RP5). */
export class ProposalAnswerApiWriter extends ProposalAnswerWriter {
  constructor(private readonly client: PortalApiClient, private readonly source: ReschedulingSource) { super(); }

  override answer({ code, decision, idempotencyKey }: { code: string; decision: 'ACCEPTED' | 'REJECTED'; idempotencyKey: string }): Observable<ReschedulingOutcome> {
    return episodesOf(this.client, code).pipe(switchMap((e) => {
      const proposal = e?.proposals.find((p) => p.state === 'PENDING');
      if (!e || !proposal) return of(refused('closed'));
      return write(this.source, code, call(this.client, `${base}/${e.reschedulingId}/proposals/${proposal.proposalId}/answer`,
        { method: 'POST', body: { decision: decision === 'ACCEPTED' ? 'ACCEPT' : 'REJECT' }, headers: { 'Idempotency-Key': idempotencyKey } }));
    }));
  }
}

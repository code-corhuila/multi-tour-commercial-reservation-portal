import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ProposalAnswerApiWriter, ReschedulingApiWriter } from '../src/app/http/rescheduling-api-writers';
import { ProposalAnswerWriter, ReschedulingEpisodeView, ReschedulingSource, ReschedulingWriter } from '../src/app/rescheduling/data/rescheduling-ports';
import { sourceProviders } from '../src/app/sources';
import { fakeClient, page } from './api-client.double';

// HU-COM-018 portal: the proposal, the customer's answer and the declaration of no alternative over the writes of the service, one Idempotency-Key per intention.
const open = { reschedulingId: 'e-1', reservationId: 'r-1', state: 'OPEN', proposals: [] };
const pending = { ...open, proposals: [{ proposalId: 'p-1', proposedDepartureId: 'd-1', state: 'PENDING' }] };
const view = { reservationId: 'r-1', answer: null } as unknown as ReschedulingEpisodeView;
const source = { episode: () => of(view) } as unknown as ReschedulingSource;
const refusal = (status: number, code: string, message: string) => ({ fail: { status, code, message, details: [], traceId: '' } });

describe('reschedulingApiWriter', () => {
  it('sends the proposal to the open episode of the reservation with the key of the intention', async () => {
    const { client, calls } = fakeClient({ ok: page([open]) }, { ok: { ...open } });
    const outcome = await firstValueFrom(new ReschedulingApiWriter(client, source).propose({ code: 'r-1', departureId: 'd-1', idempotencyKey: 'key-0001-aaaa' }));
    expect(calls[1]).toMatchObject({ path: `${API_BASE}/reschedulings/e-1/proposals`, method: 'POST', body: { proposedDepartureId: 'd-1' }, headers: { 'Idempotency-Key': 'key-0001-aaaa' } });
    expect(outcome).toEqual({ kind: 'done', episode: view });
  });

  it('declares no alternative on the open episode', async () => {
    const { client, calls } = fakeClient({ ok: page([open]) }, { ok: { ...open } });
    const outcome = await firstValueFrom(new ReschedulingApiWriter(client, source).cancelWithFullRefund({ code: 'r-1', idempotencyKey: 'key-0002-aaaa' }));
    expect(calls[1]).toMatchObject({ path: `${API_BASE}/reschedulings/e-1/no-alternative`, method: 'POST' });
    expect(outcome.kind).toBe('done');
  });

  it('refuses without calling the service when the reservation has no open episode', async () => {
    const { client, calls } = fakeClient({ ok: page([{ ...open, state: 'CANCELLED' }]) });
    expect(await firstValueFrom(new ReschedulingApiWriter(client, source).propose({ code: 'r-1', departureId: 'd-1', idempotencyKey: 'key-0003-aaaa' }))).toEqual({ kind: 'refused', reason: 'closed' });
    expect(calls).toHaveLength(1);
  });

  it('turns the refusals of the service (422) into the refusals of the screen and lets any other failure through', async () => {
    const write = (reply: { fail: unknown }) => firstValueFrom(new ReschedulingApiWriter(fakeClient({ ok: page([open]) }, reply).client, source).propose({ code: 'r-1', departureId: 'd-1', idempotencyKey: 'key-0004-aaaa' }));
    expect(await write(refusal(422, 'BUSINESS_RULE_VIOLATION', 'a proof is in validation: it must be resolved before a proposal'))).toEqual({ kind: 'refused', reason: 'proof-in-validation' });
    expect(await write(refusal(422, 'BUSINESS_RULE_VIOLATION', 'the proposed departure has no seats for every traveller'))).toEqual({ kind: 'refused', reason: 'no-seats' });
    expect(await write(refusal(422, 'INVALID_STATUS_TRANSITION', 'the episode already has a pending proposal'))).toEqual({ kind: 'refused', reason: 'already-answered' });
    await expect(write(refusal(500, 'INTERNAL', 'boom'))).rejects.toMatchObject({ status: 500 });
  });
});

describe('proposalAnswerApiWriter', () => {
  it('answers the pending proposal of the episode with the decision of the contract and the key', async () => {
    const { client, calls } = fakeClient({ ok: page([pending]) }, { ok: { ...pending } }, { ok: page([pending]) }, { ok: { ...pending } });
    const writer = new ProposalAnswerApiWriter(client, source);
    await firstValueFrom(writer.answer({ code: 'r-1', decision: 'ACCEPTED', idempotencyKey: 'key-0005-aaaa' }));
    await firstValueFrom(writer.answer({ code: 'r-1', decision: 'REJECTED', idempotencyKey: 'key-0006-aaaa' }));
    expect(calls[1]).toMatchObject({ path: `${API_BASE}/reschedulings/e-1/proposals/p-1/answer`, method: 'POST', body: { decision: 'ACCEPT' }, headers: { 'Idempotency-Key': 'key-0005-aaaa' } });
    expect(calls[3]).toMatchObject({ body: { decision: 'REJECT' } });
  });

  it('refuses as closed when there is no pending proposal', async () => {
    const { client, calls } = fakeClient({ ok: page([open]) });
    expect(await firstValueFrom(new ProposalAnswerApiWriter(client, source).answer({ code: 'r-1', decision: 'ACCEPTED', idempotencyKey: 'key-0007-aaaa' }))).toEqual({ kind: 'refused', reason: 'closed' });
    expect(calls).toHaveLength(1);
  });
});

describe('reschedulingWritersWiring', () => {
  it('provides the writers in the default module', () => {
    TestBed.configureTestingModule({ providers: [...sourceProviders(fakeClient().client), { provide: ReschedulingSource, useValue: source }] });
    expect(TestBed.inject(ReschedulingWriter)).toBeInstanceOf(ReschedulingApiWriter);
    expect(TestBed.inject(ProposalAnswerWriter)).toBeInstanceOf(ProposalAnswerApiWriter);
    TestBed.resetTestingModule();
  });
});

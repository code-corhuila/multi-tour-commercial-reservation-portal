import { TestBed } from '@angular/core/testing';
import { MyProposalsSource, ReschedulingSource } from '../src/app/rescheduling/data/rescheduling-ports';
import { sourceProviders } from '../src/app/sources';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { MyProposalsApiSource, ReschedulingApiSource } from '../src/app/http/rescheduling-api-sources';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import type { Departure, Reservation } from '../src/app/reservations/model/reservation';
import { fakeClient, page } from './api-client.double';

// HU-COM-018 portal (T-08 to T-11): the episodes over GET /reschedulings of the service; the portal joins the tour, the travellers and the departures and computes no deadline.
const NOW = Date.parse('2026-11-11T10:00:00Z');
const episode = {
  reschedulingId: 'e-1', reservationId: 'r-1', customerId: 'c-1', originalDepartureId: 'd-0', state: 'OPEN', proposalDeadlineAt: '2026-11-12T08:00:00Z', episodeLimitAt: '2026-11-15T08:00:00Z',
  frozen: false, proposals: [], history: [],
};
const proposal = { proposalId: 'p-1', proposedDepartureId: 'd-1', state: 'PENDING', notifiedAt: '2026-11-11T09:00:00Z', responseDeadlineAt: '2026-11-13T09:00:00Z', heldSeats: 2 };
const reservation = { id: 'r-1', tourName: 'Desierto de la Tatacoa', people: 2, status: 'CONFIRMADA', departureDate: '2026-11-20T06:30:00Z', validatedCents: 300_000 } as unknown as Reservation;
const departure = (id: string, tourName: string, seats: number) => ({ id, tourName, date: '2026-11-25T06:30:00Z', state: 'PROGRAMADA', effectiveCapacity: seats }) as unknown as Departure;
const reservations = { list: () => of([reservation]) } as unknown as ReservationsSource;
const departures = { list: () => of([departure('d-1', 'Desierto de la Tatacoa', 5), departure('d-2', 'Desierto de la Tatacoa', 0), departure('d-9', 'Otro tour', 9)]) } as unknown as DeparturesSource;

describe('reschedulingApiSource', () => {
  it('asks the episodes of the reservation and keeps the deadlines the service computed', async () => {
    const { client, calls } = fakeClient({ ok: page([episode]) });
    const view = await firstValueFrom(new ReschedulingApiSource(client, reservations, departures, () => NOW).episode('r-1'));
    expect(calls[0].path).toContain(`${API_BASE}/reschedulings?`);
    expect(calls[0].path).toContain('reservationId=r-1');
    expect(view).toMatchObject({ reservationId: 'r-1', tourName: 'Desierto de la Tatacoa', people: 2, status: 'CONFIRMADA', proposal: null, answer: null, refundCents: null,
      deadlines: { proposeBy: '2026-11-12T08:00:00Z', respondBy: null, episodeEndsAt: '2026-11-15T08:00:00Z', remainingHours: 94 } });
    expect(view?.options.map((o) => o.id)).toEqual(['d-1', 'd-2']);
  });

  it('reads the pending proposal with its response deadline and the seats left of its departure', async () => {
    const { client } = fakeClient({ ok: page([{ ...episode, proposals: [proposal] }]) });
    const view = await firstValueFrom(new ReschedulingApiSource(client, reservations, departures, () => NOW).episode('r-1'));
    expect(view?.proposal).toEqual({ id: 'd-1', tourName: 'Desierto de la Tatacoa', startsAt: '2026-11-25T06:30:00Z', freeSeats: 5 });
    expect(view?.deadlines.respondBy).toBe('2026-11-13T09:00:00Z');
  });

  it('reads the answer: accepted, rejected and no alternative; a voided proposal is not shown', async () => {
    const read = async (e: object) => (await firstValueFrom(new ReschedulingApiSource(fakeClient({ ok: page([e]) }).client, reservations, departures, () => NOW).episode('r-1')));
    expect((await read({ ...episode, state: 'RESCHEDULED', closingReason: 'ACCEPTED', proposals: [{ ...proposal, state: 'ACCEPTED' }] }))?.answer).toBe('ACCEPTED');
    const rejected = await read({ ...episode, state: 'CANCELLED', closingReason: 'REJECTED_BY_CUSTOMER', proposals: [{ ...proposal, state: 'REJECTED' }] });
    expect(rejected).toMatchObject({ answer: 'REJECTED', refundCents: 300_000 });
    expect(await read({ ...episode, state: 'CANCELLED', closingReason: 'NO_ALTERNATIVE' })).toMatchObject({ answer: 'NO_ALTERNATIVE', proposal: null, refundCents: 300_000 });
    expect((await read({ ...episode, proposals: [{ ...proposal, state: 'VOID' }] }))?.proposal).toBeNull();
  });

  it('is null when the reservation has no episode', async () => {
    const { client } = fakeClient({ ok: page([]) });
    expect(await firstValueFrom(new ReschedulingApiSource(client, reservations, departures, () => NOW).episode('r-1'))).toBeNull();
  });
});

describe('myProposalsApiSource', () => {
  it('lists the episodes of the customer that have a proposal and leaves out the one closed with no alternative', async () => {
    const other = { ...episode, reschedulingId: 'e-2', reservationId: 'r-2' };
    const { client, calls } = fakeClient({ ok: page([{ ...episode, proposals: [proposal] }, { ...episode, reschedulingId: 'e-3', closingReason: 'NO_ALTERNATIVE', state: 'CANCELLED' }, other]) });
    const mine = await firstValueFrom(new MyProposalsApiSource(client, reservations, departures, () => NOW).mine());
    expect(calls[0].path).not.toContain('reservationId');
    expect(mine.map((v) => v.reservationId)).toEqual(['r-1']);
    expect(mine[0].proposal?.id).toBe('d-1');
  });
});

describe('reschedulingWiring', () => {
  it('provides the read ports in the default module', () => {
    TestBed.configureTestingModule({ providers: sourceProviders(fakeClient().client) });
    expect(TestBed.inject(ReschedulingSource)).toBeInstanceOf(ReschedulingApiSource);
    expect(TestBed.inject(MyProposalsSource)).toBeInstanceOf(MyProposalsApiSource);
    TestBed.resetTestingModule();
  });
});

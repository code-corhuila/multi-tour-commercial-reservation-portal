import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ReschedulingSource } from '../src/app/rescheduling/data/rescheduling-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { actorAs } from './actor-context.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018, admin-reprogramar-reserva.html: the action "Reprogramar" of Reservas (10) is offered when a reservation is marked as waiting for a rescheduling
// (`reschedulingPending`) and it opens the screen of that reservation, which reads its episode. A demo reservation with the mark and no episode offered an
// action that ended in "Esta reserva no tiene un episodio de reprogramación." (RES-1835).
function demo() {
  TestBed.configureTestingModule({ providers: [...demoSources({} as never), { provide: ActorContext, useValue: actorAs('OPERATIONAL_COLLABORATOR') }] });
  return { reservations: TestBed.inject(ReservationsSource), rescheduling: TestBed.inject(ReschedulingSource) };
}

describe('everyReprogramarOfTheDemoLeadsToAnEpisode', () => {
  it('gives each reservation marked as waiting for a rescheduling its episode, so the screen it opens has something to show', async () => {
    const { reservations, rescheduling } = demo();
    const pending = (await firstValueFrom(reservations.list())).filter((r) => r.reschedulingPending);
    expect(pending.map((r) => r.id)).toEqual(expect.arrayContaining(['RES-1829', 'RES-1835']));
    for (const reservation of pending) {
      expect(reservation.reschedulingEpisode, reservation.id).toBeDefined();
      const view = await firstValueFrom(rescheduling.episode(reservation.id));
      expect(view, reservation.id).not.toBeNull();
      expect(view?.reservationId, reservation.id).toBe(reservation.id);
    }
  });

  it('keeps the episode of RES-1835 open, still to propose, with the options of the departures it can move to', async () => {
    const { reservations, rescheduling } = demo();
    const reservation = (await firstValueFrom(reservations.list())).find((r) => r.id === 'RES-1835')!;
    expect(reservation.reschedulingEpisode?.proposal).toBeUndefined();
    const view = (await firstValueFrom(rescheduling.episode('RES-1835')))!;
    expect(view.options.length).toBeGreaterThan(0);
  });
});

import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { RESCHEDULING_SEEDS } from '../src/app/demo/rescheduling-seeds';
import { DemoReschedulingDeadlines, DemoReschedulingSource, DemoReschedulingWriter } from '../src/app/demo/rescheduling-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { API_BASE } from '../src/app/http/api-paths';
import { ReschedulingApiSource } from '../src/app/http/rescheduling-api-sources';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import type { Departure, Reservation } from '../src/app/reservations/model/reservation';
import { RESCHEDULING_AREA, ReschedulingSource, ReschedulingWriter } from '../src/app/rescheduling/data/rescheduling-ports';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { fakeClient, page } from './api-client.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 (T-08, AC-RP.12, AC-RP.5): the list "Episodios" of admin-reprogramar-reserva.html (mockup PDR v1.9), narrowed by reservation or departure.
const clock = new FixedClock('2026-10-13T09:30:00-05:00');
const demo = () => {
  const store = new DemoReservationsStore([...RESCHEDULING_SEEDS]), source = new DemoReschedulingSource(store, new DemoDeparturesStore(), new DemoReschedulingDeadlines(clock));
  return { source, writer: new DemoReschedulingWriter(source, clock, 'Colaborador operativo') };
};

describe('demoEpisodesListNarrowsByReservationAndDeparture', () => {
  it('lists every episode with its customer, original departure and the hours left of the deadline the port resolves', async () => {
    const all = await firstValueFrom(demo().source.list({}));
    expect(all.map((e) => e.reservationId).sort()).toEqual(['RES-1827', 'RES-1828', 'RES-1829']);
    expect(all.find((e) => e.reservationId === 'RES-1828')).toMatchObject({ customer: 'Laura Gómez (demo)', originalDepartureId: 'demo-dep-5', dueIn: { kind: 'propose', hours: 10 } });
    expect(all.find((e) => e.reservationId === 'RES-1829')?.dueIn).toEqual({ kind: 'respond', hours: 59 });
  });

  it('narrows by reservation and by departure', async () => {
    const { source } = demo();
    expect((await firstValueFrom(source.list({ reservation: 'RES-1828' }))).map((e) => e.reservationId)).toEqual(['RES-1828']);
    expect(await firstValueFrom(source.list({ departure: 'demo-dep-5' }))).toHaveLength(3);
    expect(await firstValueFrom(source.list({ departure: 'demo-dep-8' }))).toEqual([]);
  });
});

describe('httpEpisodesListAsksTheServiceWithTheFilters', () => {
  it('sends reservationId and departureId and joins the customer of the reservation', async () => {
    const dto = { reschedulingId: 'e-1', reservationId: 'r-1', originalDepartureId: 'd-0', state: 'OPEN', proposalDeadlineAt: '2026-11-12T08:00:00Z', episodeLimitAt: '2026-11-15T08:00:00Z', frozen: false, proposals: [] };
    const reservation = { id: 'r-1', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Tour', people: 2, status: 'CONFIRMADA', departureDate: '2026-11-20T06:30:00Z' } as unknown as Reservation;
    const { client, calls } = fakeClient({ ok: page([dto]) });
    const source = new ReschedulingApiSource(client, { list: () => of([reservation]) } as unknown as ReservationsSource, { list: () => of([] as Departure[]) } as unknown as DeparturesSource, () => Date.parse('2026-11-11T10:00:00Z'));
    const [row] = await firstValueFrom(source.list({ departure: 'd-0' }));
    expect(calls[0].path).toContain(`${API_BASE}/reschedulings?`);
    expect(calls[0].path).toContain('departureId=d-0');
    expect(row).toMatchObject({ reservationId: 'r-1', customer: 'Laura Gómez (demo)', originalDepartureId: 'd-0', dueIn: { kind: 'propose', hours: 22 } });
  });
});

async function screen(params: Record<string, string>, role: ActorRole = 'TENANT_ADMINISTRATOR') {
  TestBed.resetTestingModule();
  const d = demo(), navigation = new PortalNavigation();
  navigation.register(['reservations', RESCHEDULING_AREA]);
  navigation.params.set(params);
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role) }, { provide: ReschedulingSource, useValue: d.source }, { provide: ReschedulingWriter, useValue: d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] });
  const fixture = TestBed.createComponent(ReschedulingPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const rows = () => Array.from(host.querySelectorAll('[data-episode-row]')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
  return { host, settle, rows };
}

describe('operatorListShowsReservationCustomerOriginalDepartureStateAndDeadline', () => {
  it('draws the table of the mockup with one row per episode of the departure', async () => {
    const s = await screen({ departure: 'demo-dep-5' });
    expect(s.host.textContent).toContain('Reservas con salida cancelada o interrumpida');
    expect(Array.from(s.host.querySelectorAll('th')).map((h) => h.textContent?.trim())).toEqual(['Reserva', 'Cliente', 'Salida original', 'Estado', 'Plazo', 'Acción']);
    const rows = s.rows();
    expect(rows).toHaveLength(3);
    const r1828 = rows.find((r) => r.includes('RES-1828')), r1829 = rows.find((r) => r.includes('RES-1829'));
    expect(r1828).toContain('Laura Gómez (demo)');
    expect(r1828).toContain('Pendiente de propuesta');
    expect(r1828).toContain('Proponer en 10 h');
    expect(r1829).toContain('Propuesta enviada');
    expect(r1829).toContain('Respuesta en 59 h');
  });

  it('narrows to the reservation it was opened with and opens another episode from its row', async () => {
    const s = await screen({ reservation: 'RES-1828' });
    expect(s.rows()).toHaveLength(1);
    const all = await screen({ departure: 'demo-dep-5' });
    all.host.querySelector<HTMLButtonElement>('[data-episode-row="RES-1829"] button')!.click(); await all.settle();
    expect(all.host.textContent).toContain('Reserva RES-1829');
  });

  it('shows the empty text of the mockup when no episode matches', async () => {
    const s = await screen({ departure: 'demo-dep-8' });
    expect(s.host.textContent).toContain('No hay episodios de reprogramación. Se abren cuando una salida con reservas se cancela o se interrumpe por una causa no atribuible al cliente.');
  });

  it('keeps the list for a read-only role, without the forms', async () => {
    const s = await screen({ departure: 'demo-dep-5' }, 'ANALYST');
    expect(s.rows()).toHaveLength(3);
    expect(Array.from(s.host.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Enviar propuesta')).toBe(false);
  });
});

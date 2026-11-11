import { readFileSync } from 'node:fs';
import { Injector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { RESCHEDULING_SEEDS } from '../src/app/demo/rescheduling-seeds';
import { DemoReschedulingDeadlines, DemoReschedulingSource, DemoReschedulingWriter } from '../src/app/demo/rescheduling-demo';
import { DemoCancellationQuote, FixedClock } from '../src/app/demo/reservation-changes-demo';
import { Reservation } from '../src/app/reservations/model/reservation';
import {
  RESCHEDULING_AREA, ReschedulingEpisodeView, ReschedulingOutcome, ReschedulingSource, ReschedulingWriter,
} from '../src/app/rescheduling/data/rescheduling-ports';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 (#184), operator side: admin-reprogramar-reserva.html over the one demo store. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
const clock = new FixedClock(NOW);
function demo(over: readonly Reservation[] = []) {
  const store = new DemoReservationsStore([...RESCHEDULING_SEEDS, ...over]), departures = new DemoDeparturesStore();
  const source = new DemoReschedulingSource(store, departures, new DemoReschedulingDeadlines(clock));
  return { store, departures, source, writer: new DemoReschedulingWriter(source, clock, 'Colaborador operativo') };
}
const find = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!;
const heldOn = (store: DemoReservationsStore, departureId: string) => store.items
  .filter((r) => r.reschedulingEpisode?.proposal?.departureId === departureId && !r.reschedulingEpisode.answer)
  .reduce((n, r) => n + r.reschedulingEpisode!.proposal!.heldSeats, 0);

class ControllableSource extends ReschedulingSource {
  readonly requests: Subject<ReschedulingEpisodeView | null>[] = [];
  override episode(): Observable<ReschedulingEpisodeView | null> { const s = new Subject<ReschedulingEpisodeView | null>(); this.requests.push(s); return s; }
}

async function page(o: { role?: ActorRole | string; code?: string; source?: ReschedulingSource; writer?: ReschedulingWriter; d?: ReturnType<typeof demo> } = {}) {
  const d = o.d ?? demo(), navigation = new PortalNavigation();
  navigation.register(['reservations', RESCHEDULING_AREA]);
  navigation.params.set({ reservation: o.code ?? 'RES-1828' });
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'OPERATIONAL_COLLABORATOR') as ActorRole) },
    { provide: ReschedulingSource, useValue: o.source ?? d.source },
    { provide: ReschedulingWriter, useValue: o.writer ?? d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] });
  const fixture = TestBed.createComponent(ReschedulingPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const flat = () => (host.textContent ?? '').replace(/\s+/g, ' ');
  const choose = async (id: string) => { const s = host.querySelector<HTMLSelectElement>('#crp-rp-departure')!; s.value = id; s.dispatchEvent(new Event('change')); await settle(); };
  return { ...d, host, settle, button, flat, choose, navigation };
}

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('covers src/app/rescheduling/ with no HTTP client, request or storage of its own', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/rescheduling/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|Date\.now\(/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('everyReschedulingScreenShowsOneOfTheFourStates', () => {
  it('shows loading, error with a retry that asks again, empty without an episode, and data', async () => {
    const source = new ControllableSource();
    const s = await page({ source });
    expect(s.host.querySelector('h1')?.textContent).toBe('Propuesta de reprogramación');
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    source.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    expect(source.requests).toHaveLength(2);
    source.requests[1].next(null); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent).toContain('Esta reserva no tiene un episodio de reprogramación.');
  });

  it('is an operator sub-screen with no sidebar item, under Reservas, offered by the demo build', () => {
    const area = PORTAL_AREAS.find((a) => a.key === RESCHEDULING_AREA)!;
    expect(area).toMatchObject({ label: 'Propuesta de reprogramación', menu: false, parent: 'reservations' });
    expect(area.audience ?? 'operator').toBe('operator');
    TestBed.configureTestingModule({ providers: [...demoSources({} as never), { provide: ActorContext, useValue: actorAs('ANALYST') }] });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
    expect(TestBed.inject(ReschedulingSource)).toBeInstanceOf(DemoReschedulingSource);
  });
});

describe('demoDeadlinesPortReturnsTheLowestOf72hRemainderAndProposedStart', () => {
  const origin = '2026-10-12T19:30:00-05:00';
  it('L1 is origin + 24 h and the episode ends at origin + 96 h', () => {
    const d = new DemoReschedulingDeadlines(new FixedClock(NOW)).resolve(origin, null);
    expect(d).toEqual({ proposeBy: '2026-10-14T00:30:00.000Z', respondBy: null, episodeEndsAt: '2026-10-17T00:30:00.000Z', remainingHours: 82 });
  });

  it('answers by sent + 72 h when it is the lowest', () => {
    const d = new DemoReschedulingDeadlines(new FixedClock(NOW)).resolve(origin, { sentAt: '2026-10-12T21:00:00-05:00', startsAt: '2026-10-23T06:30:00-05:00' });
    expect(d.respondBy).toBe('2026-10-16T02:00:00.000Z');
  });

  it('answers by the episode end when the proposal came late, and by the proposed start when it comes first', () => {
    const late = new DemoReschedulingDeadlines(new FixedClock('2026-10-14T09:00:00-05:00')).resolve(origin, { sentAt: '2026-10-14T08:00:00-05:00', startsAt: '2026-10-23T06:30:00-05:00' });
    expect(late).toMatchObject({ respondBy: '2026-10-17T00:30:00.000Z', remainingHours: 58 });
    const soon = new DemoReschedulingDeadlines(new FixedClock('2026-10-16T20:00:00-05:00')).resolve(origin, { sentAt: '2026-10-12T21:00:00-05:00', startsAt: '2026-10-14T06:30:00-05:00' });
    expect(soon).toMatchObject({ respondBy: '2026-10-14T11:30:00.000Z', remainingHours: 0 });
  });
});

describe('episodeScreenShowsTheDeadlinesThePortResolves', () => {
  it('draws "Episodio: quedan N h" from the port, with the hero and the deadlines panel of the mockup', async () => {
    const s = await page();
    expect(s.host.querySelector('.crp-rescheduling-hero .crp-operator-eyebrow')?.textContent).toBe('Reserva RES-1828');
    expect(s.host.querySelector('.crp-rescheduling-hero h2')?.textContent).toBe('Salida cancelada o interrumpida');
    expect(s.host.querySelector('.crp-rescheduling-hero .crp-status.crp-is-pending')?.textContent).toBe('Episodio: quedan 82 h');
    expect(s.flat()).toContain('Plazos del episodio');
    expect(s.flat()).toContain('El cliente tiene 72 horas corridas para aceptar o rechazar; el límite absoluto del episodio es 96 horas.');
  });

  it('applies no expiry: an episode past 96 h shows 0 h and stays open', async () => {
    const d = demo(), late = new DemoReschedulingSource(d.store, d.departures, new DemoReschedulingDeadlines(new FixedClock('2026-10-20T09:00:00-05:00')));
    const s = await page({ source: late });
    expect(s.host.querySelector('.crp-rescheduling-hero .crp-status')?.textContent).toBe('Episodio: quedan 0 h');
    expect(find(d.store, 'RES-1828').status).toBe('CONFIRMADA');
    expect(s.button('Enviar propuesta')).toBeTruthy();
  });
});

describe('proposalToADepartureWithoutSeatsChangesNothing', () => {
  it('refuses a departure with fewer seats than travellers: same departure, seat and episode', async () => {
    const d = demo(), before = find(d.store, 'RES-1828');
    const outcome = await firstValueFrom(d.writer.propose({ code: 'RES-1828', departureId: 'demo-dep-7', idempotencyKey: 'k-1' }));
    expect(outcome).toEqual({ kind: 'refused', reason: 'no-seats' });
    expect(find(d.store, 'RES-1828')).toBe(before);
    expect(heldOn(d.store, 'demo-dep-7')).toBe(0);
  });

  it('says why on the screen and moves the focus to Nueva salida', async () => {
    const s = await page();
    await s.choose('demo-dep-7');
    s.button('Enviar propuesta')!.click(); await s.settle();
    expect(s.host.querySelector('#crp-rp-feedback[role="alert"]')?.textContent).toContain('La salida propuesta no tiene cupos para todos los viajeros de la reserva.');
    expect(document.activeElement === s.host.querySelector('#crp-rp-departure') || s.host.querySelector('#crp-rp-departure')?.getAttribute('aria-invalid') === 'true').toBe(true);
    expect(find(s.store, 'RES-1828').reschedulingEpisode?.proposal).toBeUndefined();
  });
});

describe('reservationWithAProofInValidationCannotBeRescheduled', () => {
  it('refuses RES-1827, whose proof is En validación, and the screen says why', async () => {
    const d = demo();
    expect(await firstValueFrom(d.writer.propose({ code: 'RES-1827', departureId: 'demo-dep-6', idempotencyKey: 'k-1' })))
      .toEqual({ kind: 'refused', reason: 'proof-in-validation' });
    const s = await page({ code: 'RES-1827' });
    s.button('Enviar propuesta')!.click(); await s.settle();
    expect(s.host.querySelector('[role="alert"]')?.textContent).toContain('La reserva tiene un comprobante En validación: no se puede reprogramar hasta resolverlo.');
    expect(find(s.store, 'RES-1827').reschedulingEpisode?.proposal).toBeUndefined();
  });
});

describe('sendingAProposalHoldsTheSeatsInTheProposedDeparture', () => {
  it('holds the travellers in the proposed departure, sets the mark and keeps the reservation, which HU-COM-013 then refuses to cancel', async () => {
    const d = demo(), free = d.source.freeSeats(d.departures.items.find((x) => x.id === 'demo-dep-6')!);
    const outcome = await firstValueFrom(d.writer.propose({ code: 'RES-1828', departureId: 'demo-dep-6', idempotencyKey: 'k-1' }));
    expect(outcome.kind).toBe('done');
    const r = find(d.store, 'RES-1828');
    expect(r).toMatchObject({ id: 'RES-1828', status: 'CONFIRMADA', departureId: 'demo-dep-5', reschedulingPending: true });
    expect(r.reschedulingEpisode?.proposal).toEqual({ departureId: 'demo-dep-6', sentAt: NOW, heldSeats: 2 });
    expect(d.source.freeSeats(d.departures.items.find((x) => x.id === 'demo-dep-6')!)).toBe(free - 2);
    expect((await firstValueFrom(new DemoCancellationQuote(d.store).quote('RES-1828')))?.eligibility).toBe('rescheduling-pending');
  });

  it('a double click of Enviar propuesta sends one proposal with one key', async () => {
    const keys: string[] = []; const d = demo();
    const writer = new (class extends DemoReschedulingWriter {
      override propose(c: Parameters<DemoReschedulingWriter['propose']>[0]): Observable<ReschedulingOutcome> { keys.push(c.idempotencyKey); return super.propose(c); }
    })(d.source, clock, 'Colaborador operativo');
    const s = await page({ d, writer });
    const sentAt = () => find(d.store, 'RES-1828').reschedulingEpisode?.proposal;
    s.button('Enviar propuesta')!.click(); const first = sentAt(); s.button('Enviar propuesta')?.click(); await s.settle();
    expect(new Set(keys).size).toBe(1);
    expect(sentAt()).toBe(first);
    expect(s.host.querySelector('#crp-rp-feedback')?.textContent).toBe('Propuesta enviada al cliente.');
    expect(s.host.querySelector<HTMLSelectElement>('#crp-rp-departure')?.value).toBe('demo-dep-6');
  });
});

describe('noAlternativeCancelsWithA100PercentRefundDetermination', () => {
  it('Cancelar con devolución 100 % leaves Cancelada, the hold released and $300.000 determined with origin HU-COM-018', async () => {
    const s = await page({ code: 'RES-1829' });
    s.button('Cancelar con devolución 100 %')!.click(); await s.settle();
    const r = find(s.store, 'RES-1829');
    expect(r).toMatchObject({ status: 'CANCELADA', seatHeld: false, reschedulingPending: false });
    expect(r.financialDecision).toMatchObject({ kind: 'RESCHEDULING_NOT_ACCEPTED', origin: 'HU-COM-018', refundableCents: 30_000_000, penaltyAmountCents: 0 });
    expect(r.reschedulingEpisode?.answer).toMatchObject({ decision: 'NO_ALTERNATIVE', at: NOW });
    expect(heldOn(s.store, 'demo-dep-8')).toBe(0);
    expect(s.host.querySelector('#crp-rp-feedback')?.textContent).toBe('La reserva queda Cancelada y se devuelve el 100 % de los valores pagados y validados: $300.000.');
    expect(s.host.querySelector('.crp-rescheduling-hero .crp-status.crp-is-cancelled')?.textContent).toBe('Cancelada');
    expect(s.button('Enviar propuesta')).toBeUndefined();
  });
});

describe('respuestaDelClienteShowsTheRecordedAnswer', () => {
  it('shows Pendiente de respuesta, then the recorded answer, always read only and with no evidence field (DP-RP3)', async () => {
    const accepted = { ...RESCHEDULING_SEEDS[0], id: 'RES-T1', reschedulingEpisode: { ...RESCHEDULING_SEEDS[0].reschedulingEpisode!,
      answer: { decision: 'ACCEPTED' as const, at: NOW, by: 'Cliente' } } };
    const pending = await page({ code: 'RES-1829' });
    const answer = () => pending.host.querySelector<HTMLSelectElement>('#crp-rp-answer')!;
    expect(answer().disabled).toBe(true);
    expect(Array.from(answer().options, (o) => o.textContent?.trim())).toEqual(['Pendiente de respuesta', 'Aceptar', 'Rechazar']);
    expect(answer().selectedOptions[0].textContent?.trim()).toBe('Pendiente de respuesta');
    expect(pending.host.querySelectorAll('input, textarea')).toHaveLength(0);
    TestBed.resetTestingModule();
    const done = await page({ code: 'RES-T1', d: demo([accepted]) });
    expect(done.host.querySelector<HTMLSelectElement>('#crp-rp-answer')!.selectedOptions[0].textContent?.trim()).toBe('Aceptar');
    expect(done.button('Enviar propuesta')).toBeUndefined();
  });
});

describe('withoutTheCapabilityOrWithAnUnknownRoleNoActionIsOffered', () => {
  it.each(['MANAGER', 'ACCOUNTANT', 'ANALYST', 'ROL_DESCONOCIDO'])('%s reads the episode with no send or cancel action', async (role) => {
    const s = await page({ role });
    expect(s.host.querySelector('[data-state="data"]')).toBeTruthy();
    expect(s.button('Enviar propuesta')).toBeUndefined();
    expect(s.button('Cancelar con devolución 100 %')).toBeUndefined();
    expect(s.host.querySelector<HTMLSelectElement>('#crp-rp-departure')?.disabled).toBe(true);
  });

  it('grants both actions to the Administrator and the Collaborator only (DP-RP1: the story actor line)', () => {
    const can = (role: string) => PortalCapabilities.for(role).canProposeRescheduling();
    expect(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'].map(can)).toEqual([true, true]);
    expect(['MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'FINAL_CUSTOMER'].map(can)).toEqual([false, false, false, false, false]);
  });
});

describe('reschedulingTextsAreSpanishAndUseFormatCopAndFormatDate', () => {
  it('writes Nueva salida as the mockup: "18 oct 2026 · 06:30 · Ruta Andina", and no raw code', async () => {
    const s = await page();
    expect(Array.from(s.host.querySelectorAll('#crp-rp-departure option'), (o) => o.textContent?.trim()))
      .toEqual(['18 oct 2026 · 06:30 · Ruta Andina', '19 oct 2026 · 06:30 · Ruta Andina', '23 oct 2026 · 06:30 · Ruta Andina']);
    expect(s.host.querySelector('label[for="crp-rp-departure"]')?.textContent).toBe('Nueva salida');
    expect(s.host.querySelector('#crp-rp-departure')?.getAttribute('aria-describedby')).toBe('crp-rp-feedback');
    expect(s.flat()).toContain('Los cupos de la salida propuesta quedan apartados hasta aceptar, rechazar, vencer el plazo, llegar la hora programada o cancelarse la salida propuesta.');
    for (const raw of ['CONFIRMADA', 'demo-dep', 'NO_ALTERNATIVE', 'undefined', 'T06:30']) expect(s.flat()).not.toContain(raw);
    expect(s.host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('RF-015C · Salida afectada');
    expect(s.button('Volver a reservas')).toBeTruthy();
  });

  it('draws no status box while there is nothing to say: the feedback line takes its role only with a message', async () => {
    const s = await page();
    expect(s.host.querySelector('#crp-rp-feedback')?.hasAttribute('role')).toBe(false);
    expect(s.host.querySelectorAll('[role="status"], [role="alert"]')).toHaveLength(0);
  });

  it('Volver a reservas opens Reservas', async () => {
    const s = await page();
    s.button('Volver a reservas')!.click();
    expect(s.navigation.selected()).toBe('reservations');
  });
});

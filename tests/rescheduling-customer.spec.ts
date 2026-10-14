import { readFileSync } from 'node:fs';
import { Injector, Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { RESCHEDULING_SEEDS } from '../src/app/demo/rescheduling-seeds';
import { DemoMyProposals, DemoProposalAnswerWriter, DemoReschedulingDeadlines, DemoReschedulingSource } from '../src/app/demo/rescheduling-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { MyProposalsSource, PROPOSAL_AREA, ProposalAnswerWriter, ReschedulingEpisodeView, ReschedulingOutcome } from '../src/app/rescheduling/data/rescheduling-ports';
import { ReschedulingProposalPageComponent } from '../src/app/rescheduling/pages/rescheduling-proposal-page.component';
import {
  ProposedDepartureLineComponent, RESCHEDULING_CONTRIBUTIONS, ReschedulingMarkComponent, ReschedulingNoticesComponent, RespondProposalActionComponent,
} from '../src/app/rescheduling/components/rescheduling-contributions.component';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { CLIENT_NOTICES, RESERVATION_CARD_ACTIONS, RESERVATION_CARD_EXTRAS } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 (#184), customer side: 24A, the mark of Mis reservas and the notice of 17. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
const clock = new FixedClock(NOW);
/** The demo customer owns RES-1829 and RES-1828; RES-1827 is another customer's. */
class OwnReservations extends MyReservationsSource {
  constructor(private readonly codes: readonly string[] = ['RES-1829', 'RES-1828']) { super(); }
  override listMine() { return of(this.codes.map((reservationId) => ({ reservationId }) as never)); }
}
function demo(codes?: readonly string[]) {
  const store = new DemoReservationsStore(RESCHEDULING_SEEDS.map((r) => ({ ...r }))), departures = new DemoDeparturesStore();
  const source = new DemoReschedulingSource(store, departures, new DemoReschedulingDeadlines(clock));
  return { store, source, mine: new DemoMyProposals(source, new OwnReservations(codes)), writer: new DemoProposalAnswerWriter(source, clock, 'Cliente') };
}
const find = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!;
class CountingWriter extends ProposalAnswerWriter {
  readonly keys: string[] = [];
  constructor(private readonly inner: ProposalAnswerWriter) { super(); }
  override answer(c: Parameters<ProposalAnswerWriter['answer']>[0]): Observable<ReschedulingOutcome> { this.keys.push(c.idempotencyKey); return this.inner.answer(c); }
}
class ControllableMine extends MyProposalsSource {
  readonly requests: Subject<readonly ReschedulingEpisodeView[]>[] = [];
  override mine(): Observable<readonly ReschedulingEpisodeView[]> { const s = new Subject<readonly ReschedulingEpisodeView[]>(); this.requests.push(s); return s; }
}

async function render<T>(component: Type<T>, o: { code?: string; d?: ReturnType<typeof demo>; mine?: MyProposalsSource; writer?: ProposalAnswerWriter } = {}, inputs: Record<string, unknown> = {}) {
  const d = o.d ?? demo(), navigation = new PortalNavigation();
  navigation.register([CLIENT_AREA.panel, CLIENT_AREA.reservations, PROPOSAL_AREA]);
  navigation.params.set({ reservation: o.code ?? 'RES-1829' });
  TestBed.configureTestingModule({ providers: [
    { provide: MyProposalsSource, useValue: o.mine ?? d.mine },
    { provide: ProposalAnswerWriter, useValue: o.writer ?? d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const flat = () => (host.textContent ?? '').replace(/\s+/g, ' ').trim();
  return { ...d, host, settle, button, flat, navigation };
}
const proposal = (o: Parameters<typeof render>[1] = {}) => render(ReschedulingProposalPageComponent, o);

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('keeps the customer pieces of src/app/rescheduling/ without HTTP client, storage or system clock', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/rescheduling/') && /proposal|contributions/.test(f));
    expect(files).toHaveLength(2);
    expect(files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|localStorage|sessionStorage|Date\.now\(/.test(withoutComments(readFileSync(f, 'utf8'))))).toEqual([]);
  });
});

describe('everyReschedulingScreenShowsOneOfTheFourStates', () => {
  it('24A shows loading, error with a retry that asks again, empty for a code without a proposal of the customer, and data', async () => {
    const mine = new ControllableMine();
    const s = await proposal({ mine });
    expect(s.host.querySelector('h1')?.textContent).toBe('Propuesta de reprogramación');
    expect(s.host.querySelector('[data-state="loading"]')).toBeTruthy();
    mine.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    mine.requests[1].next([]); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent).toContain('No hay una propuesta de reprogramación para esta reserva.');
  });

  it('24A is a customer area with its own top bar, offered by the demo build to the final customer', () => {
    const area = PORTAL_AREAS.find((a) => a.key === PROPOSAL_AREA)!;
    expect(area).toMatchObject({ label: 'Propuesta de reprogramación', audience: 'customer', clientChrome: 'none', menu: false });
    TestBed.configureTestingModule({ providers: [...demoSources({} as never), { provide: ActorContext, useValue: actorAs('READ_ONLY') },
      { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) }] });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
  });
});

describe('customerAnswersTheirOwnProposalOn24A', () => {
  it('draws 24A as the mockup: reservation, tour, original and proposed departures, travellers and the deadline texts', async () => {
    const s = await proposal();
    expect(s.host.querySelector('[data-state="data"] .crp-operator-eyebrow')?.textContent).toBe('Reserva RES-1829');
    expect(s.host.querySelector('[data-state="data"] h2')?.textContent).toBe('Ruta Andina');
    expect(Array.from(s.host.querySelectorAll('dl div'), (d) => d.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Salida original cancelada16 oct 2026 · 06:30', 'Salida propuesta23 oct 2026 · 06:30', 'Viajeros2 viajeros']);
    expect(s.flat()).toContain('Los cupos de la salida propuesta quedan apartados durante el plazo de respuesta.');
    expect(s.flat()).toContain('El plazo de respuesta es el menor entre 72 horas corridas, el tiempo restante del episodio de reprogramación y la hora de inicio de la salida propuesta; el episodio tiene un límite absoluto de 96 horas.');
    expect(s.host.querySelector('.crp-page-header-desc')?.textContent).toBe('La salida original fue cancelada por una causa no atribuible al cliente. Revisa la alternativa y responde dentro del plazo.');
    for (const raw of ['demo-dep', 'CONFIRMADA', 'T06:30', 'undefined']) expect(s.flat()).not.toContain(raw);
  });

  it('Aceptar propuesta records the answer with its time and says the real state of the reservation', async () => {
    const s = await proposal();
    s.button('Aceptar propuesta')!.click(); await s.settle();
    expect(find(s.store, 'RES-1829').reschedulingEpisode?.answer).toEqual({ decision: 'ACCEPTED', at: NOW, by: 'Cliente' });
    expect(s.host.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Propuesta aceptada. La reserva sigue Confirmada con la nueva salida.');
    expect(s.button('Aceptar propuesta')).toBeUndefined();
    expect(s.button('Rechazar propuesta')).toBeUndefined();
  });

  it('a customer opening another customer\'s code gets the empty state', async () => {
    const s = await proposal({ code: 'RES-1827', d: demo() });
    expect(s.host.querySelector('[data-state="empty"]')).toBeTruthy();
    expect(s.flat()).not.toContain('Aceptar propuesta');
  });

  it('Mis reservas and Volver a mis reservas open the customer\'s reservations; the brand opens the panel', async () => {
    const s = await proposal();
    s.button('Volver a mis reservas')!.click();
    expect(s.navigation.selected()).toBe(CLIENT_AREA.reservations);
    s.button('Multi Tour')!.click();
    expect(s.navigation.selected()).toBe(CLIENT_AREA.panel);
  });
});

describe('acceptingKeepsTheSameReservationAndItsPayments', () => {
  it('keeps the code, the values and the validated payments, takes the new departure and drops the mark, keeping the episode', async () => {
    const d = demo(), before = find(d.store, 'RES-1829');
    expect((await firstValueFrom(d.writer.answer({ code: 'RES-1829', decision: 'ACCEPTED', idempotencyKey: 'k-1' }))).kind).toBe('done');
    const after = find(d.store, 'RES-1829');
    expect(after).toMatchObject({ id: 'RES-1829', status: 'CONFIRMADA', quote: before.quote, validatedCents: before.validatedCents, balanceCents: before.balanceCents,
      departureId: 'demo-dep-8', departureDate: '2026-10-23T06:30:00-05:00', reschedulingPending: false });
    expect(after.reschedulingEpisode).toMatchObject({ originDepartureId: 'demo-dep-5', proposal: { departureId: 'demo-dep-8' } });
    expect(d.store.items.filter((r) => r.id === 'RES-1829')).toHaveLength(1);
  });
});

describe('acceptingMovesTheSeatAndReleasesTheHold', () => {
  it('the hold becomes the reservation\'s seat in the proposed departure: the free seats do not change twice', async () => {
    const d = demo(), dep8 = d.source.departure('demo-dep-8')!, free = d.source.freeSeats(dep8);
    await firstValueFrom(d.writer.answer({ code: 'RES-1829', decision: 'ACCEPTED', idempotencyKey: 'k-1' }));
    expect(find(d.store, 'RES-1829').seatHeld).toBe(true);
    expect(d.source.freeSeats(dep8)).toBe(free);
  });
});

describe('aSecondAnswerIsNotAcceptedAndTheRetryReusesItsKey', () => {
  it('the same key returns the first outcome; another answer is refused and changes nothing', async () => {
    const d = demo();
    const first = await firstValueFrom(d.writer.answer({ code: 'RES-1829', decision: 'ACCEPTED', idempotencyKey: 'k-1' }));
    expect(await firstValueFrom(d.writer.answer({ code: 'RES-1829', decision: 'ACCEPTED', idempotencyKey: 'k-1' }))).toBe(first);
    const accepted = find(d.store, 'RES-1829');
    expect(await firstValueFrom(d.writer.answer({ code: 'RES-1829', decision: 'REJECTED', idempotencyKey: 'k-2' }))).toEqual({ kind: 'refused', reason: 'already-answered' });
    expect(find(d.store, 'RES-1829')).toBe(accepted);
  });

  it('a double click records one answer with one key, and a second visit offers no answer', async () => {
    const d = demo(), writer = new CountingWriter(d.writer);
    const s = await proposal({ d, writer });
    s.button('Aceptar propuesta')!.click(); s.button('Aceptar propuesta')?.click(); await s.settle();
    expect(new Set(writer.keys).size).toBe(1);
    TestBed.resetTestingModule();
    const again = await proposal({ d });
    expect(again.button('Aceptar propuesta')).toBeUndefined();
    expect(again.flat()).toContain('Propuesta aceptada. La reserva sigue Confirmada con la nueva salida.');
  });
});

describe('rejectingCancelsWithA100PercentRefundDetermination', () => {
  it('Rechazar propuesta leaves Cancelada, the hold released and $300.000 determined with origin HU-COM-018', async () => {
    const s = await proposal(), dep8 = s.source.departure('demo-dep-8')!, free = s.source.freeSeats(dep8);
    s.button('Rechazar propuesta')!.click(); await s.settle();
    const r = find(s.store, 'RES-1829');
    expect(r).toMatchObject({ status: 'CANCELADA', seatHeld: false, reschedulingPending: false, cancellation: { cause: 'Cancelada por rechazo o vencimiento de reprogramación' } });
    expect(r.financialDecision).toMatchObject({ kind: 'RESCHEDULING_NOT_ACCEPTED', origin: 'HU-COM-018', refundableCents: 30_000_000, penaltyAmountCents: 0 });
    expect(s.source.freeSeats(dep8)).toBe(free + 2);
    expect(s.host.querySelector('[aria-live="polite"]')?.textContent?.trim())
      .toBe('Propuesta rechazada. La reserva queda Cancelada y se devuelve el 100 % de los valores pagados y validados.');
  });
});

describe('panelAndMyReservationsShowTheMarkAndOnlyALinkTo24A', () => {
  it('a card with a pending proposal shows Salida propuesta, the mark and Responder propuesta, which opens 24A', async () => {
    const line = await render(ProposedDepartureLineComponent, {}, { reservationId: 'RES-1829' });
    expect(line.flat()).toBe('Salida propuesta: 23 oct 2026 · 06:30');
    TestBed.resetTestingModule();
    const mark = await render(ReschedulingMarkComponent, {}, { reservationId: 'RES-1829' });
    expect(mark.host.querySelector('strong.crp-status.crp-is-pending')?.textContent).toBe('Pendiente de respuesta de reprogramación');
    TestBed.resetTestingModule();
    const action = await render(RespondProposalActionComponent, {}, { reservationId: 'RES-1829' });
    action.button('Responder propuesta')!.click();
    expect(action.navigation.selected()).toBe(PROPOSAL_AREA);
    expect(action.navigation.params()).toEqual({ reservation: 'RES-1829' });
  });

  it('a card without a pending proposal draws nothing', async () => {
    for (const component of [ProposedDepartureLineComponent, ReschedulingMarkComponent, RespondProposalActionComponent] as Type<unknown>[]) {
      const s = await render(component, {}, { reservationId: 'RES-1828' });
      expect(s.flat()).toBe('');
      TestBed.resetTestingModule();
    }
  });

  it('the notice of 17 names the reservation and links to 24A with the mockup text', async () => {
    const s = await render(ReschedulingNoticesComponent);
    expect(s.flat()).toBe('Reserva RES-1829: la salida fue cancelada por una causa no atribuible al cliente. Hay una propuesta de nueva salida pendiente de tu respuesta dentro del plazo aplicable. Responder propuesta de reprogramación');
    s.button('Responder propuesta de reprogramación')!.click();
    expect(s.navigation.params()).toEqual({ reservation: 'RES-1829' });
  });

  it('contributes to Mis reservas and 17 in the mockup order, and injects no writer there', () => {
    const slots = RESCHEDULING_CONTRIBUTIONS.map((p) => p as { provide: unknown; useValue: { component: unknown; order: number } });
    expect(slots.map((p) => [p.provide, p.useValue.order])).toEqual([[RESERVATION_CARD_EXTRAS, 5], [RESERVATION_CARD_EXTRAS, 20], [RESERVATION_CARD_ACTIONS, 0], [CLIENT_NOTICES, 10]]);
    const code = withoutComments(readFileSync('src/app/rescheduling/components/rescheduling-contributions.component.ts', 'utf8'));
    expect(code).not.toMatch(/ProposalAnswerWriter|ReschedulingWriter/);
  });
});

describe('reschedulingTextsAreSpanishAndUseFormatCopAndFormatDate', () => {
  const css = readFileSync('src/styles/portal.css', 'utf8');
  const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.trim().startsWith(selector + ' {'))?.split('{')[1] ?? '';

  it('draws the mark of a Mis reservas card as the small status tag of the mockup, not as the card title', () => {
    expect(rule('.crp-root .self-service-card-copy strong.crp-status')).toMatch(/font-size:\s*0\.72rem/);
  });

  it('keeps the status column at the top, so the badge is not stretched by a taller card', () => {
    expect(rule('.crp-root .self-service-card-status')).toMatch(/align-content:\s*start/);
  });

  it('lays Responder propuesta across the card, at its end, as travel-dashboard-reservation-actions', () => {
    expect(rule('.crp-root .self-service-card > crp-rescheduling-card-action')).toMatch(/grid-column:\s*1 \/ -1/);
    expect(rule('.crp-root .crp-rescheduling-card-actions')).toMatch(/justify-content:\s*flex-end/);
  });
});

import { readFileSync } from 'node:fs';
import { Injector, Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { DemoCancellationQuote, DemoCancellationWriter, FixedClock } from '../src/app/demo/reservation-changes-demo';
import {
  DemoModificationQuote, DemoReservationModificationWriter, DemoTransportFare, recalculateReservation,
} from '../src/app/demo/reservation-modification-demo';
import { CancellationQuote, CancellationWriter, cancellationChangeType } from '../src/app/reservation-changes/data/cancellation-ports';
import { RESERVATION_CHANGE_SCREEN, RESERVATION_CHANGE_TYPES, ReservationChangeType } from '../src/app/reservation-changes/data/reservation-change-types';
import { ReservationChangePageComponent } from '../src/app/reservation-changes/pages/reservation-change-page.component';
import {
  Admission, ModificationQuote, ModifyCommand, TRAVELLERS_MODIFICATION_KEY, TransportFareSource, provideTravellersModification,
} from '../src/app/reservation-changes/travellers-modification/data/modification-ports';
import { TravellersModificationFormComponent } from '../src/app/reservation-changes/travellers-modification/components/travellers-modification-form.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { departureOf, reservationOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-012 (#178): modify a reservation before execution. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
const BY = 'Colaborador operativo';
const CLOSED_TOUR = 'Tour cerrado';
/** 2 people, Kayak 4000 (2000 each), transport 1000 (500 each), 10 % fixed at creation on the original value: final 4500. */
const fixed = (id: string, over: Partial<Reservation> = {}) => reservationOf(id, {
  status: 'CONFIRMADA', seatHeld: true, departureId: 'dep-1',
  quote: { services: [{ name: 'Kayak', cents: 4000 }], transportCents: 1000, projectedCents: 5000,
    discounts: [{ name: 'Temporada (demo)', base: 'ORIGINAL_VALUE', amountCents: 500 }], discountCents: 500, finalCents: 4500 },
  balanceCents: 4500, ...over,
});
const fixtures = () => new DemoReservationsStore([
  fixed('RES-A'), fixed('RES-B', { status: 'PENDIENTE_DE_PAGO', seatHeld: false }),
  fixed('RES-C', { status: 'EN_EJECUCION' }), fixed('RES-D', { status: 'FINALIZADA' }), fixed('RES-E', { status: 'CANCELADA', seatHeld: false }),
  fixed('RES-F', { tourName: CLOSED_TOUR }),
]);
const departures = (capacity = 10) => ({ items: [departureOf(1, { effectiveCapacity: capacity })] });
const demo = (store = fixtures(), d = departures(), fare: TransportFareSource = new DemoTransportFare(d)) => {
  const quotes = new DemoModificationQuote(store, fare, [CLOSED_TOUR]);
  return { store, quotes, writer: new DemoReservationModificationWriter(store, d, quotes, () => NOW, BY) };
};
const find = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!;
const command = (code: string, added: number, removed = 0, idempotencyKey = 'k1'): ModifyCommand =>
  ({ code, change: { added, removed }, cause: 'El cliente suma un acompañante', idempotencyKey });

class ControllableModificationQuote extends ModificationQuote {
  readonly requests: Subject<Admission | null>[] = [];
  override admits(): Observable<Admission | null> { const s = new Subject<Admission | null>(); this.requests.push(s); return s; }
  override preview() { return of(null); }
}

function pageProviders(o: { code?: string; role?: string; quotes?: ModificationQuote } = {}) {
  const navigation = new PortalNavigation();
  navigation.register(['reservations', RESERVATION_CHANGE_SCREEN]);
  navigation.params.set({ reservation: o.code ?? 'RES-A' });
  const store = fixtures(), cancel = new DemoCancellationQuote(store), m = demo(store);
  return [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'OPERATIONAL_COLLABORATOR') as never) },
    { provide: ReservationsSource, useValue: store },
    { provide: CancellationQuote, useValue: cancel },
    { provide: CancellationWriter, useValue: new DemoCancellationWriter(store, cancel, new FixedClock(NOW), BY) },
    { provide: ModificationQuote, useValue: o.quotes ?? m.quotes },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
    { provide: RESERVATION_CHANGE_TYPES, multi: true, useFactory: cancellationChangeType },
    provideTravellersModification(),
  ] as Provider[];
}

async function render<T>(component: Type<T>, list: Provider[], inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: list });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  return { host, settle, button };
}
async function pageWithTravellers(o: Parameters<typeof pageProviders>[0] = {}) {
  const s = await render(ReservationChangePageComponent, pageProviders(o));
  const select = s.host.querySelector('select')!;
  select.value = TRAVELLERS_MODIFICATION_KEY; select.dispatchEvent(new Event('change')); await s.settle();
  return s;
}
const ALLOWED = 'La política del tour admite la modificación de viajeros en esta reserva.';
const NOT_ALLOWED = 'La política del tour no admite la modificación de viajeros en esta reserva.';

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('covers travellers-modification/ and its demo with no HTTP client, request or storage of its own', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/reservation-changes/travellers-modification/') || f === 'src/app/demo/reservation-modification-demo.ts');
    expect(files).toHaveLength(4);
    const offenders = files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('travellersOptionShowsOneOfTheFourStates', () => {
  it('shows loading, error with a retry that asks again, empty when the reservation is unknown, and data', async () => {
    const quotes = new ControllableModificationQuote();
    const s = await render(TravellersModificationFormComponent, [{ provide: ModificationQuote, useValue: quotes }], { reservation: fixed('RES-A') });
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    quotes.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    expect(quotes.requests).toHaveLength(2);
    quotes.requests[1].next(null); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent).toContain('No se encontró la reserva seleccionada.');
  });

  it('shows the answer of the port in a status region', async () => {
    const quotes = new ControllableModificationQuote();
    const s = await render(TravellersModificationFormComponent, [{ provide: ModificationQuote, useValue: quotes }], { reservation: fixed('RES-A') });
    quotes.requests[0].next({ kind: 'allowed' }); await s.settle();
    const answer = s.host.querySelector('[data-state="data"]')!;
    expect(answer.getAttribute('role')).toBe('status');
    expect(answer.textContent?.trim()).toBe(ALLOWED);
  });
});

describe('travellersEntryIsProvidedThroughTheChangeTypesToken', () => {
  it('provides one entry, Modificación de viajeros, with its form and Registrar novedad kept disabled (DP-MD5)', () => {
    TestBed.configureTestingModule({ providers: [provideTravellersModification(), { provide: ModificationQuote, useValue: demo().quotes }] });
    const types = TestBed.inject(RESERVATION_CHANGE_TYPES) as readonly ReservationChangeType[];
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({ key: TRAVELLERS_MODIFICATION_KEY, label: 'Modificación de servicio, salida o viajeros', submittable: false, form: TravellersModificationFormComponent });
  });

  it('lists Tipo as Cancelación then Modificación de viajeros on the screen of HU-COM-013', async () => {
    const s = await render(ReservationChangePageComponent, pageProviders());
    expect(Array.from(s.host.querySelectorAll('#crp-rc-type option'), (o) => o.textContent?.trim())).toEqual(['Cancelación', 'Modificación de servicio, salida o viajeros']);
  });

  it('is wired in the demo build: from 10A the option answers the tour policy', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const cleanup = entry.mountWith(host, { apiClient: { request: vi.fn() } as never, session: { roles: ['OPERATIONAL_COLLABORATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    try {
      const click = (selector: string, label: string) =>
        Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();
      await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
      click('nav button', 'Reservas');
      await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
      Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('#RES-1842'))!.querySelector('button')!.click();
      await vi.waitFor(() => expect(host.querySelector('header')?.textContent).toContain('Cancelar o modificar reserva'));
      click('header button', 'Cancelar o modificar reserva');
      await vi.waitFor(() => expect(host.querySelector('select')).toBeTruthy());
      const select = host.querySelector('select')!;
      select.value = TRAVELLERS_MODIFICATION_KEY; select.dispatchEvent(new Event('change'));
      await vi.waitFor(() => expect(host.querySelector('app-travellers-modification-form [data-state="data"]')?.textContent?.trim()).toBe(NOT_ALLOWED));
      expect(Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Registrar novedad')!.disabled).toBe(true);
    } finally { cleanup(); host.remove(); }
  });
});

describe('modificationNotAllowedByTheTourPolicyIsRejected', () => {
  it('answers not allowed for the tour of the policy and the writer changes nothing', async () => {
    const { store, quotes, writer } = demo();
    expect(await firstValueFrom(quotes.admits('RES-F'))).toEqual({ kind: 'refused', reason: 'not-allowed' });
    expect(await firstValueFrom(quotes.admits('RES-A'))).toEqual({ kind: 'allowed' });
    const before = find(store, 'RES-F');
    expect(await firstValueFrom(writer.modify(command('RES-F', 1)))).toEqual({ kind: 'refused', reason: 'not-allowed' });
    expect(find(store, 'RES-F')).toBe(before);
    expect(store.modifications).toEqual([]);
  });

  it('shows why when the option is chosen', async () => {
    const s = await pageWithTravellers({ code: 'RES-F' });
    expect(s.host.querySelector('app-travellers-modification-form [data-state="data"]')?.textContent?.trim()).toBe(NOT_ALLOWED);
  });
});

describe('startedFinishedOrCancelledReservationOffersNoTravellersOption', () => {
  it.each(['RES-C', 'RES-D', 'RES-E'])('%s: the port refuses, the writer refuses and the screen keeps Tipo closed', async (code) => {
    const { quotes, writer } = demo();
    expect(await firstValueFrom(quotes.admits(code))).toEqual({ kind: 'refused', reason: 'not-before-execution' });
    expect(await firstValueFrom(writer.modify(command(code, 1)))).toEqual({ kind: 'refused', reason: 'not-before-execution' });
    const s = await render(ReservationChangePageComponent, pageProviders({ code }));
    expect(s.host.querySelector('select')!.disabled).toBe(true);
    expect(s.host.querySelector('app-travellers-modification-form')).toBeNull();
  });
});

describe('addingATravellerRecalculatesValueWithTheDiscountsFixedAtCreation', () => {
  it('keeps the 10 % fixed at creation although no discount is in force today', async () => {
    const { store, writer } = demo();
    const outcome = await firstValueFrom(writer.modify(command('RES-A', 1)));
    expect(outcome.kind).toBe('modified');
    const r = find(store, 'RES-A');
    expect(r.people).toBe(3);
    expect(r.quote).toEqual({ services: [{ name: 'Kayak', cents: 6000 }], transportCents: 1500, projectedCents: 7500,
      discounts: [{ name: 'Temporada (demo)', base: 'ORIGINAL_VALUE', amountCents: 750 }], discountCents: 750, finalCents: 6750 });
  });
});

describe('transportComesFromTheFarePort', () => {
  it('multiplies the per-person fare the port answers', () => {
    const fare = new (class extends TransportFareSource { override perPerson() { return 900; } })();
    expect(recalculateReservation(fixed('RES-A'), 3, fare.perPerson()).quote.transportCents).toBe(2700);
    expect(new DemoTransportFare(departures()).perPerson(fixed('RES-A'))).toBe(500);
    expect(new DemoTransportFare({ items: [] }).perPerson(fixed('RES-A', { departureId: undefined }))).toBe(500);
  });
});

describe('registeredPaymentsStayInsideTheNewBalance', () => {
  it('subtracts the validated payments from the new final value and keeps the payment lines', async () => {
    const payments = [{ id: 'RES-A-P1', method: 'CASH_AT_OFFICE', amountCents: 1000, proofName: null, proofStatus: 'SIN_COMPROBANTE' as const, registeredBy: BY }];
    const store = new DemoReservationsStore([fixed('RES-A', { validatedCents: 3000, balanceCents: 1500, financialStatus: 'PARCIAL', payments })]);
    await firstValueFrom(demo(store).writer.modify(command('RES-A', 1)));
    expect(find(store, 'RES-A')).toMatchObject({ balanceCents: 3750, validatedCents: 3000, financialStatus: 'PARCIAL', payments });
  });
});

describe('aRetriedModificationReusesItsIdempotencyKey', () => {
  it('answers the first outcome again for the same key', async () => {
    const { writer } = demo();
    const first = await firstValueFrom(writer.modify(command('RES-A', 1)));
    expect(await firstValueFrom(writer.modify(command('RES-A', 1)))).toBe(first);
  });
});

describe('aCallAfterSuccessCreatesNoSecondModification', () => {
  it('leaves one trace and one added traveller after a repeated call', async () => {
    const { store, writer } = demo();
    await firstValueFrom(writer.modify(command('RES-A', 1)));
    await firstValueFrom(writer.modify(command('RES-A', 1)));
    expect(find(store, 'RES-A').people).toBe(3);
    expect(store.modifications).toHaveLength(1);
  });
});

describe('increaseOnAConfirmedReservationKeepsItConfirmedWithADifferencePending', () => {
  it('stays Confirmada, recalculates the balance on the new final value and traces the difference', async () => {
    const { store, quotes, writer } = demo();
    expect(await firstValueFrom(quotes.preview('RES-A', { added: 1, removed: 0 })))
      .toMatchObject({ balanceCents: 6750, differenceCents: 2250, excessCents: 0 });
    await firstValueFrom(writer.modify(command('RES-A', 1)));
    expect(find(store, 'RES-A')).toMatchObject({ status: 'CONFIRMADA', balanceCents: 6750 });
    expect(store.modifications[0]).toMatchObject({ differenceCents: 2250, decision: null });
  });
});

describe('valueUnderValidatedPaymentsRecordsAnExcessPendingDecision', () => {
  it('leaves the excess pending the Excedente por modificación decision and refunds nothing', async () => {
    const store = new DemoReservationsStore([fixed('RES-A', { validatedCents: 4500, balanceCents: 0 })]);
    await firstValueFrom(demo(store).writer.modify(command('RES-A', 0, 1)));
    expect(find(store, 'RES-A')).toMatchObject({ people: 1, balanceCents: 0, validatedCents: 4500 });
    expect(find(store, 'RES-A').quote.finalCents).toBe(2250);
    expect(store.modifications[0].decision).toEqual({ kind: 'MODIFICATION_EXCESS', excessCents: 2250, outcome: null });
  });
});

describe('addingTravellersBeyondCapacityIsRejected', () => {
  it('refuses on a full departure and changes nothing', async () => {
    const store = new DemoReservationsStore([fixed('RES-A'), fixed('RES-G', { people: 1 })]);
    const { writer } = demo(store, departures(3));
    const before = find(store, 'RES-A');
    expect(await firstValueFrom(writer.modify(command('RES-A', 1)))).toEqual({ kind: 'refused', reason: 'no-capacity' });
    expect(find(store, 'RES-A')).toBe(before);
    expect(store.modifications).toEqual([]);
  });
});

describe('removingTravellersReleasesTheirSeatsAtOnce', () => {
  it('frees the seat in the same step, so another reservation can take it', async () => {
    const store = new DemoReservationsStore([fixed('RES-A'), fixed('RES-G', { people: 1 })]);
    const { writer } = demo(store, departures(3));
    expect((await firstValueFrom(writer.modify(command('RES-A', 0, 1)))).kind).toBe('modified');
    expect((await firstValueFrom(writer.modify(command('RES-G', 1, 0, 'k2')))).kind).toBe('modified');
    expect([find(store, 'RES-A').people, find(store, 'RES-G').people]).toEqual([1, 2]);
  });
});

describe('modificationKeepsValuesBalanceCauseAndUser', () => {
  it('traces original value, recalculated value, resulting balance, cause, user and instant', async () => {
    const { store, writer } = demo();
    const outcome = await firstValueFrom(writer.modify(command('RES-A', 1)));
    const trace = { reservationCode: 'RES-A', originalCents: 4500, recalculatedCents: 6750, balanceCents: 6750, differenceCents: 2250,
      cause: 'El cliente suma un acompañante', by: BY, at: NOW, decision: null };
    expect(store.modifications).toEqual([trace]);
    expect(outcome).toEqual({ kind: 'modified', reservation: find(store, 'RES-A'), trace });
  });
});

describe('readOnlyRolesAndCustomersGetNoModificationAction', () => {
  const area = PORTAL_AREAS.find((a) => a.key === RESERVATION_CHANGE_SCREEN)!;
  it('keeps the screen that carries the option away from Manager, Accountant, Analyst and an unknown role', () => {
    const injectorAs = (role: string) => Injector.create({ providers: [
      { provide: PortalCapabilities, useValue: PortalCapabilities.for(role) }, { provide: ReservationsSource, useValue: fixtures() },
      { provide: CancellationQuote, useValue: new DemoCancellationQuote(fixtures()) }, { provide: CancellationWriter, useValue: {} },
      { provide: ModificationQuote, useValue: demo().quotes },
    ] });
    expect(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'SOMEONE'].map((r) => area.isAvailable!(injectorAs(r))))
      .toEqual([true, false, false, false, false]);
  });

  it('finds no modification port or option in the customer area', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/self-service-reservation/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /travellers-modification|ModificationQuote|ReservationModificationWriter/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('travellersOptionDrawsNoFieldAndSpanishCopy', () => {
  it('draws only the answer: no traveller, service, date, lodging or recalculation field', async () => {
    const s = await pageWithTravellers();
    const form = s.host.querySelector('app-travellers-modification-form')!;
    expect(form.querySelectorAll('input, select, textarea, button, dl, table')).toHaveLength(0);
    expect(form.textContent?.trim()).toBe(ALLOWED);
    expect(s.button('Registrar novedad')!.disabled).toBe(true);
  });

  it('draws Origen and Tratamiento económico only for the cancellation (admin-cancelar-modificar-reserva.html)', async () => {
    const s = await render(ReservationChangePageComponent, pageProviders());
    const drawn = () => [s.host.querySelector('#crp-rc-origin'), s.host.querySelector('#crp-rc-treatment')].map((e) => e !== null);
    expect(drawn()).toEqual([true, true]);
    const select = s.host.querySelector<HTMLSelectElement>('#crp-rc-type')!;
    select.value = TRAVELLERS_MODIFICATION_KEY; select.dispatchEvent(new Event('change')); await s.settle();
    expect(drawn()).toEqual([false, false]);
    select.value = 'cancellation'; select.dispatchEvent(new Event('change')); await s.settle();
    expect(drawn()).toEqual([true, true]);
  });

  it('keeps the copy in Spanish without raw codes, and the code free of the mockup script fields', () => {
    const code = listSourceFiles().filter((f) => f.startsWith('src/app/reservation-changes/travellers-modification/'))
      .map((f) => withoutComments(readFileSync(f, 'utf8'))).join('\n');
    expect(code).not.toMatch(/alojamiento|hospedaje|fecha de salida|Pendiente de parametrización comercial/i);
    const copy = readFileSync('src/app/reservation-changes/travellers-modification/travellers-modification-copy.ts', 'utf8');
    expect(copy).toContain('Modificación de servicio, salida o viajeros');
    expect(copy).toMatch(/política|modificación/);
  });
});

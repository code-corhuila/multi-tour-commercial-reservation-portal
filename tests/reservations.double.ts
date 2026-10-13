import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { ActorContext, CatalogItemsSource, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { DeparturesSource } from '../src/app/reservations/data/departures-source';
import { LeadCustomersSource, ReservationDiscounts } from '../src/app/reservations/data/reservation-integrations';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { ReservationsWriter } from '../src/app/reservations/data/reservations-writer';
import { AppliedDiscount, CreateReservationCommand, Departure, Reservation } from '../src/app/reservations/model/reservation';
import { actorAs } from './actor-context.double';
import { itemNamed } from './catalog-items-source.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

/** An invented departure: Programada, open, 10 seats, 5.00 of transport per person, unless a test says otherwise. */
export const departureOf = (n: number, over: Partial<Departure> = {}): Departure => ({
  id: `dep-${n}`, tourName: `Tour ${n}`, date: '2026-11-07', state: 'PROGRAMADA', openForReservations: true,
  effectiveCapacity: 10, transportPerPersonCents: 500, conditions: 'Changes up to 72 hours before (demo).', ...over,
});
export const serviceOf = (name: string, baseRateCents: number, over: Partial<CatalogItem> = {}): CatalogItem =>
  ({ ...itemNamed(name), serviceId: `svc-${name}`, baseRateCents, ...over });
export const reservationOf = (id: string, over: Partial<Reservation> = {}): Reservation => ({
  id, leadCustomerName: 'Lead Demo', tourName: 'Tour 1', departureDate: '2026-11-07', conditions: 'Demo conditions', people: 2,
  quote: { services: [{ name: 'Kayak', cents: 4000 }], transportCents: 1000, projectedCents: 5000, discounts: [], finalCents: 5000 },
  status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false, ...over,
});

/** A source that answers only when the test decides. */
export class ControllableList<T> {
  readonly requests: { reply: (items: readonly T[]) => void; fail: () => void }[] = [];
  list(): Observable<readonly T[]> {
    const answers = new Subject<readonly T[]>();
    this.requests.push({ reply: (items) => { answers.next(items); answers.complete(); }, fail: () => answers.error(new Error('down')) });
    return answers;
  }
}
export class StubDepartures extends DeparturesSource {
  constructor(public answer: () => Observable<readonly Departure[]>) { super(); }
  override list() { return this.answer(); }
}
export class StubCustomers extends LeadCustomersSource {
  override list() { return of([{ id: 'cus-1', fullName: 'Lead Demo' }]); }
}
export class StubDiscounts extends ReservationDiscounts {
  lines: AppliedDiscount[] = [];
  readonly bases: number[] = [];
  override apply(originalCents: number) { this.bases.push(originalCents); return this.lines; }
}
export class StubCatalog extends CatalogItemsSource {
  constructor(private readonly items: readonly CatalogItem[]) { super(); }
  override list() { return of(this.items); }
}
export class ControllableReservationsWriter extends ReservationsWriter {
  readonly calls: { command: CreateReservationCommand; key: string; reply: (r: Reservation) => void; fail: (e: unknown) => void }[] = [];
  override create(command: CreateReservationCommand, key: string): Observable<Reservation> {
    const answers = new Subject<Reservation>();
    this.calls.push({ command, key, reply: (r) => { answers.next(r); answers.complete(); }, fail: (e) => answers.error(e) });
    return answers;
  }
}
export class ControllableReservations extends ReservationsSource {
  readonly inner = new ControllableList<Reservation>();
  override list() { return this.inner.list(); }
}

export const DEFAULT_DEPARTURES = [departureOf(1), departureOf(2, { state: 'CANCELADA' }),
  departureOf(3, { openForReservations: false }), departureOf(4, { effectiveCapacity: 2 })];
export const DEFAULT_SERVICES = [serviceOf('Kayak', 1999), serviceOf('Lunch', 2500), serviceOf('Closed', 900, { catalogStatus: 'INACTIVE' })];

/** Providers every reservation screen needs; a test overrides only what it controls. */
export function reservationProviders(over: { role?: string; departures?: DeparturesSource; writer?: ReservationsWriter;
  reservations?: ReservationsSource; discounts?: ReservationDiscounts; keys?: IdempotencyKeys } = {}) {
  return [
    { provide: ActorContext, useValue: actorAs((over.role ?? 'OPERATIONAL_COLLABORATOR') as never) },
    { provide: DeparturesSource, useValue: over.departures ?? new StubDepartures(() => of(DEFAULT_DEPARTURES)) },
    { provide: LeadCustomersSource, useValue: new StubCustomers() },
    { provide: CatalogItemsSource, useValue: new StubCatalog(DEFAULT_SERVICES) },
    { provide: ReservationDiscounts, useValue: over.discounts ?? new StubDiscounts() },
    { provide: ReservationsWriter, useValue: over.writer ?? new ControllableReservationsWriter() },
    { provide: ReservationsSource, useValue: over.reservations ?? new ControllableReservations() },
    { provide: IdempotencyKeys, useValue: over.keys ?? new ControllableIdempotencyKeys() },
  ];
}

/** Creates a component and returns helpers that act as a person would. */
export async function screenOf<T>(component: Type<T>, providers: unknown[]) {
  TestBed.configureTestingModule({ providers: providers as never });
  const fixture = TestBed.createComponent(component), element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const field = <E extends HTMLElement>(name: string) => element.querySelector<E>(`[name="${name}"]`)!;
  const choose = async (name: string, value: string) => {
    const select = field<HTMLSelectElement>(name); select.value = value; select.dispatchEvent(new Event('change')); await settle();
  };
  const type = async (name: string, value: string) => {
    const input = field<HTMLInputElement>(name); input.value = value; input.dispatchEvent(new Event('input')); await settle();
  };
  const tick = async (serviceId: string) => { element.querySelector<HTMLInputElement>(`input[value="${serviceId}"]`)!.click(); await settle(); };
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const click = async (text: string) => { button(text)!.click(); await settle(); };
  const submit = async () => { element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  await settle();
  return { fixture, element, settle, field, choose, type, tick, button, click, submit };
}

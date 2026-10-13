import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { LeadCustomersSource, ReservationDiscounts } from '../reservations/data/reservation-integrations';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { DemoReservationQuotes } from './reservation-quote-demo';
import type { ModificationTrace } from '../reservation-changes/travellers-modification/data/modification-ports';
import { AppliedDiscount, CreateReservationCommand, Departure, Reservation, capacityMessage, hasCapacity, openDepartures } from '../reservations/model/reservation';

// DEMO (gaps G-DEMO, G-OPS, G-DEP): invented departures, customers and reservations, in memory.
const CONDITIONS = 'Changes up to 72 hours before departure; cancellation as the tour policy states (demo text, DP-RC4).';
const departure = (n: number, tourName: string, date: string, state: Departure['state'], open: boolean, effectiveCapacity: number, transport: number): Departure =>
  ({ id: `demo-dep-${n}`, tourName, date, state, openForReservations: open, effectiveCapacity, transportPerPersonCents: transport, conditions: CONDITIONS });
const CUSTOMERS = [{ id: 'demo-cus-1', fullName: 'Camila Ortega (demo)' }, { id: 'demo-cus-2', fullName: 'Andrés Pinto (demo)' },
  { id: 'demo-cus-3', fullName: 'Laura Gómez (demo)' }];
/** Two reservations already registered, so the list shows screen 10 with data. */
const SEEDED: Reservation[] = [
  { id: 'RES-1842', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa al atardecer', departureDate: '2026-11-07', conditions: CONDITIONS, people: 2,
    quote: { services: [{ name: 'Guianza (demo)', cents: 80_000_000 }], transportCents: 5_000_000, projectedCents: 85_000_000, discounts: [], discountCents: 0, finalCents: 85_000_000 }, balanceCents: 85_000_000,
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false },
  { id: 'RES-1841', leadCustomerName: 'Mateo Ríos (demo)', tourName: 'Ruta del café en Pitalito', departureDate: '2026-11-14', conditions: CONDITIONS, people: 1,
    quote: { services: [{ name: 'Guianza (demo)', cents: 40_000_000 }], transportCents: 1_800_000, projectedCents: 41_800_000, discounts: [], discountCents: 0, finalCents: 41_800_000 }, balanceCents: 41_800_000,
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false },
];
/** HU-COM-013 (tasks T-08): one reservation per state the cancellation tells apart; codes below the writer's sequence. */
const inState = (id: string, status: Reservation['status'], over: Partial<Reservation> = {}): Reservation =>
  ({ ...SEEDED[1], id, status, seatHeld: status !== 'PENDIENTE_DE_PAGO' && status !== 'CANCELADA', ...over });
SEEDED.push(inState('RES-1839', 'CONFIRMADA', { leadCustomerName: 'Camila Ortega (demo)', validatedCents: 30_000_000, balanceCents: 11_800_000, financialStatus: 'PARCIAL' }),
  inState('RES-1838', 'EN_EJECUCION'), inState('RES-1837', 'FINALIZADA'), inState('RES-1836', 'CANCELADA'),
  inState('RES-1835', 'CONFIRMADA', { leadCustomerName: 'Andrés Pinto (demo)', reschedulingPending: true }));

export class DemoDeparturesStore extends DeparturesSource {
  readonly items: Departure[] = [
    departure(1, 'Desierto de la Tatacoa al atardecer', '2026-11-07', 'PROGRAMADA', true, 10, 2_500_000),
    departure(2, 'Ruta del cafe en Pitalito', '2026-11-14', 'PROGRAMADA', true, 2, 1_800_000),
    departure(3, 'Canotaje en el Rio Suaza', '2026-11-21', 'PROGRAMADA', false, 8, 2_000_000),
    departure(4, 'Caminata al Nevado del Huila', '2026-10-30', 'CANCELADA', true, 12, 3_000_000),
  ];
  override list(): Observable<readonly Departure[]> { return of([...this.items]); }
}

export class DemoLeadCustomers extends LeadCustomersSource {
  override list() { return of(CUSTOMERS); }
}

/** Zero discounts until HU-COM-004 merges; then its calculation replaces this class. */
export class DemoReservationDiscounts extends ReservationDiscounts {
  override apply(): readonly AppliedDiscount[] { return []; }
}

export class DemoReservationsStore extends ReservationsSource {
  /** HU-COM-012 plan D-02: the modification traces of every reservation, in the same store. */
  readonly modifications: ModificationTrace[] = [];
  constructor(public items: Reservation[] = []) { super(); }
  override list(): Observable<readonly Reservation[]> { return of([...this.items]); }
}

/** Checks the departure and its capacity without holding a seat; one reservation per Idempotency-Key. */
export class DemoReservationsWriter extends ReservationsWriter {
  private readonly byKey = new Map<string, Reservation>();
  private sequence = 100;
  constructor(private readonly store: DemoReservationsStore, private readonly departures: DemoDeparturesStore) { super(); }
  override create(c: CreateReservationCommand, key: string): Observable<Reservation> {
    const known = this.byKey.get(key);
    if (known) return of(known);
    const d = openDepartures(this.departures.items).find((x) => x.id === c.departureId);
    if (!d) return throwError(() => ({ status: 409, code: 'departure-not-open', userMessage: 'The departure is not open for reservations.' }));
    if (!hasCapacity(d, c.people)) return throwError(() => ({ status: 409, code: 'insufficient-capacity', userMessage: capacityMessage(d) }));
    const created: Reservation = {
      id: `demo-res-${++this.sequence}`, leadCustomerName: CUSTOMERS.find((x) => x.id === c.leadCustomerId)?.fullName ?? c.leadCustomerId,
      departureLabel: `${d.tourName} · ${d.date}`, conditions: d.conditions, people: c.people, quote: c.quote,
      status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false,
    };
    this.byKey.set(key, created);
    this.store.items = [created, ...this.store.items];
    return of(created);
  }
}

/** The reservation ports over the demo stores; mount-entry adds them until the -api exists (gap G-B). */
export function reservationDemoProviders(): Provider[] {
  const departures = new DemoDeparturesStore(), store = new DemoReservationsStore();
  return [
    { provide: DeparturesSource, useValue: departures },
    { provide: LeadCustomersSource, useValue: new DemoLeadCustomers() },
    { provide: ReservationDiscounts, useValue: new DemoReservationDiscounts() },
    { provide: ReservationsSource, useValue: store },
    { provide: ReservationsWriter, useValue: new DemoReservationsWriter(store, departures) },
  ];
}

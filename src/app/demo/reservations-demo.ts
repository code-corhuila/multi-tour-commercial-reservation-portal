import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { LeadCustomersSource, ReservationDiscounts } from '../reservations/data/reservation-integrations';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { AppliedDiscount, CreateReservationCommand, Departure, Reservation, capacityMessage, hasCapacity, openDepartures } from '../reservations/model/reservation';

// DEMO (gaps G-DEMO, G-OPS, G-DEP): invented departures, customers and reservations, in memory.
const CONDITIONS = 'Cambios hasta 72 horas antes de la salida; cancelación según la política del tour (texto de demostración, DP-RC4).';
const departure = (n: number, tourName: string, date: string, state: Departure['state'], open: boolean, effectiveCapacity: number, transport: number): Departure =>
  ({ id: `demo-dep-${n}`, tourName, date, state, openForReservations: open, effectiveCapacity, transportPerPersonCents: transport, conditions: CONDITIONS });
const CUSTOMERS = [{ id: 'demo-cus-1', fullName: 'Camila Ortega (demo)' }, { id: 'demo-cus-2', fullName: 'Andrés Pinto (demo)' }];
/** Two reservations already registered, so the list shows screen 10 with data. */
const SEEDED: Reservation[] = [
  { id: 'RES-1842', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa al atardecer', departureDate: '2026-11-07', conditions: CONDITIONS, people: 2,
    quote: { services: [{ name: 'Guianza (demo)', cents: 80_000_000 }], transportCents: 5_000_000, projectedCents: 85_000_000, discounts: [], finalCents: 85_000_000 },
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false },
  { id: 'RES-1841', leadCustomerName: 'Mateo Ríos (demo)', tourName: 'Ruta del café en Pitalito', departureDate: '2026-11-14', conditions: CONDITIONS, people: 1,
    quote: { services: [{ name: 'Guianza (demo)', cents: 40_000_000 }], transportCents: 1_800_000, projectedCents: 41_800_000, discounts: [], finalCents: 41_800_000 },
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false },
];

export class DemoDeparturesStore extends DeparturesSource {
  readonly items: Departure[] = [
    departure(1, 'Desierto de la Tatacoa al atardecer', '2026-11-07', 'PROGRAMADA', true, 10, 2_500_000),
    departure(2, 'Ruta del café en Pitalito', '2026-11-14', 'PROGRAMADA', true, 2, 1_800_000),
    departure(3, 'Canotaje en el río Suaza', '2026-11-21', 'PROGRAMADA', false, 8, 2_000_000),
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
  constructor(public items: Reservation[] = []) { super(); }
  override list(): Observable<readonly Reservation[]> { return of([...this.items]); }
}

/** Checks the departure and its capacity without holding a seat; one reservation per Idempotency-Key. */
export class DemoReservationsWriter extends ReservationsWriter {
  private readonly byKey = new Map<string, Reservation>();
  private sequence = 1842;
  constructor(private readonly store: DemoReservationsStore, private readonly departures: DemoDeparturesStore) { super(); }
  override create(c: CreateReservationCommand, key: string): Observable<Reservation> {
    const known = this.byKey.get(key);
    if (known) return of(known);
    const d = openDepartures(this.departures.items).find((x) => x.id === c.departureId);
    if (!d) return throwError(() => ({ status: 409, code: 'departure-not-open', userMessage: 'La salida no está abierta para reservas.' }));
    if (!hasCapacity(d, c.people)) return throwError(() => ({ status: 409, code: 'insufficient-capacity', userMessage: capacityMessage(d) }));
    const created: Reservation = {
      id: `RES-${++this.sequence}`, leadCustomerName: CUSTOMERS.find((x) => x.id === c.leadCustomerId)?.fullName ?? c.leadCustomerId,
      tourName: d.tourName, departureDate: d.date, conditions: d.conditions, people: c.people, quote: c.quote,
      status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false,
    };
    this.byKey.set(key, created);
    this.store.items = [created, ...this.store.items];
    return of(created);
  }
}

/** The reservation ports over the demo stores; mount-entry adds them until the -api exists (gap G-B). */
export function reservationDemoProviders(): Provider[] {
  const departures = new DemoDeparturesStore(), store = new DemoReservationsStore([...SEEDED]);
  return [
    { provide: DeparturesSource, useValue: departures },
    { provide: LeadCustomersSource, useValue: new DemoLeadCustomers() },
    { provide: ReservationDiscounts, useValue: new DemoReservationDiscounts() },
    { provide: ReservationsSource, useValue: store },
    { provide: ReservationsWriter, useValue: new DemoReservationsWriter(store, departures) },
  ];
}

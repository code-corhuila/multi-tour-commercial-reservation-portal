import { Provider, inject } from '@angular/core';
import { Observable, map, of, throwError } from 'rxjs';
import { CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { DeparturesSource } from '../reservations/data/departures-source';
import { DiscountContext, LeadCustomersSource, ReservationDiscounts } from '../reservations/data/reservation-integrations';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { ReservationsWriter } from '../reservations/data/reservations-writer';
import { ReservationQuoteSource } from '../reservations/data/reservation-quote-source';
import { DiscountRule, discountValueText } from '../discounts/model/discount-rule';
import { DiscountRulesSource } from '../discounts/data/discount-rules-source';
import { applyDiscounts } from './discount-calculation';
import { DemoDiscountRulesStore } from './discounts-demo';
import { DemoReservationQuotes } from './reservation-quote-demo';
import type { ModificationTrace } from '../reservation-changes/travellers-modification/data/modification-ports';
import { AppliedDiscount, CreateReservationCommand, Departure, Reservation, ReservationPayment, capacityMessage, hasCapacity, openDepartures } from '../reservations/model/reservation';
import { RESCHEDULING_DEPARTURES, RESCHEDULING_SEEDS } from './rescheduling-seeds';
import type { CreditBalance, CreditRequest } from '../credit-balance/data/credit-balance-ports';
import type { CreditApplication } from './credit-overview-demo';

// DEMO (gaps G-DEMO, G-OPS, G-DEP): invented departures, customers and reservations, in memory.
const CONDITIONS = 'Cambios hasta 72 horas antes de la salida; cancelación según la política del tour (texto de demostración, DP-RC4).';
const departure = (n: number, tourName: string, date: string, state: Departure['state'], open: boolean, effectiveCapacity: number, transport: number): Departure =>
  ({ id: `demo-dep-${n}`, tourName, date, state, openForReservations: open, effectiveCapacity, transportPerPersonCents: transport, conditions: CONDITIONS });
const CUSTOMERS = [{ id: 'demo-cus-1', fullName: 'Camila Ortega (demo)' }, { id: 'demo-cus-2', fullName: 'Andrés Pinto (demo)' },
  { id: 'demo-cus-3', fullName: 'Laura Gómez (demo)' }];
/** Two reservations already registered, so the list shows screen 10 with data. */
const SEEDED: Reservation[] = [
  { id: 'RES-1842', leadCustomerName: 'Laura Gómez (demo)', tourName: 'Desierto de la Tatacoa al atardecer', departureDate: '2026-11-07', conditions: CONDITIONS, people: 2,
    quote: { services: [{ name: 'Guianza (demo)', cents: 80_000_000 }], transportCents: 5_000_000, projectedCents: 85_000_000, discounts: [], discountCents: 0, finalCents: 85_000_000 }, balanceCents: 85_000_000,
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false, departureId: 'demo-dep-1', paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER' },
  { id: 'RES-1841', leadCustomerName: 'Mateo Ríos (demo)', tourName: 'Ruta del café en Pitalito', departureDate: '2026-11-14', conditions: CONDITIONS, people: 1,
    quote: { services: [{ name: 'Guianza (demo)', cents: 40_000_000 }], transportCents: 1_800_000, projectedCents: 41_800_000, discounts: [], discountCents: 0, finalCents: 41_800_000 }, balanceCents: 41_800_000,
    status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false, departureId: 'demo-dep-2', paymentType: 'PARTIAL', paymentMethod: 'CASH_AT_OFFICE' },
];
/** HU-COM-014: the demo customer's situations of the mockup's demo data (app.js 2621-2626), coded below the writer's sequence. */
const ownAs = (id: string, tourName: string, departureDate: string, finalCents: number, over: Partial<Reservation>): Reservation => ({ ...SEEDED[0], id, tourName,
  departureDate, departureId: undefined, seatHeld: true, balanceCents: finalCents, ...over,
  quote: { services: [{ name: 'Guianza (demo)', cents: finalCents }], transportCents: 0, projectedCents: finalCents, discounts: [], discountCents: 0, finalCents } });
const proofOf = (id: string, amountCents: number, proofStatus: ReservationPayment['proofStatus'], presentedAt?: string): ReservationPayment[] =>
  [{ id: `${id}-P1`, method: 'BANK_TRANSFER', amountCents, proofName: `comprobante-transferencia-${id}.pdf`, proofStatus, registeredBy: 'Cliente (demo)', ...(presentedAt ? { presentedAt } : {}) }];
SEEDED.push(ownAs('RES-1840', 'Ruta Andina', '2026-09-18T06:30:00', 129_900_000, { payments: proofOf('RES-1840', 129_900_000, 'EN_VALIDACION', '2026-10-13T08:30:00-05:00') }),
  ownAs('RES-1832', 'Tour de ejemplo', '2026-09-20T07:00:00', 30_000_000, { status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO', paymentType: 'PARTIAL',
    validatedCents: 10_000_000, balanceCents: 20_000_000, payments: proofOf('RES-1832', 10_000_000, 'APROBADO') }),
  ownAs('RES-1831', 'Ruta Andina', '2026-09-22T06:30:00', 120_000_000, { status: 'CANCELADA', seatHeld: false, financialStatus: 'PARCIAL', paymentType: 'PARTIAL',
    validatedCents: 120_000_000, balanceCents: 0, payments: proofOf('RES-1831', 120_000_000, 'APROBADO'),
    cancellation: { cause: 'Cancelada por falta de pago', by: 'Administrador del tenant (demo)', at: '2026-09-15T09:00:00-05:00' } }),
  ownAs('RES-1830', 'Ruta Andina', '2026-09-18T06:30:00', 129_900_000, { status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO', validatedCents: 129_900_000,
    balanceCents: 0, payments: proofOf('RES-1830', 129_900_000, 'APROBADO') }));
/** HU-COM-013 (tasks T-08): one reservation per state the cancellation tells apart; codes below the writer's sequence. */
const inState = (id: string, status: Reservation['status'], over: Partial<Reservation> = {}): Reservation =>
  ({ ...SEEDED[1], departureId: undefined, id, status, seatHeld: status !== 'PENDIENTE_DE_PAGO' && status !== 'CANCELADA', ...over });
SEEDED.push(inState('RES-1839', 'CONFIRMADA', { leadCustomerName: 'Camila Ortega (demo)', validatedCents: 30_000_000, balanceCents: 11_800_000, financialStatus: 'ABONO_RECIBIDO' }),
  inState('RES-1838', 'EN_EJECUCION'), inState('RES-1837', 'FINALIZADA'), inState('RES-1836', 'CANCELADA'),
  inState('RES-1835', 'CONFIRMADA', { leadCustomerName: 'Andrés Pinto (demo)', reschedulingPending: true }));
/** HU-COM-010 (Pagos pendientes, AC-PV.2, AC-PV.4, AC-PV.5): two $300.000 Abono · Transferencia reservations with a proof En validación. */
const proof = (id: string, amountCents: number, presentedAt: string, over: Partial<ReservationPayment> = {}): ReservationPayment =>
  ({ id, method: 'BANK_TRANSFER', amountCents, proofName: 'soporte-demo.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)', presentedAt, ...over });
const ofAbono = (id: string, over: Partial<Reservation>): Reservation => ({ ...SEEDED[0], id, departureId: undefined, paymentType: 'PARTIAL', seatHeld: true, balanceCents: 30_000_000, quote: { services: [{ name: 'Guianza (demo)', cents: 30_000_000 }], transportCents: 0, projectedCents: 30_000_000, discounts: [], discountCents: 0, finalCents: 30_000_000 }, ...over });
SEEDED.push(ofAbono('RES-1834', { leadCustomerName: 'Juliana Cruz (demo)', status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO', validatedCents: 10_000_000, balanceCents: 20_000_000,
  payments: [proof('RES-1834-P1', 10_000_000, '2026-10-10T09:00:00-05:00', { proofStatus: 'APROBADO', review: { decision: 'APROBADO', verifiedAmountCents: 10_000_000,
    reason: 'Soporte legible (demo)', actorLabel: 'Administrador del tenant (demo)', decidedAt: '2026-10-10T15:00:00.000Z' } }), proof('RES-1834-P2', 5_000_000, '2026-10-12T09:00:00-05:00')] }),
  ofAbono('RES-1833', { leadCustomerName: 'Sofía Herrera (demo)', payments: [proof('RES-1833-P1', 10_000_000, '2026-10-13T09:00:00-05:00')] }));
/** HU-COM-018 (spec section 6): the affected reservations of the seeded cancelled departure. */
SEEDED.push(...RESCHEDULING_SEEDS);
/** HU-COM-017 AC-CB.3 (tasks T-07): Confirmada with $300.000 pending and a $500.000 proof En validación; approving it leaves a $200.000 excess. */
SEEDED.push(inState('RES-1822', 'CONFIRMADA', { leadCustomerName: 'Paula Rojas (demo)', paymentType: 'PARTIAL', paymentMethod: 'BANK_TRANSFER', validatedCents: 10_000_000, balanceCents: 30_000_000,
  financialStatus: 'PARCIAL', quote: { services: [{ name: 'Guianza (demo)', cents: 40_000_000 }], transportCents: 0, projectedCents: 40_000_000, discounts: [], discountCents: 0, finalCents: 40_000_000 },
  payments: [{ id: 'RES-1822-P1', method: 'BANK_TRANSFER', amountCents: 50_000_000, proofName: 'soporte-demo.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)' }] }));

export class DemoDeparturesStore extends DeparturesSource {
  readonly items: Departure[] = [
    departure(1, 'Desierto de la Tatacoa al atardecer', '2026-11-07', 'PROGRAMADA', true, 10, 2_500_000),
    departure(2, 'Ruta del café en Pitalito', '2026-11-14', 'PROGRAMADA', true, 2, 1_800_000),
    departure(3, 'Canotaje en el río Suaza', '2026-11-21', 'PROGRAMADA', false, 8, 2_000_000),
    departure(4, 'Caminata al Nevado del Huila', '2026-10-30', 'CANCELADA', true, 12, 3_000_000),
    ...RESCHEDULING_DEPARTURES,
  ];
  override list(): Observable<readonly Departure[]> { return of([...this.items]); }
}

export class DemoLeadCustomers extends LeadCustomersSource {
  override list() { return of(CUSTOMERS); }
}

/**
 * DEMO (HU-COM-003 T-V19-2): the rules of the tour the discounts story stores, through the shared calculation. The lines are
 * copied into the quote when the reservation is created, so a rule published later never touches it (AC-PD.15, RN-RES-003).
 */
export class DemoReservationDiscounts extends ReservationDiscounts {
  constructor(private readonly rules: () => readonly DiscountRule[] = () => []) { super(); }
  override apply(originalCents: number, context?: DiscountContext): readonly AppliedDiscount[] {
    if (!context) return [];
    const ofTour = this.rules().filter((rule) => rule.tourId === context.tourId).map((rule) => ({ ...rule, name: discountValueText(rule), type: 'PERCENTAGE' as const }));
    return applyDiscounts(originalCents, ofTour, context.at).lines.map((line) => ({ name: line.name, base: line.base, amountCents: line.amountCents }));
  }
}

export class DemoReservationsStore extends ReservationsSource {
  /** HU-COM-012 plan D-02: the modification traces of every reservation, in the same store. */
  readonly modifications: ModificationTrace[] = [];
  /** HU-COM-017 plan D-02: the credit balance lines of these reservations. */
  creditBalances: readonly CreditBalance[] = [];
  /** Amendment 2026-10-14 (AC-CB.4, AC-CB.10): the uses of those lines and the refund requests that set part of them aside. */
  creditApplications: readonly CreditApplication[] = [];
  creditRequests: readonly CreditRequest[] = [];
  constructor(public items: Reservation[] = []) { super(); }
  override list(): Observable<readonly Reservation[]> { return of([...this.items]); }
}

/** Checks the departure and its capacity without holding a seat, quotes as the service would; one reservation per Idempotency-Key. */
export class DemoReservationsWriter extends ReservationsWriter {
  private readonly byKey = new Map<string, Reservation>();
  private sequence = 1842;
  constructor(private readonly store: DemoReservationsStore, private readonly departures: DemoDeparturesStore,
    private readonly quotes: ReservationQuoteSource) { super(); }
  override create(c: CreateReservationCommand, key: string): Observable<Reservation> {
    const known = this.byKey.get(key);
    if (known) return of(known);
    const d = openDepartures(this.departures.items).find((x) => x.id === c.departureId);
    if (!d) return throwError(() => ({ status: 409, code: 'departure-not-open', userMessage: 'La salida no está abierta para reservas.' }));
    if (!hasCapacity(d, c.people)) return throwError(() => ({ status: 409, code: 'insufficient-capacity', userMessage: capacityMessage(d) }));
    return this.quotes.quote(c).pipe(map((quote) => {
      const again = this.byKey.get(key);
      if (again) return again;
      const created: Reservation = {
        id: `RES-${++this.sequence}`, leadCustomerName: CUSTOMERS.find((x) => x.id === c.leadCustomerId)?.fullName ?? c.leadCustomerId,
        departureId: d.id, tourName: d.tourName, departureDate: d.date, conditions: d.conditions, people: c.people, quote, balanceCents: quote.finalCents,
        status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', seatHeld: false, paymentType: c.paymentType, paymentMethod: c.paymentMethod,
      };
      this.byKey.set(key, created);
      this.store.items = [created, ...this.store.items];
      return created;
    }));
  }
}

/** The reservation ports over the demo stores; mount-entry adds them until the -api exists (gap G-B). */
export function reservationDemoProviders(): Provider[] {
  const departures = new DemoDeparturesStore(), store = new DemoReservationsStore([...SEEDED]);
  let writer: DemoReservationsWriter | undefined;
  return [
    { provide: DeparturesSource, useValue: departures },
    { provide: LeadCustomersSource, useValue: new DemoLeadCustomers() },
    // Optional: a module mounted without the discounts story quotes no discount.
    { provide: ReservationDiscounts, useFactory: () => { const rules = inject(DiscountRulesSource, { optional: true }) as DemoDiscountRulesStore | null; return new DemoReservationDiscounts(() => rules?.rules ?? []); } },
    { provide: ReservationsSource, useValue: store },
    { provide: ReservationQuoteSource, useFactory: (c: CatalogItemsSource, r: ReservationDiscounts) => new DemoReservationQuotes(departures, c, r), deps: [CatalogItemsSource, ReservationDiscounts] },
    { provide: ReservationsWriter, useFactory: (q: ReservationQuoteSource) => (writer ??= new DemoReservationsWriter(store, departures, q)), deps: [ReservationQuoteSource] },
  ];
}

import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { CashSessionStatus, PaymentsWriter, RegisterPaymentCommand, RegisteringUser } from '../payments/data/payments-writer';
import { paymentEntryOf, proofProblem } from '../payments/model/payment';
import { minimumPartial, situation } from './proof-review-demo';
import { PAYMENTS_TEXT } from '../payments/payments-copy';
import { Reservation } from '../reservations/model/reservation';
import { STATUS_LABEL } from '../reservations/reservations-copy';
import { formatDate } from '../shared/format';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { CustomerContext } from '../self-service-reservation/data/customer-context';
import { demoFixture, demoNow } from './demo-fixtures';
import type { DemoDeparturesStore, DemoReservationsStore } from './reservations-demo';

// DEMO (spec 009- DD-1, DD-3, G-OPS, G-USR): payments live in the one reservations store of HU-COM-007 (plan D-02).
const refuse = (code: string, userMessage: string) => throwError(() => ({ status: 409, code, userMessage }));

/** DD-3: open unless the e2e asks for closed-cash-session. */
export class DemoCashSession extends CashSessionStatus {
  override isOpen(): boolean { return !demoFixture('closed-cash-session'); }
}

/** D-07: the role label, or Cliente for the final customer, stands in for the user the container's session does not carry. */
export class DemoRegisteringUser extends RegisteringUser {
  constructor(private readonly capabilities: PortalCapabilities, private readonly customer: CustomerContext) { super(); }
  override label(): string { return `${this.customer.standing === 'FINAL_CUSTOMER' ? 'Cliente' : this.capabilities.roleLabel()} (demo)`; }
}

/** D-04 to D-06: proof, start, cash session and seat. A transfer is one line En validación (RN-PY1); cash received is validated at once (RF-015A, D9). */
export class DemoPaymentsWriter extends PaymentsWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly departures: DemoDeparturesStore, private readonly cash: CashSessionStatus,
    private readonly user: RegisteringUser, private readonly answered: Map<string, Reservation>) { super(); }

  override register(c: RegisterPaymentCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key);
    if (known) return of(known);
    const r = this.store.items.find((x) => x.id === c.reservationId);
    if (!r) return refuse('reservation-not-found', 'No se encontró la reserva seleccionada.');
    const entry = paymentEntryOf(r);
    if (entry === 'closed') return refuse('reservation-closed', PAYMENTS_TEXT.closedState(STATUS_LABEL[r.status]));
    if (entry === 'cancelled' || entry === 'settled') return refuse(`reservation-${entry}`, PAYMENTS_TEXT.closedNote[entry]);
    if (!r.paymentMethod) return refuse('no-payment-method', PAYMENTS_TEXT.noModalityFeedback);
    const transfer = r.paymentMethod === 'BANK_TRANSFER', departure = this.departures.items.find((d) => d.id === r.departureId);
    const problem = c.proof ? proofProblem(c.proof) : transfer ? PAYMENTS_TEXT.proofRequired : null;
    if (problem) return refuse('invalid-proof', problem);
    // RN-PY6 (G-OPS): the demo departure starts at 00:00 of its date, Colombian time.
    if (departure && demoNow() >= Date.parse(`${departure.date}T00:00:00-05:00`)) return refuse('departure-started', PAYMENTS_TEXT.started);
    if (!transfer && !this.cash.isOpen()) return refuse('cash-session-closed', 'No hay una sesión de caja abierta: el pago en efectivo no se registró.');
    const free = this.seatsFree(r, departure?.effectiveCapacity ?? 0);
    if (!r.seatHeld && free < r.people) return refuse('no-availability', PAYMENTS_TEXT.noSeats(`${r.tourName} (${formatDate(r.departureDate)})`, free, r.people));
    const payments = r.payments ?? [], applied = transfer ? undefined : Math.min(c.amountCents, r.balanceCents);
    const line = { id: `${r.id}-P${payments.length + 1}`, method: r.paymentMethod, amountCents: c.amountCents, proofName: transfer ? c.proof!.name : null,
      proofStatus: transfer ? 'EN_VALIDACION' as const : 'SIN_COMPROBANTE' as const, registeredBy: this.user.label(), presentedAt: new Date(demoNow()).toISOString(), appliedCents: applied };
    let next: Reservation = { ...r, seatHeld: true, paymentType: r.paymentType ?? c.paymentType, payments: [...payments, line] };
    if (applied !== undefined) next = this.validated(next, r, applied);
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(key, next);
    return of(next);
  }

  /** D9: cash received counts at once; 100 % (Total) or the minimum deposit (Abono) confirms, as the proof approval does (HU-COM-010). */
  private validated(next: Reservation, r: Reservation, applied: number): Reservation {
    const validatedCents = (r.validatedCents ?? 0) + applied, balanceCents = r.balanceCents - applied;
    const reached = r.paymentType === 'PARTIAL' ? validatedCents >= minimumPartial(r) : balanceCents === 0;
    const status = r.status === 'PENDIENTE_DE_PAGO' && reached ? 'CONFIRMADA' : r.status;
    return { ...next, status, validatedCents, balanceCents, financialStatus: situation({ ...r, status }, validatedCents, balanceCents) };
  }

  /** RN-PY5: the seats held on the departure, over the shared store; the first recorded keeps the last seat. full-departure leaves none. */
  private seatsFree(r: Reservation, capacity: number): number {
    const held = this.store.items.filter((x) => x.seatHeld && x.departureId === r.departureId).reduce((sum, x) => sum + x.people, 0);
    return demoFixture('full-departure') ? 0 : Math.max(capacity - held, 0);
  }
}

/** Registered in sources.demo.ts after reservationDemoProviders(), over its stores; the answered keys belong to the page. */
export function paymentsDemoProviders(): Provider[] {
  const cash = new DemoCashSession(), answered = new Map<string, Reservation>();
  return [
    { provide: CashSessionStatus, useValue: cash },
    { provide: RegisteringUser, useFactory: (c: PortalCapabilities, k: CustomerContext) => new DemoRegisteringUser(c, k), deps: [PortalCapabilities, CustomerContext] },
    { provide: PaymentsWriter, useFactory: (s: ReservationsSource, d: DeparturesSource, u: RegisteringUser) =>
      new DemoPaymentsWriter(s as DemoReservationsStore, d as DemoDeparturesStore, cash, u, answered), deps: [ReservationsSource, DeparturesSource, RegisteringUser] },
  ];
}

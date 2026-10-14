import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { CashSessionStatus, PaymentsWriter, RegisterPaymentCommand, RegisteringUser } from '../payments/data/payments-writer';
import { proofProblem } from '../payments/model/payment';
import { Reservation } from '../reservations/model/reservation';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { demoFixture, demoNow } from './demo-fixtures';
import type { DemoDeparturesStore, DemoReservationsStore } from './reservations-demo';

// DEMO (spec 009- DD-1, DD-3, G-OPS, G-USR): payments live in the one reservations store of HU-COM-007 (plan D-02).
const refuse = (code: string, userMessage: string) => throwError(() => ({ status: 409, code, userMessage }));

/** DD-3: open unless the e2e asks for closed-cash-session. */
export class DemoCashSession extends CashSessionStatus {
  override isOpen(): boolean { return !demoFixture('closed-cash-session'); }
}

/** D-07: the role label stands in for the user the container's session does not carry. */
export class DemoRegisteringUser extends RegisteringUser {
  constructor(private readonly capabilities: PortalCapabilities) { super(); }
  override label(): string { return `${this.capabilities.roleLabel()} (demo)`; }
}

/** D-04 to D-06: proof, start, cash session and seat, then one line pending validation; state and balance untouched (RN-PY1). */
export class DemoPaymentsWriter extends PaymentsWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly departures: DemoDeparturesStore, private readonly cash: CashSessionStatus,
    private readonly user: RegisteringUser, private readonly answered: Map<string, Reservation>) { super(); }

  override register(c: RegisterPaymentCommand, key: string): Observable<Reservation> {
    const known = this.answered.get(key);
    if (known) return of(known);
    const r = this.store.items.find((x) => x.id === c.reservationId);
    if (!r) return refuse('reservation-not-found', 'No se encontró la reserva seleccionada.');
    if (!r.paymentMethod) return refuse('no-payment-method', 'No hay una modalidad de pago habilitada para esta reserva. Defínela antes de registrar dinero.');
    const transfer = r.paymentMethod === 'BANK_TRANSFER', departure = this.departures.items.find((d) => d.id === r.departureId);
    const problem = c.proof ? proofProblem(c.proof) : transfer ? 'Adjunta el soporte de transferencia para enviarlo a validación.' : null;
    if (problem) return refuse('invalid-proof', problem);
    // RN-PY6 (G-OPS): the demo departure starts at 00:00 of its date, Colombian time.
    if (departure && demoNow() >= Date.parse(`${departure.date}T00:00:00-05:00`)) return refuse('departure-started', 'La salida ya inició: no se aceptan pagos ni soportes.');
    if (!transfer && !this.cash.isOpen()) return refuse('cash-session-closed', 'No hay una sesión de caja abierta: el pago en efectivo no se registró.');
    if (!r.seatHeld && !this.seatFree(r, departure?.effectiveCapacity ?? 0)) return refuse('no-availability', 'No hay cupo disponible en la salida: el pago no se registró.');
    const payments = r.payments ?? [];
    const next: Reservation = { ...r, seatHeld: true, payments: [...payments, {
      id: `${r.id}-P${payments.length + 1}`, method: r.paymentMethod, amountCents: c.amountCents, proofName: transfer ? c.proof!.name : null,
      proofStatus: transfer ? 'EN_VALIDACION' : 'SIN_COMPROBANTE', registeredBy: this.user.label() }] };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(key, next);
    return of(next);
  }

  /** RN-PY5: the seats held on the departure, over the shared store; the first recorded keeps the last seat. full-departure leaves none. */
  private seatFree(r: Reservation, capacity: number): boolean {
    const held = this.store.items.filter((x) => x.seatHeld && x.departureId === r.departureId).reduce((sum, x) => sum + x.people, 0);
    return !demoFixture('full-departure') && held + r.people <= capacity;
  }
}

/** Registered in sources.demo.ts after reservationDemoProviders(), over its stores; the answered keys belong to the page. */
export function paymentsDemoProviders(): Provider[] {
  const cash = new DemoCashSession(), answered = new Map<string, Reservation>();
  return [
    { provide: CashSessionStatus, useValue: cash },
    { provide: RegisteringUser, useFactory: (c: PortalCapabilities) => new DemoRegisteringUser(c), deps: [PortalCapabilities] },
    { provide: PaymentsWriter, useFactory: (s: ReservationsSource, d: DeparturesSource, u: RegisteringUser) =>
      new DemoPaymentsWriter(s as DemoReservationsStore, d as DemoDeparturesStore, cash, u, answered), deps: [ReservationsSource, DeparturesSource, RegisteringUser] },
  ];
}

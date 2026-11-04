import { Optional, Provider } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import {
  CancelCommand, CancellationOutcome, CancellationQuote, CancellationQuoteResult, CancellationWriter, Clock, Eligibility, RefundableAmount,
} from '../reservation-changes/data/cancellation-ports';
import { PaymentParametersSource } from '../payment-parameters/data/payment-parameters-ports';
import { ReservationParametersLookup, SEED_LOOKUP } from '../payment-parameters/model/payment-parameters';
import { lookupOf } from './payment-parameters-demo';
import { DemoReservationsStore } from './reservations-demo';

// DEMO (spec DD-1, G-B): the cancellation over the one reservations store of HU-COM-007; the service will decide it.
export interface PaymentLine { readonly amountCents: number; readonly validated: boolean }

/** RN-CN4 (plan D-04): validated values minus the penalty, applied once; payments pending validation do not count. */
export function refundableAmount(lines: readonly PaymentLine[], penaltyPercent: number | null): RefundableAmount {
  const validated = lines.filter((line) => line.validated).reduce((sum, line) => sum + line.amountCents, 0);
  if (validated === 0) return { kind: 'no-payments' };
  if (penaltyPercent === null) return { kind: 'pending-policy' };
  const penaltyCents = Math.round((validated * penaltyPercent) / 100);
  return { kind: 'amount', cents: validated - penaltyCents, penaltyCents };
}

function eligibilityOf(r: Reservation): Eligibility {
  if (r.status === 'EN_EJECUCION') return 'in-execution';
  if (r.status !== 'PENDIENTE_DE_PAGO' && r.status !== 'CONFIRMADA') return 'terminal';
  return r.reschedulingPending ? 'rescheduling-pending' : 'allowed';
}

/** The policy is NO DEFINIDO (DP-CN1): the penalty comes from the payment parameters (009-); the demo seed is null, so a validated amount answers pending-policy. */
export class DemoCancellationQuote extends CancellationQuote {
  constructor(private readonly store: ReservationsSource, private readonly penaltyPercent?: number | null, private readonly parameters: ReservationParametersLookup = SEED_LOOKUP) { super(); }
  override quote(code: string): Observable<CancellationQuoteResult | null> {
    return this.store.list().pipe(map((all) => {
      const reservation = all.find((r) => r.id === code);
      return reservation ? { reservation, eligibility: eligibilityOf(reservation), refundable: this.refundable(reservation) } : null;
    }));
  }
  refundable(r: Reservation): RefundableAmount {
    const penalty = this.penaltyPercent !== undefined ? this.penaltyPercent : this.parameters.forReservation(r).cancellationPenaltyPercent;
    return refundableAmount([{ amountCents: r.validatedCents ?? 0, validated: true }], penalty);
  }
}

/** Re-checks the quote; Cancelada with cause, user and instant, the seat released and, when something is refundable, the decision (AC-CN.4). */
export class DemoCancellationWriter extends CancellationWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly quotes: DemoCancellationQuote, private readonly clock: Clock,
    private readonly by: string, private readonly byKey = new Map<string, CancellationOutcome>()) { super(); }
  override cancel({ code, cause, origin, idempotencyKey }: CancelCommand): Observable<CancellationOutcome> {
    const known = this.byKey.get(idempotencyKey);
    if (known) return of(known);
    const current = this.store.items.find((r) => r.id === code)!, eligibility = eligibilityOf(current);
    if (eligibility !== 'allowed') return of({ kind: 'refused', eligibility, reservation: current });
    const at = this.clock.now(), refundable = this.quotes.refundable(current);
    const decision = origin === 'customer' && (refundable.kind === 'pending-policy' || (refundable.kind === 'amount' && refundable.cents > 0)) ? {
      kind: 'CUSTOMER_CANCELLATION' as const, baseAmountCents: current.validatedCents ?? 0, penaltyAmountCents: refundable.kind === 'amount' ? refundable.penaltyCents : null,
      refundableCents: refundable.kind === 'amount' ? refundable.cents : null, recognizedAt: at, outcome: null,
    } : undefined;
    const cancelled: Reservation = { ...current, status: 'CANCELADA', seatHeld: false, cancellation: { cause, by: this.by, at, origin }, ...(decision && { financialDecision: decision }) };
    this.store.items = this.store.items.map((r) => (r.id === code ? cancelled : r));
    const outcome: CancellationOutcome = { kind: 'registered', reservation: cancelled };
    this.byKey.set(idempotencyKey, outcome);
    return of(outcome);
  }
}

/** The demo clock is fixed so the screens and the end-to-end checks read the same instant (tasks T-08). */
export class FixedClock extends Clock {
  constructor(private readonly instant: string) { super(); }
  override now(): string { return this.instant; }
}

/** Over the store of reservationDemoProviders(); one Idempotency-Key map per page, the user label of each mount. */
export function reservationChangesDemoProviders(): Provider[] {
  const byKey = new Map<string, CancellationOutcome>(), clock = new FixedClock('2026-10-13T09:30:00-05:00');
  return [
    { provide: Clock, useValue: clock },
    { provide: CancellationQuote, useFactory: (s: ReservationsSource, p: PaymentParametersSource | null) => new DemoCancellationQuote(s, undefined, lookupOf(p)), deps: [ReservationsSource, [new Optional(), PaymentParametersSource]] },
    { provide: CancellationWriter, deps: [ReservationsSource, CancellationQuote, PortalCapabilities],
      useFactory: (s: DemoReservationsStore, q: DemoCancellationQuote, c: PortalCapabilities) => new DemoCancellationWriter(s, q, clock, c.roleLabel(), byKey) },
  ];
}

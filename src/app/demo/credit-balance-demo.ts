import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CreditBalance, CreditBalanceSource, CreditBalanceTreatment, CreditBalanceWriter, ExcessSplit } from '../credit-balance/data/credit-balance-ports';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';
import { refundFactsOf, resolveRefund } from './refunds-demo';

// DEMO (spec 017- DD-1, G-B): credit balances are lines of the one reservations store of HU-COM-007 (plan D-02).
/** Section 8: the demo runs one tenant; the container's session carries the real one. */
const DEMO_TENANT = 'tenant-demo';

/** RN-CB2, RN-CB3: the treatment is the refund of HU-COM-016 still to decide in its 24 hours, for 100 % of its amount; a decision or the default (AC6) closes it. */
function treatmentIn(store: DemoReservationsStore, clock: Clock, id: string): CreditBalanceTreatment | null {
  const r = store.items.find((x) => x.id === id), now = Date.parse(clock.now()), facts = r && refundFactsOf(r, now);
  if (!r || !facts) return null;
  const refund = resolveRefund(r, facts, now), recorded = store.creditBalances.find((l) => l.reservationId === id && l.origin === 'TRATAMIENTO') ?? null;
  return { reservationId: id, amountCents: refund.amountCents, recorded, open: !recorded && refund.state === 'PENDIENTE_DE_DECISION' };
}

export class DemoCreditBalanceSource extends CreditBalanceSource {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock) { super(); }
  override treatmentOf(id: string): Observable<CreditBalanceTreatment | null> { return of(treatmentIn(this.store, this.clock, id)); }
}

/** RN-CB1: a pending line, never a refund; RN-CB4: the excess is kept, applied to nothing; RN-CB5: the session tenant on every line. */
export class DemoCreditBalanceWriter extends CreditBalanceWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock, private readonly capabilities: PortalCapabilities,
    private readonly tenant = DEMO_TENANT, private readonly answered = new Map<string, CreditBalance | ExcessSplit>()) { super(); }

  override recordFromTreatment(id: string, key: string): Observable<CreditBalance> {
    const known = this.answered.get(key) as CreditBalance | undefined, treatment = treatmentIn(this.store, this.clock, id);
    if (known) return of(known);
    if (!this.capabilities.canRegisterCreditBalance()) return throwError(() => ({ status: 403 }));
    if (!treatment?.open) return throwError(() => ({ status: 409 }));
    return of(this.keep(key, this.line(id, treatment.amountCents, 'TRATAMIENTO')));
  }

  override recordExcess(r: Reservation, approvedCents: number, key: string): Observable<ExcessSplit> {
    const known = this.answered.get(key) as ExcessSplit | undefined;
    if (known) return of(known);
    const appliedCents = Math.min(approvedCents, r.balanceCents), excessCents = approvedCents - appliedCents;
    return of(this.keep(key, { appliedCents, pendingCents: r.balanceCents - appliedCents, excess: excessCents > 0 ? this.line(r.id, excessCents, 'EXCEDENTE') : null }));
  }

  private keep<T extends CreditBalance | ExcessSplit>(key: string, answer: T): T { this.answered.set(key, answer); return answer; }

  private line(reservationId: string, amountCents: number, origin: CreditBalance['origin']): CreditBalance {
    const line: CreditBalance = { id: `SAF-${this.store.creditBalances.length + 1}`, reservationId, tenant: this.tenant, amountCents, origin,
      status: 'PENDIENTE', recordedBy: this.capabilities.roleLabel(), recordedAt: this.clock.now(), appliedTo: null };
    this.store.creditBalances = [...this.store.creditBalances, line];
    return line;
  }
}

/** Registered in sources.demo.ts after reservationChangesDemoProviders(), over the same store and clock; the answered keys belong to the page. */
export function creditBalanceDemoProviders(): Provider[] {
  const answered = new Map<string, CreditBalance | ExcessSplit>();
  return [
    { provide: CreditBalanceSource, useFactory: (s: ReservationsSource, c: Clock) => new DemoCreditBalanceSource(s as DemoReservationsStore, c), deps: [ReservationsSource, Clock] },
    { provide: CreditBalanceWriter, deps: [ReservationsSource, Clock, PortalCapabilities],
      useFactory: (s: ReservationsSource, c: Clock, k: PortalCapabilities) => new DemoCreditBalanceWriter(s as DemoReservationsStore, c, k, DEMO_TENANT, answered) },
  ];
}

import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CreditApplyOutcome, CreditBalance, CreditBalanceSource, CreditBalanceTreatment, CreditBalanceWriter, CreditOverview, ExcessSplit } from '../credit-balance/data/credit-balance-ports';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { DeparturesSource } from '../reservations/data/departures-source';
import { Reservation, ReservationsSource } from '../reservations/data/reservations-source';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { DEMO_TENANT, applyCredit, overviewOf } from './credit-overview-demo';
import type { DemoDeparturesStore, DemoReservationsStore } from './reservations-demo';
import { refundFactsOf, resolveRefund } from './refunds-demo';

// DEMO (spec 017- DD-1, G-B): credit balances are lines of the one reservations store of HU-COM-007 (plan D-02).

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
  override list(): Observable<CreditOverview> { return of(overviewOf(this.store, Date.parse(this.clock.now()))); }
}

/** RN-CB1: a pending line, never a refund; RN-CB4: the excess is kept, applied to nothing; RN-CB5: the session tenant on every line. */
export class DemoCreditBalanceWriter extends CreditBalanceWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock, private readonly capabilities: PortalCapabilities,
    private readonly tenant = DEMO_TENANT, private readonly answered = new Map<string, Answer>(), private readonly departures?: DemoDeparturesStore) { super(); }

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

  /** AC-CB.4, AC-CB.14: the capability first (403); a business refusal is an answer, kept per key like a success. */
  override apply(target: string, cents: number, key: string): Observable<CreditApplyOutcome> {
    return this.once(key, this.capabilities.canApplyCreditBalance(), () => applyCredit(this.store, this.departures!, this.clock.now(), this.tenant, this.capabilities.roleLabel(), target, cents));
  }


  private once<T extends Answer>(key: string, allowed: boolean, run: () => T): Observable<T> {
    const known = this.answered.get(key) as T | undefined;
    if (known) return of(known);
    return allowed ? of(this.keep(key, run())) : throwError(() => ({ status: 403 }));
  }

  private keep<T extends Answer>(key: string, answer: T): T { this.answered.set(key, answer); return answer; }

  private line(reservationId: string, amountCents: number, origin: CreditBalance['origin']): CreditBalance {
    const line: CreditBalance = { id: `SAF-${this.store.creditBalances.length + 1}`, reservationId, tenant: this.tenant, amountCents, origin,
      status: 'PENDIENTE', recordedBy: this.capabilities.roleLabel(), recordedAt: this.clock.now(), appliedTo: null };
    this.store.creditBalances = [...this.store.creditBalances, line];
    return line;
  }
}

type Answer = CreditBalance | ExcessSplit | CreditApplyOutcome;

/** Registered in sources.demo.ts after reservationChangesDemoProviders(), over the same store and clock; the answered keys belong to the page. */
/** DP-CB9 (PROPUESTO): the delivered demo shows data; the mockup book starts empty. Each seed once per page, on a cancelled reservation of a customer who has another one to pay. */
const SEEDS: readonly CreditBalance[] = [
  { id: 'SAF-1', reservationId: 'RES-1836', tenant: DEMO_TENANT, amountCents: 30_000_000, origin: 'TRATAMIENTO', status: 'PENDIENTE', recordedBy: 'Administrador del tenant (demo)', recordedAt: '2026-10-12T09:00:00-05:00', appliedTo: null },
  { id: 'SAF-2', reservationId: 'RES-1831', tenant: DEMO_TENANT, amountCents: 15_000_000, origin: 'EXCEDENTE', status: 'PENDIENTE', recordedBy: 'Administrador del tenant (demo)', recordedAt: '2026-10-13T16:30:00-05:00', appliedTo: null },
];
const seeded = (s: DemoReservationsStore) => { if (!s.creditBalances.length) s.creditBalances = [...SEEDS]; return s; };

export function creditBalanceDemoProviders(): Provider[] {
  const answered = new Map<string, Answer>();
  return [
    { provide: CreditBalanceSource, useFactory: (s: ReservationsSource, c: Clock) => new DemoCreditBalanceSource(seeded(s as DemoReservationsStore), c), deps: [ReservationsSource, Clock] },
    { provide: CreditBalanceWriter, deps: [ReservationsSource, Clock, PortalCapabilities, DeparturesSource],
      useFactory: (s: ReservationsSource, c: Clock, k: PortalCapabilities, d: DeparturesSource) => new DemoCreditBalanceWriter(seeded(s as DemoReservationsStore), c, k, DEMO_TENANT, answered, d as DemoDeparturesStore) },
  ];
}

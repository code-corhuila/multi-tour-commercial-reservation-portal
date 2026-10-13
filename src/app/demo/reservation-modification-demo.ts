import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { DeparturesSource } from '../reservations/data/departures-source';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { Departure, Reservation } from '../reservations/model/reservation';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import {
  Admission, ModificationOutcome, ModificationQuote, ModificationTrace, ModifyCommand, Recalculation, ReservationModificationWriter,
  TransportFareSource, TravellersChange,
} from '../reservation-changes/travellers-modification/data/modification-ports';
import { PortalCapabilities } from '../shared/portal-capabilities';
import type { DemoReservationsStore } from './reservations-demo';

// DEMO (spec 012- DD-1, DP-MD2, DP-MD3): the modification over the one reservations store of HU-COM-007; the service will decide it.
type Departures = { readonly items: readonly Departure[] };

/** DP-MD2 fixture (PROPUESTO): the tours whose demo policy does not admit modifying travellers; no lead time. */
export const MODIFICATION_CLOSED_TOURS: readonly string[] = ['Desierto de la Tatacoa al atardecer'];

/**
 * Plan D-04 (RN-MD1, RN-MD2): service rates and discount lines fixed at creation, scaled to the new travellers; today's discounts
 * are never consulted. Transport comes from the fare port. Integer cents only.
 */
export function recalculateReservation(r: Reservation, people: number, farePerPersonCents: number): Recalculation {
  const services = r.quote.services.map((line) => ({ name: line.name, cents: Math.round((line.cents * people) / r.people) }));
  const transportCents = farePerPersonCents * people;
  const projectedCents = services.reduce((sum, line) => sum + line.cents, transportCents);
  const discounts = r.quote.discounts.map((d) => ({ ...d, amountCents: Math.round((d.amountCents * projectedCents) / r.quote.projectedCents) }));
  const discountCents = discounts.reduce((sum, d) => sum + d.amountCents, 0), finalCents = Math.max(0, projectedCents - discountCents);
  const validated = r.validatedCents ?? 0;
  return { quote: { services, transportCents, projectedCents, discounts, discountCents, finalCents }, balanceCents: Math.max(0, finalCents - validated),
    differenceCents: Math.max(0, finalCents - r.quote.finalCents), excessCents: Math.max(0, validated - finalCents) };
}

/** DP-MD3 (PROPUESTO): the seeded fare of the departure, or the per-person transport fixed at creation. */
export class DemoTransportFare extends TransportFareSource {
  constructor(private readonly departures: Departures) { super(); }
  override perPerson(r: Reservation): number {
    return this.departures.items.find((d) => d.id === r.departureId)?.transportPerPersonCents ?? Math.round(r.quote.transportCents / r.people);
  }
}

export class DemoModificationQuote extends ModificationQuote {
  constructor(private readonly store: DemoReservationsStore, readonly fare: TransportFareSource, private readonly closedTours = MODIFICATION_CLOSED_TOURS) { super(); }
  override admits(code: string): Observable<Admission | null> {
    const r = this.store.items.find((x) => x.id === code);
    return of(r ? this.admission(r) : null);
  }
  override preview(code: string, change: TravellersChange): Observable<Recalculation | null> {
    const r = this.store.items.find((x) => x.id === code);
    return of(r ? recalculateReservation(r, r.people + change.added - change.removed, this.fare.perPerson(r)) : null);
  }
  /** RN-MD4: before execution only, then the tour policy. */
  admission(r: Reservation): Admission {
    if (r.status !== 'PENDIENTE_DE_PAGO' && r.status !== 'CONFIRMADA') return { kind: 'refused', reason: 'not-before-execution' };
    return this.closedTours.includes(r.tourName) ? { kind: 'refused', reason: 'not-allowed' } : { kind: 'allowed' };
  }
}

/** Plan D-05: state, policy, capacity of the added travellers, then one step: travellers, value, balance, seats and trace. */
export class DemoReservationModificationWriter extends ReservationModificationWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly departures: Departures, private readonly quotes: DemoModificationQuote,
    private readonly now: () => string, private readonly by: string, private readonly byKey = new Map<string, ModificationOutcome>()) { super(); }

  override modify({ code, change, cause, idempotencyKey }: ModifyCommand): Observable<ModificationOutcome> {
    const known = this.byKey.get(idempotencyKey);
    if (known) return of(known);
    const r = this.store.items.find((x) => x.id === code), people = r ? r.people + change.added - change.removed : 0;
    if (!r || people < 1) return throwError(() => new Error('Unknown reservation or no traveller left'));
    const admission = this.quotes.admission(r);
    if (admission.kind === 'refused') return of(admission);
    if (people > r.people && !this.seatsFor(r, people)) return of({ kind: 'refused', reason: 'no-capacity' });
    const next = recalculateReservation(r, people, this.quotes.fare.perPerson(r));
    const modified: Reservation = { ...r, people, quote: next.quote, balanceCents: next.balanceCents };
    const trace: ModificationTrace = { reservationCode: code, originalCents: r.quote.finalCents, recalculatedCents: next.quote.finalCents,
      balanceCents: next.balanceCents, differenceCents: next.differenceCents, cause, by: this.by, at: this.now(),
      decision: next.excessCents > 0 ? { kind: 'MODIFICATION_EXCESS', excessCents: next.excessCents, outcome: null } : null };
    this.store.items = this.store.items.map((x) => (x.id === code ? modified : x));
    this.store.modifications.push(trace);
    const outcome: ModificationOutcome = { kind: 'modified', reservation: modified, trace };
    this.byKey.set(idempotencyKey, outcome);
    return of(outcome);
  }

  /** RN-MD7: the seats the other reservations hold on the departure leave room for the new total; removed travellers free theirs at once. */
  private seatsFor(r: Reservation, people: number): boolean {
    const capacity = this.departures.items.find((d) => d.id === r.departureId)?.effectiveCapacity ?? 0;
    const held = this.store.items.filter((x) => x.id !== r.id && x.seatHeld && x.departureId === r.departureId).reduce((sum, x) => sum + x.people, 0);
    return held + people <= capacity;
  }
}

/** Registered in sources.demo.ts after reservationChangesDemoProviders(), over its store, departures and clock. */
export function reservationModificationDemoProviders(): Provider[] {
  const byKey = new Map<string, ModificationOutcome>();
  return [
    { provide: TransportFareSource, useFactory: (d: DeparturesSource) => new DemoTransportFare(d as unknown as Departures), deps: [DeparturesSource] },
    { provide: ModificationQuote, useFactory: (s: ReservationsSource, f: TransportFareSource) => new DemoModificationQuote(s as DemoReservationsStore, f),
      deps: [ReservationsSource, TransportFareSource] },
    { provide: ReservationModificationWriter, deps: [ReservationsSource, DeparturesSource, ModificationQuote, Clock, PortalCapabilities],
      useFactory: (s: DemoReservationsStore, d: Departures, q: DemoModificationQuote, c: Clock, p: PortalCapabilities) =>
        new DemoReservationModificationWriter(s, d, q, () => c.now(), p.roleLabel(), byKey) },
  ];
}

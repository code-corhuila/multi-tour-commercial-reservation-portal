import { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { AdditionalDiscountContext, AdditionalDiscountContexts, AdditionalDiscountPreview } from '../current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountEligibility } from '../current-discounts/data/additional-discount-eligibility';
import { AdditionalDiscountApplied, AdditionalDiscountCommand, AdditionalDiscountWriter } from '../current-discounts/data/additional-discount-writer';
import { CurrentDiscountsSource } from '../current-discounts/data/current-discounts-source';
import { DiscountBreakdowns } from '../current-discounts/data/discount-breakdowns';
import { DemoDiscountBreakdowns, applyDiscounts } from './discount-calculation';
import { ApplicableRule, PricedService } from '../current-discounts/model/current-discounts';
import { RegisteringUser } from '../payments/data/payments-writer';
import { Clock } from '../reservation-changes/data/cancellation-ports';
import { ReservationsSource } from '../reservations/data/reservations-source';
import { STATUS_LABEL } from '../reservations/model/reservation';
import { pesosText } from '../shared/money';
import { discountLabelOf } from './discount-label-demo';
import type { DemoReservationsStore } from './reservations-demo';
import { TourValueSource } from '../public-offer/data/public-offer-sources';
import { PublicTour, TourValue } from '../public-offer/model/public-offer';

// DEMO (DD-1, G-API): invented services and HU-COM-003 rules in memory until the API exists. No real person appears.
const rule = (_id: string, name: string, priority: number, extra: Partial<ApplicableRule>): ApplicableRule => ({ name, priority,
  startsOn: '2026-01-01', endsOn: '2026-12-31', calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE', type: 'PERCENTAGE', percentageBasisPoints: 1000,
  ...extra } as ApplicableRule);
const SERVICES: readonly PricedService[] = [
  { serviceId: 'demo-svc-1', serviceName: 'Desierto de la Tatacoa al atardecer', baseCents: 18_000_000, rules: [
    rule('demo-rule-1', 'Temporada de vacaciones', 1, { percentageBasisPoints: 1250 }),
    rule('demo-rule-2', 'Grupo familiar', 2, { calculationBase: 'PREVIOUS_SUBTOTAL', type: 'FIXED_AMOUNT', amountCents: 1_000_000, percentageBasisPoints: undefined }),
  ] },
  { serviceId: 'demo-svc-2', serviceName: 'Ruta del café en Pitalito', baseCents: 14_500_000, rules: [
    rule('demo-rule-3', 'Promoción de lanzamiento', 1, { endsOn: '2025-12-31' }),
    rule('demo-rule-4', 'Convenio suspendido', 2, { status: 'INACTIVE' }),
  ] },
  { serviceId: 'demo-svc-3', serviceName: 'Traslado aeropuerto Neiva', baseCents: 9_000_000, rules: [] },
];

/** DEMO: RN-CD4, only a Pendiente de pago or Confirmada reservation admits an additional discount; the production port answers it from the service. */
export class DemoAdditionalDiscountEligibility extends AdditionalDiscountEligibility {
  override isEligible(reservation: { readonly status: string }): boolean { return ['PENDIENTE_DE_PAGO', 'CONFIRMADA'].includes(reservation.status); }
}

export class DemoCurrentDiscountsStore extends CurrentDiscountsSource {
  override list(): Observable<readonly PricedService[]> { return of(SERVICES); }
}

/** DEMO (A.2 row 5): the cap of the tenant is a constant of 20 %, because no screen of the mockup sets it (DP-004-V19-2). */
const DEMO_CAP_BASIS_POINTS = 2000;
const ADMITS = ['PENDIENTE_DE_PAGO', 'CONFIRMADA'];
/** D-04: integer half-up on the discount, never above the value it is applied to. */
const discountOf = (valueCents: number, basisPoints: number) => Math.min(Math.floor((valueCents * basisPoints + 5_000) / 10_000), valueCents);
const refuse = (status: number, code: string, userMessage: string) => throwError(() => ({ status, code, userMessage }));

/** DEMO: the context of the chosen reservation, read from the one store of HU-COM-007 (the paid value is what the service validated). */
export class DemoAdditionalDiscountContexts extends AdditionalDiscountContexts {
  constructor(private readonly store: DemoReservationsStore) { super(); }
  override of(reservationId: string): Observable<AdditionalDiscountContext | null> {
    const r = this.store.items.find((x) => x.id === reservationId), d = r?.additionalDiscount;
    return of(r ? { reservationId, customerName: r.leadCustomerName, serviceName: r.tourName, currentValueCents: r.quote.finalCents, generalDiscountCents: r.quote.discountCents,
      paidCents: r.validatedCents ?? 0, capBasisPoints: DEMO_CAP_BASIS_POINTS, eligible: ADMITS.includes(r.status) && !d, stateLabel: STATUS_LABEL[r.status],
      ...(d ? { applied: { basisPoints: d.basisPoints, appliedAt: d.appliedAt, appliedBy: d.appliedBy } } : {}) } : null);
  }
  override preview(reservationId: string, basisPoints: number): Observable<AdditionalDiscountPreview> {
    const r = this.store.items.find((x) => x.id === reservationId);
    const newValueCents = r ? r.quote.finalCents - discountOf(r.quote.finalCents, basisPoints) : 0;
    return of({ newValueCents, excessCents: Math.max((r?.validatedCents ?? 0) - newValueCents, 0) });
  }
}

/**
 * DEMO: one discount per Idempotency-Key, stored on the reservation (additionalDiscount, G-B); the cap, the state and the single discount are the service's rules
 * (AC-CD.6, AC-CD.11). An excess over what is paid opens the pending treatment of the 24 hours as a refund of origin LOWER_VALUE, which HU-COM-016 and 017 resolve (AC-CD.12).
 */
export class DemoAdditionalDiscountWriter extends AdditionalDiscountWriter {
  constructor(private readonly store: DemoReservationsStore, private readonly clock: Clock, private readonly user: RegisteringUser,
    private readonly answered = new Map<string, AdditionalDiscountApplied>()) { super(); }
  override register(command: AdditionalDiscountCommand, idempotencyKey: string): Observable<AdditionalDiscountApplied> {
    const known = this.answered.get(idempotencyKey);
    if (known) return of(known);
    const r = this.store.items.find((x) => x.id === command.reservationId), basisPoints = command.percentageBasisPoints;
    if (!r) return refuse(404, 'additional-discount-not-found', 'No se encontró la reserva seleccionada.');
    if (basisPoints < 100 || basisPoints > DEMO_CAP_BASIS_POINTS) return refuse(422, 'additional-discount-cap', 'El descuento adicional supera el tope parametrizado.');
    if (r.additionalDiscount) return refuse(409, 'additional-discount-already-applied', 'Esta reserva ya tiene un descuento adicional autorizado.');
    if (!ADMITS.includes(r.status)) return refuse(409, 'additional-discount-state', 'Esta reserva ya no admite descuentos adicionales.');
    const previousValueCents = r.quote.finalCents, amountCents = discountOf(previousValueCents, basisPoints), newValueCents = previousValueCents - amountCents;
    const appliedBy = this.user.label(), appliedAt = this.clock.now(), excessCents = Math.max((r.validatedCents ?? 0) - newValueCents, 0);
    const applied: AdditionalDiscountApplied = { ...command, appliedBy, appliedAt, previousValueCents, amountCents, newValueCents, excessCents };
    const treatment = excessCents ? { refund: { origin: 'LOWER_VALUE' as const, reason: `Descuento adicional del ${pesosText(basisPoints)} %: ${command.reason}`, amountCents: excessCents, recognizedAt: appliedAt } } : {};
    const next = { ...r, quote: { ...r.quote, finalCents: newValueCents }, balanceCents: Math.max(r.balanceCents - amountCents, 0), ...treatment,
      additionalDiscount: { basisPoints, reason: command.reason, appliedBy, appliedAt, previousValueCents, amountCents } };
    this.store.items = this.store.items.map((x) => (x.id === r.id ? next : x));
    this.answered.set(idempotencyKey, applied);
    return of(applied);
  }
}

/**
 * DEMO: the value of a tour on a date, from the rules in force of the demo services (the pure function of HU-COM-004).
 * The production port is asynchronous (CurrentDiscountsSource) and TourValueSource is synchronous, so no production
 * provider exists yet and the public offer shows the base value there (blocked by contract, declared in the PR).
 */
export class DemoTourValueSource extends TourValueSource {
  override valueOf(tour: PublicTour, date: string): TourValue {
    const rules = SERVICES.find((service) => service.serviceId === tour.serviceId)?.rules ?? [];
    const { finalCents } = applyDiscounts(tour.baseRateCents, rules, date);
    const label = discountLabelOf(tour.baseRateCents, finalCents);
    return { baseRateCents: tour.baseRateCents, currentValueCents: finalCents, ...(label ? { discountLabel: label } : {}) };
  }
}

export function currentDiscountsProviders(): Provider[] {
  const answered = new Map<string, AdditionalDiscountApplied>();
  return [{ provide: CurrentDiscountsSource, useValue: new DemoCurrentDiscountsStore() },
    { provide: TourValueSource, useValue: new DemoTourValueSource() },
    { provide: AdditionalDiscountEligibility, useValue: new DemoAdditionalDiscountEligibility() },
    { provide: AdditionalDiscountContexts, useFactory: (s: ReservationsSource) => new DemoAdditionalDiscountContexts(s as DemoReservationsStore), deps: [ReservationsSource] },
    { provide: AdditionalDiscountWriter, useFactory: (s: ReservationsSource, c: Clock, u: RegisteringUser) => new DemoAdditionalDiscountWriter(s as DemoReservationsStore, c, u, answered),
      deps: [ReservationsSource, Clock, RegisteringUser] },
    { provide: DiscountBreakdowns, useValue: new DemoDiscountBreakdowns() }];
}

import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AdditionalDiscountWriter } from '../current-discounts/data/additional-discount-writer';
import { CurrentDiscountsSource } from '../current-discounts/data/current-discounts-source';
import { DiscountBreakdowns } from '../current-discounts/data/discount-breakdowns';
import { DemoDiscountBreakdowns } from './discount-calculation';
import { AdditionalDiscount, AdditionalDiscountCommand, PricedService } from '../current-discounts/model/current-discounts';
import { ApplicableRule } from '../current-discounts/model/current-discounts';
import { discountLabelOf } from './discount-label-demo';
import { TourValueSource } from '../public-offer/data/public-offer-sources';
import { PublicTour, TourValue } from '../public-offer/model/public-offer';

// DEMO (DD-1, G-API): invented services and HU-COM-003 rules in memory until the API exists. No real person appears.
const rule = (id: string, name: string, priority: number, extra: Partial<DiscountRule>): DiscountRule => ({ id, name, priority,
  startsOn: '2026-01-01', endsOn: '2026-12-31', calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE', type: 'PERCENTAGE', percentageBasisPoints: 1000,
  ...extra } as DiscountRule);
const SERVICES: readonly PricedService[] = [
  { serviceId: 'demo-svc-1', serviceName: 'Desierto de la Tatacoa al atardecer', baseCents: 18_000_000, rules: [
    rule('demo-rule-1', 'Temporada de vacaciones', 1, { percentageBasisPoints: 1250 }),
    rule('demo-rule-2', 'Grupo familiar', 2, { calculationBase: 'PREVIOUS_SUBTOTAL', type: 'FIXED_AMOUNT', amountCents: 1_000_000, percentageBasisPoints: undefined }),
  ] },
  { serviceId: 'demo-svc-2', serviceName: 'Ruta del café en Pitalito', baseCents: 14_500_000, rules: [
    rule('demo-rule-3', 'Promocion de lanzamiento', 1, { endsOn: '2025-12-31' }),
    rule('demo-rule-4', 'Convenio suspendido', 2, { status: 'INACTIVE' }),
  ] },
  { serviceId: 'demo-svc-3', serviceName: 'Traslado aeropuerto Neiva', baseCents: 9_000_000, rules: [] },
];

export class DemoCurrentDiscountsStore extends CurrentDiscountsSource {
  override list(): Observable<readonly PricedService[]> { return of(SERVICES); }
}

/** One stored discount per key: a retried intention never registers twice (AC-CD.8). */
export class DemoAdditionalDiscountWriter extends AdditionalDiscountWriter {
  private readonly stored = new Map<string, AdditionalDiscount>();
  override register(command: AdditionalDiscountCommand, idempotencyKey: string): Observable<AdditionalDiscount> {
    const answer = this.stored.get(idempotencyKey) ?? { ...command, authorizedBy: 'Administradora demo' };
    this.stored.set(idempotencyKey, answer);
    return of(answer);
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
  return [{ provide: CurrentDiscountsSource, useValue: new DemoCurrentDiscountsStore() },
    { provide: TourValueSource, useValue: new DemoTourValueSource() },
    { provide: AdditionalDiscountWriter, useValue: new DemoAdditionalDiscountWriter() }];
}

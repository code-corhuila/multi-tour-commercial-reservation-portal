import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AdditionalDiscountWriter } from '../current-discounts/data/additional-discount-writer';
import { CurrentDiscountsSource } from '../current-discounts/data/current-discounts-source';
import { DiscountBreakdowns } from '../current-discounts/data/discount-breakdowns';
import { DemoDiscountBreakdowns } from './discount-calculation';
import { AdditionalDiscount, AdditionalDiscountCommand, PricedService } from '../current-discounts/model/current-discounts';
import { ApplicableRule } from '../current-discounts/model/current-discounts';

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

export function currentDiscountsProviders(): Provider[] {
  return [{ provide: CurrentDiscountsSource, useValue: new DemoCurrentDiscountsStore() },
    { provide: AdditionalDiscountWriter, useValue: new DemoAdditionalDiscountWriter() },
    { provide: DiscountBreakdowns, useValue: new DemoDiscountBreakdowns() }];
}

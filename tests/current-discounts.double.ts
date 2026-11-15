import { ApplicableRule, PricedService } from '../src/app/current-discounts/model/current-discounts';

/** A rule shaped as HU-COM-003's DiscountRule; in force all 2026 unless a test says otherwise. */
export function ruleNamed(name: string, priority: number, overrides: Partial<ApplicableRule> = {}): ApplicableRule {
  return { name, priority, startsOn: '2026-01-01', endsOn: '2026-12-31', calculationBase: 'ORIGINAL_VALUE', status: 'ACTIVE',
    type: 'PERCENTAGE', percentageBasisPoints: 1000, ...overrides } as ApplicableRule;
}

export function serviceNamed(serviceName: string, rules: readonly ApplicableRule[] = [ruleNamed('Season', 1)]): PricedService {
  return { serviceId: `svc-${serviceName}`, serviceName, baseCents: 10_000_000, rules };
}

import { AdditionalDiscount, ApplicableRule, Breakdown } from '../model/current-discounts';

/** Pillar 2: the calculation of the breakdown lives behind this port (the demo one is in src/app/demo); the view only formats. */
export abstract class DiscountBreakdowns {
  abstract of(baseCents: number, rules: readonly ApplicableRule[], date: string, additional?: AdditionalDiscount): Breakdown;
}

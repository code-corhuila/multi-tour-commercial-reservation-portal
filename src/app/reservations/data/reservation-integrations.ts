import { Observable } from 'rxjs';
import { AppliedDiscount, LeadCustomer } from '../model/reservation';
/** Pending HU-COM-005 (gap G-DEP): adapted to its lead-customer source after it merges into develop. */
export abstract class LeadCustomersSource {
  abstract list(): Observable<readonly LeadCustomer[]>;
}
/** HU-COM-003 T-V19-2: the tour the rules are read for and the date they must be in force on (the creation date, DP-003-V19-3 PROPUESTO). */
export type DiscountContext = { readonly tourId: string; readonly at: string };
/**
 * The single discounts port of the quote (HU-COM-003 plan V19-D2): the ordered lines of the rules of the tour in force.
 * Without a context there is no tour to read rules for, so no line. The calculation lives behind it (pillar 2).
 */
export abstract class ReservationDiscounts {
  abstract apply(originalCents: number, context?: DiscountContext): readonly AppliedDiscount[];
}

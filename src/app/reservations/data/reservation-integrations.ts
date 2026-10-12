import { Observable } from 'rxjs';
import { AppliedDiscount, LeadCustomer } from '../model/reservation';
/** Pending HU-COM-005 (gap G-DEP): adapted to its lead-customer source after it merges into develop. */
export abstract class LeadCustomersSource {
  abstract list(): Observable<readonly LeadCustomer[]>;
}
/** Pending HU-COM-004 (gap G-DEP): adapted to its discount calculation after it merges; never copied here. */
export abstract class ReservationDiscounts {
  abstract apply(originalCents: number): readonly AppliedDiscount[];
}

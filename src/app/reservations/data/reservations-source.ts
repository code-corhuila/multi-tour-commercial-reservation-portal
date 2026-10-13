import { Observable } from 'rxjs';
import { Reservation } from '../model/reservation';
/** What HU-COM-009 reads through this port instead of the model of 007-. */
export type { Reservation, ReservationPayment } from '../model/reservation';
export { FINANCIAL_LABEL, STATUS_CLASS, STATUS_LABEL } from '../model/reservation';
/** The container supplies the implementation and resolves the tenant (gap G-B: no operation yet). */
export abstract class ReservationsSource {
  abstract list(): Observable<readonly Reservation[]>;
}

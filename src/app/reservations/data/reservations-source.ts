import { Observable } from 'rxjs';
import { Reservation } from '../model/reservation';
/** The container supplies the implementation and resolves the tenant (gap G-B: no operation yet). */
export abstract class ReservationsSource {
  abstract list(): Observable<readonly Reservation[]>;
}

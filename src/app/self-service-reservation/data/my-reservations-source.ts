import { Observable } from 'rxjs';
import { CustomerReservation } from '../model/self-service-reservation';

/**
 * The customer's own reservations. Read only, and the only port the panel has (plan D-06): with no
 * writer injected there is nothing a change action could call. The container and the service decide
 * whose reservations they are (RN-RS8); the portal sends no customer and no tenant.
 */
export abstract class MyReservationsSource {
  abstract listMine(): Observable<readonly CustomerReservation[]>;
}

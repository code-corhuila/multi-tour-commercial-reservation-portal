import { Observable } from 'rxjs';
import { CreateReservationCommand, Reservation } from '../model/reservation';
/** One Idempotency-Key per intention, reused on retry; the service recalculates and is the authority. */
export abstract class ReservationsWriter {
  abstract create(command: CreateReservationCommand, idempotencyKey: string): Observable<Reservation>;
}

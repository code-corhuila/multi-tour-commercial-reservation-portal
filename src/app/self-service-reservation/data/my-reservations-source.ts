import { Injectable } from '@angular/core';
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

/** The method of a cash promise as the portal reads it (the service sends CASH, the source maps it). */
const CASH = 'CASH_AT_OFFICE';

/**
 * AC-RS.14: after a reservation is created with cash, Mis reservas (17A) says so once. The confirmation records
 * it and the list takes it; a transfer leaves nothing to say, and nothing is stored beyond the session.
 */
@Injectable({ providedIn: 'root' })
export class CreationNotice {
  private code: string | null = null;

  record(reservation: CustomerReservation): void {
    this.code = reservation.paymentMethod === CASH ? reservation.reservationId : null;
  }

  /** The code of the cash reservation just created, or null; reading it clears it. */
  take(): string | null {
    const code = this.code;
    this.code = null;
    return code;
  }
}

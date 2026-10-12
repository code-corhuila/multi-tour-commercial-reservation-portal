import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReservationSelectionSource } from '../data/reservation-confirmation-ports';
import { ConfirmReservationPageComponent } from './confirm-reservation-page.component';
import { MyReservationsPageComponent } from './my-reservations-page.component';

/** HU-COM-008 in the shell (PORTAL_AREAS): mis-reservas.html, with finalizar-reserva.html above it while the URL carries a selection. */
@Component({
  selector: 'app-self-service-area',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmReservationPageComponent, MyReservationsPageComponent],
  template: `@if (inProgress) { <app-confirm-reservation-page /> }<app-my-reservations-page />`,
})
export class SelfServiceAreaComponent {
  protected readonly inProgress = inject(ReservationSelectionSource).current() !== null;
}

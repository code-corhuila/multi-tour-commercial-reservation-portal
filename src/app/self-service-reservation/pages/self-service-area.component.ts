import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ConfirmReservationPageComponent } from './confirm-reservation-page.component';
import { MyReservationsPageComponent } from './my-reservations-page.component';

/** HU-COM-008: the one area the final customer sees in the shell (PORTAL_AREAS), the confirmation over the panel. */
@Component({
  selector: 'app-self-service-area',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmReservationPageComponent, MyReservationsPageComponent],
  template: `<app-confirm-reservation-page /><app-my-reservations-page />`,
})
export class SelfServiceAreaComponent {}

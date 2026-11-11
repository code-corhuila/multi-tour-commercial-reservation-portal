import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CancellationQuote } from '../data/cancellation-ports';
import { RESERVATION_CHANGE_SCREEN } from '../data/reservation-change-types';
import { RESERVATION_CHANGES_COPY } from '../reservation-changes-copy';

/** 10A header action (RESERVATION_DETAIL_ACTIONS): with the permission, and while the quote does not close the reservation (plan D-05). */
@Component({
  selector: 'app-reservation-change-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="open()">{{ label }}</button> }`,
})
export class ReservationChangeActionComponent {
  readonly reservation = input.required<Reservation>();
  protected readonly label = RESERVATION_CHANGES_COPY.open;
  private readonly allowed = inject(PortalCapabilities).canRegisterChange();
  private readonly quotes = inject(CancellationQuote);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly offered = toSignal(toObservable(this.reservation).pipe(switchMap((r) => (this.allowed ? this.quotes.quote(r.id) : of(null)).pipe(
    map((q) => q?.eligibility === 'allowed' || q?.eligibility === 'rescheduling-pending'), catchError(() => of(false))))), { initialValue: false });
  protected open(): void { this.navigation?.open(RESERVATION_CHANGE_SCREEN, { reservation: this.reservation().id }); }
}

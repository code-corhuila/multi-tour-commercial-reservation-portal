import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PortalSlot } from '../../shared/portal-slots';
import { REFUND_SCREENS, RefundsSource, refundsAvailable } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

/** 10A (RESERVATION_DETAIL_BLOCKS), after the cancellation block of HU-COM-013: "Gestionar devolución" only on a reservation with a refund; nothing on 10C. */
@Component({
  selector: 'app-refund-link', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <div class="crp-form-actions crp-refunds-link"><button type="button" class="crp-operator-primary" (click)="open()">{{ t.manageTitle }}</button></div> }`,
})
export class RefundLinkComponent {
  readonly reservation = input.required<Reservation>();
  readonly fresh = input(false);
  protected readonly t = REFUNDS_COPY;
  private readonly source = inject(RefundsSource);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly offered = toSignal(toObservable(this.reservation).pipe(switchMap((r) => (this.fresh() ? of(false) : this.source.list().pipe(
    map((all) => all.some((x) => x.id === r.id)), catchError(() => of(false)))))), { initialValue: false });
  protected open(): void { this.navigation?.open(REFUND_SCREENS.manage, { refund: this.reservation().id }); }
}

/** The RESERVATION_DETAIL_BLOCKS contribution mount-entry registers after the HU-COM-013 blocks (same order, later registration). */
export const REFUND_DETAIL_LINK: PortalSlot = { component: RefundLinkComponent, order: 10, isAvailable: refundsAvailable };

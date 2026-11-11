import { ChangeDetectionStrategy, Component, Injector, Provider, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { RESERVATION_DETAIL_ACTIONS, contribute } from '../../shared/portal-slots';
import { RESCHEDULING_AREA, ReschedulingSource } from '../data/rescheduling-ports';
import { RESCHEDULING_COPY } from '../rescheduling-copy';

/** DP-RP4, owner decision of 2026-10-13 (PROPUESTO until the teacher confirms): the 10A header entry, for an open episode and with the capability. */
@Component({
  selector: 'app-rescheduling-entry', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="open()">{{ label }}</button> }`,
})
export class ReschedulingEntryComponent {
  readonly reservation = input.required<Reservation>();
  protected readonly label = RESCHEDULING_COPY.title;
  private readonly allowed = inject(PortalCapabilities).canProposeRescheduling();
  private readonly source = inject(ReschedulingSource);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly offered = toSignal(toObservable(this.reservation).pipe(switchMap((r) => (this.allowed ? this.source.episode(r.id) : of(null)).pipe(
    map((e) => e?.answer === null), catchError(() => of(false))))), { initialValue: false });
  protected open(): void { this.navigation?.open(RESCHEDULING_AREA, { reservation: this.reservation().id }); }
}

/** After "Cancelar o modificar reserva" of HU-COM-013 (order 0) and before any later action; only in a build with the rescheduling port. */
export const RESCHEDULING_ENTRY: Provider = contribute(RESERVATION_DETAIL_ACTIONS, { component: ReschedulingEntryComponent, order: 0.5,
  isAvailable: (injector: Injector) => injector.get(ReschedulingSource, null) !== null });

import { ChangeDetectionStrategy, Component, Directive, Injector, Provider, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { RESERVATION_DETAIL_BLOCKS, RESERVATION_ROW_ACTIONS, contribute } from '../../shared/portal-slots';
import { RESCHEDULING_AREA, ReschedulingSource } from '../data/rescheduling-ports';
import { RESCHEDULING_COPY } from '../rescheduling-copy';

/** What both entries share (AC-RP.14): they are offered only for a reservation with an open episode and with the capability, and open the episode of that reservation. */
@Directive()
abstract class EpisodeEntry {
  readonly reservation = input.required<Reservation>();
  /** true on 10C, where the detail is a fresh reservation (no episode). */
  readonly fresh = input(false);
  protected readonly t = RESCHEDULING_COPY;
  private readonly allowed = inject(PortalCapabilities).canProposeRescheduling();
  private readonly source = inject(ReschedulingSource);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly offered = toSignal(toObservable(this.reservation).pipe(switchMap((r) => (this.allowed && !this.fresh() ? this.source.episode(r.id) : of(null)).pipe(
    map((e) => e?.answer === null), catchError(() => of(false))))), { initialValue: false });
  protected open(): void { this.navigation?.open(RESCHEDULING_AREA, { reservation: this.reservation().id }); }
}

/** 10A (admin-detalle-reserva.html): the box "Gestionar la reprogramación", shown only while the reservation has an open episode. */
@Component({
  selector: 'app-rescheduling-box', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <div class="crp-form-actions"><button type="button" class="crp-operator-primary" (click)="open()">{{ t.manage }}</button></div> }`,
})
export class ReschedulingBoxComponent extends EpisodeEntry {}

/** 10 (admin-reservas.html): " · Reprogramar" after "Ver detalle", only with an open episode. */
@Component({
  selector: 'app-rescheduling-row-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <span class="crp-row-sep"> · </span><button type="button" (click)="open()">{{ t.rowAction }}</button> }`,
})
export class ReschedulingRowActionComponent extends EpisodeEntry {}

const withReschedulingPort = (injector: Injector) => injector.get(ReschedulingSource, null) !== null;
/** DP-RP4 (mockup PDR v1.9): the two entries of this story, only in a build with the rescheduling port; the entry of Salidas (domain 03) calls PortalNavigation.open with a departure. */
export const RESCHEDULING_ENTRIES: readonly Provider[] = [
  contribute(RESERVATION_DETAIL_BLOCKS, { component: ReschedulingBoxComponent, order: 11, isAvailable: withReschedulingPort }),
  contribute(RESERVATION_ROW_ACTIONS, { component: ReschedulingRowActionComponent, order: 11, isAvailable: withReschedulingPort }),
];

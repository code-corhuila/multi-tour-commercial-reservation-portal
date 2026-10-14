import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { formatCop } from '../../shared/format';
import { CustomerContext } from '../data/customer-context';
import { MyReservationsSource } from '../data/my-reservations-source';
import { CustomerReservation, departureLine } from '../model/self-service-reservation';
import { SELF_SERVICE_TEXT, reservationState, travelers } from '../self-service-reservation-copy';
import { PortalSlotOutlet, RESERVATION_CARD_ACTIONS, RESERVATION_CARD_EXTRAS } from '../../shared/portal-slots';

type PanelState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; items: readonly CustomerReservation[] };

/** AC3 / RN-RS7 as mis-reservas.html, without payment lines: the customer's panel shows and never changes (plan D-06). */
@Component({
  selector: 'app-my-reservations-page',
  imports: [PortalSlotOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="self-service-panel" aria-labelledby="self-service-panel-title">
      <header class="crp-page-header"><div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ text.panelEyebrow }}</p>
        <h1 id="self-service-panel-title" class="crp-page-header-title">{{ text.panelTitle }}</h1>
        <p class="crp-page-header-desc">{{ text.panelDesc }}</p>
        <p class="crp-page-header-desc">{{ text.readOnly }}</p>
      </div></header>
      <h2>{{ text.historyTitle }}</h2>
      @if (isCustomer) {
        @let current = state();
        @switch (current.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ text.retry }}</button></div> }
          @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
          @case ('data') {
            <ul data-state="data" class="self-service-list">
              @for (r of current.items; track r.reservationId) {
                <li class="self-service-card">
                  <div class="self-service-card-copy">
                    <strong>{{ r.reservationId }} · {{ r.tourName }}</strong>
                    <p>{{ text.departure }}: {{ departure(r.departureAt) }} · {{ travelers(r.people) }}</p>
                    <ng-container *crpSlot="cardExtras; inputs: { reservationId: r.reservationId }" />
                  </div>
                  <div class="self-service-card-status">
                    <span class="crp-status {{ badge(r)[1] }}">{{ badge(r)[0] }}</span>
                    <strong>{{ text.value }}: {{ cop(r.finalValueCents) }}</strong>
                  </div>
                  <ng-container *crpSlot="cardActions; inputs: { reservationId: r.reservationId }" />
                </li>
              }
            </ul>
          }
        }
      } @else { <p role="status">{{ text.panelNotCustomer }}</p> }
    </section>
  `,
})
export class MyReservationsPageComponent {
  protected readonly text = SELF_SERVICE_TEXT;
  protected readonly cop = formatCop;
  protected readonly departure = departureLine;
  protected readonly travelers = travelers;
  /** HU-COM-001 portal foundation of 2026-10-13: the lines other stories add to each card, under the departure line. */
  protected readonly cardExtras = RESERVATION_CARD_EXTRAS;
  protected readonly cardActions = RESERVATION_CARD_ACTIONS;
  protected readonly isCustomer = inject(CustomerContext).standing === 'FINAL_CUSTOMER';
  private readonly source = inject(MyReservationsSource);
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => this.source.listMine().pipe(
    map((items): PanelState => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
    catchError(() => of<PanelState>({ kind: 'error' })),
    startWith<PanelState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PanelState });

  constructor() { this.reload(); }

  reload(): void { if (this.isCustomer) this.requests.next(); }

  protected badge(reservation: CustomerReservation) { return reservationState(reservation.reservationStatus); }
}

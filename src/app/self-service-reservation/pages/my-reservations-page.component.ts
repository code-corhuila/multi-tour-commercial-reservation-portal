import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { formatMoney } from '../../catalog/model/money';
import { CustomerContext } from '../data/customer-context';
import { MyReservationsSource } from '../data/my-reservations-source';
import { CustomerReservation, SELF_SERVICE_TEXT } from '../model/self-service-reservation';

type PanelState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; items: readonly CustomerReservation[] };

/** AC3 / RN-RS7: the customer's panel shows and never changes. It holds a source port only (plan D-06). */
@Component({
  selector: 'app-my-reservations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="self-service-panel" aria-labelledby="self-service-panel-title">
      <h2 id="self-service-panel-title">{{ text.panelTitle }}</h2>
      @if (isCustomer) {
        @let current = state();
        @switch (current.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" (click)="reload()">{{ text.retry }}</button></div> }
          @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
          @case ('data') {
            <p class="self-service-note">{{ text.readOnly }}</p>
            <ul data-state="data" class="self-service-list">
              @for (r of current.items; track r.reservationId) {
                <li>
                  <strong>{{ r.reservationId }}</strong> · {{ text.departure }} {{ r.departureId }} · {{ text.people }} {{ r.people }}
                  · {{ text.projected }} {{ money(r.projectedValueCents) }} · {{ text.final }} {{ money(r.finalValueCents) }}
                  · {{ text.status }} {{ r.reservationStatus }} · {{ text.payment }} {{ r.paymentStatus }}
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
  protected readonly money = formatMoney;
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
}

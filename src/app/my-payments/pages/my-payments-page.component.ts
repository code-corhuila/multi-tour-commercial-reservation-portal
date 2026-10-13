import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { departureLine, formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { CustomerPaymentSummary, MyPaymentsSource } from '../data/my-payments-source';
import { MY_PAYMENTS_TEXT, labelOf } from '../my-payments-copy';

/** mis-pagos.html, opened from 17: one card per own reservation, read only (RN-MP4). With { reservation }, only that own one (AC-MP.5). */
@Component({
  selector: 'app-my-payments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-my-payments" aria-labelledby="crp-my-payments-title">
      <header class="crp-page-header"><div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ t.eyebrow }}</p>
        <h1 id="crp-my-payments-title" class="crp-page-header-title">{{ t.title }}</h1>
        <p class="crp-page-header-desc">{{ t.desc }}</p>
      </div></header>
      <h2>{{ t.section }}</h2>
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.empty }}</p> }
        @case ('data') {
          <ul data-state="data" class="crp-my-payments-list">
            @for (r of s.items; track r.reservationId) {
              <li class="crp-my-payments-card"><p>{{ r.reservationId }}</p>&ngsp;<h3>{{ r.tourName }}</h3>&ngsp;<p>{{ departure(r.departureAt) }}</p>&ngsp;
                <div class="crp-my-payments-meta"><span>{{ t.type }}: {{ label('type', r.paymentType) }}</span>&ngsp;<span>{{ t.method }}: {{ label('method', r.paymentMethod) }}</span>&ngsp;
                  <span>{{ t.proof }}: {{ label('proof', r.proofStatus) }}</span>&ngsp;<span>{{ t.financial }}: {{ label('financial', r.financialStatus) }}</span>&ngsp;
                  <span>{{ t.validated }}: {{ cop(r.validatedCents) }}</span>&ngsp;<span>{{ t.balance }}: {{ cop(r.balanceCents) }}</span></div></li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class MyPaymentsPageComponent {
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly label = labelOf;
  protected readonly cop = formatCop;
  protected readonly departure = departureLine;
  private readonly only = inject(PortalNavigation, { optional: true })?.params()['reservation'];
  private readonly source = inject(MyPaymentsSource);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(switchMap(() => this.source.listMine().pipe(
    map((all): PageState<CustomerPaymentSummary> => {
      const items = this.only ? all.filter((r) => r.reservationId === this.only) : all;
      return items.length ? { kind: 'data', items } : { kind: 'empty' };
    }),
    catchError(() => of<PageState<CustomerPaymentSummary>>({ kind: 'error', retry: () => this.reload() })),
    startWith<PageState<CustomerPaymentSummary>>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PageState<CustomerPaymentSummary> });

  constructor() { this.reload(); }

  reload(): void { this.requests.next(); }
}

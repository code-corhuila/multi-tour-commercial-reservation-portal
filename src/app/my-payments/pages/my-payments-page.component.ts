import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { CustomerContext } from '../../self-service-reservation/data/customer-context';
import { departureLine, formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { CustomerPaymentSummary, MyPaymentsSource } from '../data/my-payments-source';
import { gridRows } from '../economic-rows';
import { MY_PAYMENTS_TEXT, labelOf } from '../my-payments-copy';

/** mis-pagos.html, opened from 17: one card per own reservation, read only (RN-MP4). With { reservation }, only that own one (AC-MP.5). */
@Component({ imports: [ReadErrorComponent],
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
      @if (isCustomer) {
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.empty }}</p> }
        @case ('data') {
          @let credit = creditNote(s.items);
          @if (credit.length) { <div class="crp-my-payments-credit">@for (line of credit; track line) { <p>{{ line }}</p> }</div> }
          <ul data-state="data" class="crp-my-payments-list">
            @for (r of s.items; track r.reservationId) {
              <li class="crp-my-payments-card"><p>{{ r.reservationId }}</p>&ngsp;<h3>{{ r.tourName }}</h3>&ngsp;<p>{{ departure(r.departureAt) }}</p>&ngsp;
                <div class="crp-my-payments-meta">@for (row of rows(r); track row[0]) { <span>{{ row[0] }}: {{ row[1] }}</span>&ngsp; }</div>&ngsp;
                @if (r.receipts?.length) {
                  <div class="crp-my-payments-receipts"><strong>{{ t.receipts }}</strong>&ngsp;<ul>@for (p of r.receipts; track $index) {
                    <li>{{ p.support }} · {{ cop(p.amountCents) }} · <strong>{{ label('proof', p.status) }}</strong>@if (p.rejectionReason) { ({{ t.reason }}: {{ p.rejectionReason }}) }</li>
                  }</ul></div>
                } @else if (r.proofStatus === 'SIN_COMPROBANTE') {
                  <div class="crp-my-payments-receipts"><strong>{{ t.receipts }}</strong>&ngsp;<small>{{ t.noReceipts }}</small></div>
                }
              </li>
            }
          </ul>
        }
      }
      } @else { <p role="status">{{ t.notCustomer }}</p> }
    </section>
  `,
})
export class MyPaymentsPageComponent {
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly label = labelOf;
  protected readonly cop = formatCop;
  protected readonly rows = gridRows;
  protected readonly departure = departureLine;
  /** Owner decision of 2026-10-13 (option A): a visitor reads the notice of Mis reservas, not the empty state. */
  protected readonly isCustomer = inject(CustomerContext).standing === 'FINAL_CUSTOMER';
  private readonly only = inject(PortalNavigation, { optional: true })?.params()['reservation'];
  private readonly source = inject(MyPaymentsSource);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(switchMap(() => this.source.listMine().pipe(
    map((all): PageState<CustomerPaymentSummary> => {
      const items = this.only ? all.filter((r) => r.reservationId === this.only) : all;
      return items.length ? { kind: 'data', items } : { kind: 'empty' };
    }),
    catchError((error) => of<PageState<CustomerPaymentSummary>>({ kind: 'error', ...readFailure(error), retry: () => this.reload() })),
    startWith<PageState<CustomerPaymentSummary>>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PageState<CustomerPaymentSummary> });

  constructor() { this.reload(); }

  reload(): void { if (this.isCustomer) this.requests.next(); }

  /** The credit panel of mis-pagos.html, read only: apply and refund await HU-017 (no portal), so no action is drawn. Nothing if the port does not report it. */
  protected creditNote(items: readonly CustomerPaymentSummary[]): string[] {
    if (items.some((r) => r.creditBalanceCents === undefined)) return [];
    const available = items.filter((r) => (r.creditBalanceCents ?? 0) > 0);
    return available.length ? available.map((r) => `${this.t.creditAvailable}: ${formatCop(r.creditBalanceCents ?? 0)} (${this.t.creditOrigin} ${r.reservationId}). ${this.t.creditNote}`) : [this.t.noCredit];
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { CREDIT_BALANCE_COPY, formatDateTime } from '../credit-balance-copy';
import { CreditCustomerPanelComponent, CreditNotice } from '../components/credit-customer-panel.component';
import { CreditBalanceSource, CreditOverview } from '../data/credit-balance-ports';

type State = PageState<CreditOverview>;

/** admin-saldo-favor.html (HU-COM-017 amendment, AC-CB.11): sub-screen of 13 with no sidebar item; the figures are the port's, the view formats only (pillar 2). */
@Component({
  selector: 'app-credit-balance-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, CreditCustomerPanelComponent],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      @if (navigation?.has('payments')) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open('payments')">{{ t.back }}</button> }</header>
    <p class="crp-operator-access-note">{{ t.note }}</p>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @default {
        @let o = overview();
        <div class="crp-credit-balance-summary" data-credit-summary>@for (m of metrics(); track m.label) { <div class="crp-summary-metric"><span class="crp-summary-metric-value">{{ m.value }}</span><span class="crp-summary-metric-label">{{ m.label }}</span></div> }</div>
        <p class="crp-operator-form-feedback" [class.crp-is-valid]="notice()?.ok" data-credit-feedback aria-live="polite" [hidden]="!notice()">{{ notice()?.text }}</p>
        @for (c of o?.customers ?? []; track c.key) { <app-credit-customer-panel [customer]="c" (settled)="settled($event)" /> }
        @if (!o) { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.empty }}</p> }
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.requestsEyebrow }}</p><h2>{{ t.requestsTitle }}</h2>
          <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (h of t.requestsColumns; track h) { <th>{{ h }}</th> }</tr></thead>
            <tbody data-credit-requests>@for (q of o?.requests ?? []; track q.id) {
              <tr><td>#{{ q.reservationId }}</td><td>{{ q.customer }}</td><td>{{ money(q.amountCents) }}</td><td>{{ t.state[q.state] }}</td><td>{{ dateTime(q.decisionDueAt) }}</td></tr>
            } @empty { <tr><td [attr.colspan]="t.requestsColumns.length">{{ t.noRequests }}</td></tr> }</tbody></table></div></section>
      }
    }
  `,
})
export class CreditBalancePageComponent {
  protected readonly t = CREDIT_BALANCE_COPY; protected readonly money = formatCop; protected readonly dateTime = formatDateTime;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly state = signal<State>({ kind: 'loading' });
  protected readonly notice = signal<CreditNotice | null>(null);
  private readonly source = inject(CreditBalanceSource); private reads = 0;

  constructor() { this.load(); }

  protected overview(): CreditOverview | null { const s = this.state(); return s.kind === 'data' ? s.items[0] : null; }
  protected metrics() {
    const o = this.overview();
    return [formatCop(o?.availableCents ?? 0), String(o?.customersWithBalance ?? 0), String(o?.pendingDecisions ?? 0)].map((value, i) => ({ value, label: this.t.summary[i] }));
  }
  /** A form answered: show its line and read again without the loading text, so the panels keep their place; a failure to read shows the error with a retry. */
  protected settled(notice: CreditNotice): void { this.notice.set(notice); if (notice.ok) this.load(); }

  /** The newest read wins. */
  private load(): void {
    const mine = ++this.reads;
    this.source.list().subscribe({
      next: (o) => { if (mine === this.reads) this.state.set(o.customers.length ? { kind: 'data', items: [o] } : { kind: 'empty' }); },
      error: (error) => { if (mine === this.reads) this.state.set({ kind: 'error', ...readFailure(error), retry: () => { this.state.set({ kind: 'loading' }); this.load(); } }); },
    });
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { REFUND_SCREENS, Refund, RefundsSource } from '../data/refunds-ports';
import { REFUNDS_COPY, REFUND_STATE_LABEL, formatDateTime } from '../refunds-copy';

type State = PageState<Refund>;

/** admin-solicitudes-devolucion.html, opened by "Consultar solicitudes" of 13; the action of each row by role and state (app.js). */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-refund-requests-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.requestsTitle }}</h1></div>
      @if (navigation?.has('payments')) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open('payments')">{{ t.backToPayments }}</button> }</header>
    <section class="crp-refunds-hero"><div><p class="crp-operator-eyebrow">{{ t.heroEyebrow }}</p><h2>{{ t.heroTitle }}</h2></div><p>{{ t.heroCopy }}</p></section>
    @let s = state();
    @if (s.kind === 'data' && can.canExecuteRefund()) { @let lines = alertLines(s.items); @if (lines.length) {
      <section class="crp-operator-panel" data-refund-alerts><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.alertsEyebrow }}</p><h2>{{ t.alertsHeading }}</h2></div></div>
        <ul class="crp-operator-copy">@for (line of lines; track line) { <li>{{ line }}</li> }</ul>
        @if (can.canAuthorizeRefund()) { <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="navigation?.open(screens.treatment)">{{ t.decideTreatment }}</button></div> }</section>
    } }
    <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.listEyebrow }}</p><h2>{{ t.listTitle }}</h2></div>
        @if (s.kind === 'data' || s.kind === 'empty') { <span class="crp-operator-status crp-is-pending">{{ t.count(s.kind === 'data' ? s.items.length : 0) }}</span> }</div>
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @default {
          <div class="crp-table-wrap" [attr.data-state]="s.kind === 'data' ? 'data' : null"><table class="crp-operator-table"><thead><tr>@for (column of t.columns; track column) { <th>{{ column }}</th> }</tr></thead>
            <tbody>@if (s.kind === 'data') { @for (r of s.items; track r.id) {
              <tr><td><button type="button" (click)="open(r)">#{{ r.id }}</button></td><td>{{ r.customer }}</td><td>{{ r.reason }}</td><td>{{ money(r.amountCents) }}</td>
                <td><span class="crp-operator-status" [class.crp-is-pending]="!r.overdue" [class.crp-is-cancelled]="r.overdue">{{ states[r.state] }}</span>@for (mark of marks(r); track mark) { <br><small>{{ mark }}</small> }</td><td>{{ dateTime(r.date) }}</td><td><button type="button" (click)="open(r)">{{ action(r) }}</button></td></tr>
            } }</tbody></table>
            @if (s.kind === 'empty') { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.empty }}</p> }</div>
        }
      }
    </section>
  `,
})
export class RefundRequestsPageComponent {
  protected readonly t = REFUNDS_COPY; protected readonly states = REFUND_STATE_LABEL; protected readonly money = formatCop; protected readonly dateTime = formatDateTime;
  protected readonly screens = REFUND_SCREENS; protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly can = inject(PortalCapabilities); private readonly source = inject(RefundsSource); private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((items): State => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
    catchError((error) => of<State>({ kind: 'error', ...readFailure(error), retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  /** The panel alerts, in the order of the mockup: overdue executions, decisions about to expire, automatic determinations. */
  protected alertLines(items: readonly Refund[]): string[] {
    const money = (r: Refund) => formatCop(r.amountCents);
    return [...items.filter((r) => r.overdue).map((r) => this.t.lineOverdue(r, money(r))), ...items.filter((r) => r.decisionDueAt).map((r) => this.t.lineDue(r)),
      ...items.filter((r) => r.defaulted && r.state === 'AUTORIZADA').map((r) => this.t.lineAuto(r, money(r)))];
  }
  protected marks(r: Refund): string[] { return [r.overdue ? this.t.markOverdue : '', r.defaulted ? this.t.markAuto : ''].filter(Boolean); }
  protected action(r: Refund): string {
    if (r.state === 'PENDIENTE_DE_DECISION' && this.can.canAuthorizeRefund()) return this.t.treatmentAction;
    if (r.state === 'PENDIENTE_DE_AUTORIZACION' && this.can.canAuthorizeRefund()) return this.t.authorizeAction;
    return r.state === 'AUTORIZADA' && this.can.canExecuteRefund() ? this.t.executeAction : this.t.consultAction;
  }
  protected open(r: Refund): void { this.navigation?.open(REFUND_SCREENS.detail, { refund: r.id }); }
}

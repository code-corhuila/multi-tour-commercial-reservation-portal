import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { REFUND_SCREENS, Refund, RefundsSource } from '../data/refunds-ports';
import { REFUNDS_COPY, refundStateText } from '../refunds-copy';

type State = PageState<Refund>;

/** admin-gestionar-devolucion.html, opened by "Gestionar devolución" of 10A or by the list with { refund }: the treatment, its counter and where to go. */
@Component({
  selector: 'app-refund-manage-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.trace }}</p><h1 class="crp-page-header-title crp-h1">{{ t.manageTitle }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="go(screens.requests)">{{ t.backToRequests }}</button></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') { @let r = s.items[0]; @let pending = r.remainingMinutes !== null;
        <section class="crp-operator-panel" data-state="data"><p class="crp-operator-eyebrow">{{ t.origin(r) }}</p><h2>{{ t.pendingTitle }}</h2>
          <p>{{ t.paid }} <strong>{{ money(r.amountCents) }}</strong>.{{ pending ? ' ' + t.choice : '' }}</p>
          <span class="crp-operator-status crp-is-pending">{{ pending ? t.left(r.remainingMinutes!) : stateText(r) }}</span><p class="crp-operator-copy">{{ t.defaultCopy }}</p></section>
        <section class="crp-operator-panel"><h2>{{ t.requestTitle }}</h2><div class="crp-form-actions crp-refunds-actions">
          @if (pending && authorizes) { <button type="button" class="crp-operator-primary" (click)="go(screens.treatment, r)">{{ t.openDecision }}</button> }
          <button type="button" class="crp-operator-outline" (click)="go(screens.detail, r)">{{ t.viewDetail }}</button></div></section>
      }
    }
  `,
})
export class RefundManagePageComponent {
  protected readonly t = REFUNDS_COPY; protected readonly screens = REFUND_SCREENS; protected readonly money = formatCop; protected readonly stateText = refundStateText;
  protected readonly authorizes = inject(PortalCapabilities).canAuthorizeRefund();
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly id = this.navigation?.params()['refund'] ?? '';
  private readonly source = inject(RefundsSource); private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((all): State => { const found = all.find((r) => r.id === this.id); return found ? { kind: 'data', items: [found] } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  protected go(key: string, r?: Refund): void { this.navigation?.open(key, r ? { refund: r.id } : {}); }
}

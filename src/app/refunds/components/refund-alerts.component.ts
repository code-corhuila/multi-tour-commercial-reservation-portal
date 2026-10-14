import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlot } from '../../shared/portal-slots';
import { Refund, RefundsSource } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

type State = PageState<Refund>;

/** AC-RF.6: "Devolución pendiente de decisión" for every refund the 24-hour default determined, with reservation, customer, amount and reason. */
@Component({
  selector: 'app-refund-alerts', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.noAlerts }}</p> }
      @case ('data') { @for (r of s.items; track r.id) {
        <div class="crp-refunds-alert" data-state="data"><span class="crp-refunds-alert-icon" aria-hidden="true">{{ t.alertIcon }}</span>&ngsp;
          <span class="crp-refunds-alert-copy"><strong>{{ t.alertTitle }}</strong>&ngsp;<span>#{{ r.id }} · {{ r.customer }} · {{ money(r.amountCents) }} · {{ r.reason }}</span></span></div>
      } }
    }
  `,
})
export class RefundAlertsComponent {
  protected readonly t = REFUNDS_COPY; protected readonly money = formatCop;
  private readonly source = inject(RefundsSource); private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((all): State => { const items = all.filter((r) => r.defaulted && r.state !== 'EJECUTADA'); return items.length ? { kind: 'data', items } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
}

/** The OPERATOR_NOTIFICATIONS contribution: every active Administrator, in a build with refunds. */
export const REFUND_ALERTS: PortalSlot = { component: RefundAlertsComponent, order: 10,
  isAvailable: (injector: Injector) => injector.get(PortalCapabilities).canAuthorizeRefund() && injector.get(RefundsSource, null) !== null };

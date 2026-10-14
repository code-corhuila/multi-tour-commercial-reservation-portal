import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalNavigation } from '../../portal-navigation';
import { PendingProofs, PendingProofsSource } from '../../payments/data/proof-review-ports';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlot } from '../../shared/portal-slots';
import { REFUND_SCREENS, Refund, RefundsSource } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

type Alert = { readonly icon: string; readonly title: string; readonly body: string; readonly go: string };
type State = PageState<Alert>;

/** admin-notificaciones.html: the priority alert of proofs En validación past 24 running hours (CP, with the review port), then (DV) each refund pending its decision with the real countdown, each overdue execution, and each refund the 24-hour default determined (AC-RF.6). */
@Component({
  selector: 'app-refund-alerts', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.noAlerts }}</p> }
      @case ('data') { @for (a of s.items; track a.title) {
        <div class="crp-refunds-alert" data-state="data"><span class="crp-refunds-alert-icon" aria-hidden="true">{{ a.icon }}</span>&ngsp;
          <span class="crp-refunds-alert-copy"><strong>{{ a.title }}</strong>&ngsp;<span>{{ a.body }}&ngsp;<button type="button" class="crp-panel-link" (click)="navigation?.open(a.go)">{{ t.open }}</button></span></span></div>
      } }
    }
  `,
})
export class RefundAlertsComponent {
  protected readonly t = REFUNDS_COPY; protected readonly screens = REFUND_SCREENS; protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(RefundsSource); private readonly proofs = inject(PendingProofsSource, { optional: true }); private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => combineLatest([this.source.list(), this.proofs?.list() ?? of(null)]).pipe(
    map(([all, proofs]): State => { const items = [...proofAlerts(proofs), ...alertsOf(all)]; return items.length ? { kind: 'data', items } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
}

const alertsOf = (all: readonly Refund[]): Alert[] => {
  const dv = (title: string, body: string): Alert => ({ icon: REFUNDS_COPY.alertIcon, title, body, go: REFUND_SCREENS.requests });
  return [
    ...all.filter((r) => r.remainingMinutes !== null).map((r) => dv(REFUNDS_COPY.alertTitle(r), REFUNDS_COPY.alertDue(r.remainingMinutes!))),
    ...all.filter((r) => r.overdue).map((r) => dv(REFUNDS_COPY.alertOverdueTitle(r), REFUNDS_COPY.alertOverdue)),
    ...all.filter((r) => r.defaulted && r.state === 'AUTORIZADA').map((r) => dv(REFUNDS_COPY.alertAutoTitle(r), REFUNDS_COPY.alertAuto(r, formatCop(r.amountCents)))),
  ];
};
const proofAlerts = (proofs: PendingProofs | null): Alert[] => {
  const codes = proofs?.rows.filter((p) => p.overdue).map((p) => p.reservation.id) ?? [];
  return codes.length ? [{ icon: REFUNDS_COPY.proofIcon, title: REFUNDS_COPY.proofTitle(codes.length), body: REFUNDS_COPY.proofBody(codes), go: 'payments' }] : [];
};

/** The OPERATOR_NOTIFICATIONS contribution: every active Administrator, in a build with refunds. */
export const REFUND_ALERTS: PortalSlot = { component: RefundAlertsComponent, order: 10,
  isAvailable: (injector: Injector) => injector.get(PortalCapabilities).canAuthorizeRefund() && injector.get(RefundsSource, null) !== null };

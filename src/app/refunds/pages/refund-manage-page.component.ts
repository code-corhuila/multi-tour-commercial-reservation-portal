import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { errorState } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { REFUND_SCREENS, Refund, RefundsSource } from '../data/refunds-ports';
import { STATUS_LABEL } from '../../reservations/reservations-copy';
import { REFUNDS_COPY, REFUND_ORIGIN_TYPE_LABEL, formatDateTime, refundStateText } from '../refunds-copy';

type State = PageState<Refund>;

/** admin-gestionar-devolucion.html, opened by "Gestionar devolución" of 10A or by the list with { refund }: the treatment, its counter and where to go. */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-refund-manage-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.trace }}</p><h1 class="crp-page-header-title crp-h1">{{ t.manageTitle }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="backToReservation()">{{ t.backToReservation }}</button></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') { @let r = s.items[0]; @let pending = r.remainingMinutes !== null;
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.originEyebrow }}</p><h2>{{ t.originTitle }}</h2><dl class="crp-refunds-list">
          @for (row of originRows(r); track row[0]) { <div><dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd></div> }</dl></section>
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.rulesEyebrow }}</p><h2>{{ t.rulesTitle }}</h2><p class="crp-operator-copy">{{ t.rulesCopy }}</p>
          <div class="crp-form-actions crp-refunds-actions"><button type="button" class="crp-operator-outline" (click)="go(screens.requests)">{{ t.viewRequests }}</button></div></section>
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
    catchError((error) => of<State>(errorState(error, () => this.requests.next()))), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  /** The seven rows of the panel Origen, in the order of the mockup; the values come from the port and are only formatted here. */
  protected originRows(r: Refund): readonly (readonly [string, string])[] {
    const f = this.t.originFields;
    return [[f.reservation, `#${r.id}`], [f.customer, r.customer], [f.status, r.reservationStatus ? STATUS_LABEL[r.reservationStatus] : this.t.noValue], [f.type, REFUND_ORIGIN_TYPE_LABEL[r.originType]],
      [f.reason, r.reason], [f.paid, formatCop(r.paidCents)], [f.date, formatDateTime(r.registeredAt)]];
  }
  protected backToReservation(): void { this.navigation?.open('reservations', { reservation: this.id }); }
  protected go(key: string, r?: Refund): void { this.navigation?.open(key, r ? { refund: r.id } : {}); }
}

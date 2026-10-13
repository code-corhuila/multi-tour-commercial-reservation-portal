import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalSlotOutlet, REFUND_TREATMENT_ACTIONS } from '../../shared/portal-slots';
import { REFUND_SCREENS, Refund, RefundsSource, RefundsWriter } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

type State = PageState<Refund>;

/**
 * admin-tratamiento-pendiente-devolucion.html with { refund }: "Registrar devolución del 100 %" within the 24 hours (AC-RF.6); HU-COM-017 adds
 * its credit balance action through REFUND_TREATMENT_ACTIONS. After the decision the detail follows, where it is authorized (DP-RF1).
 */
@Component({
  selector: 'app-refund-treatment-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.trace }}</p><h1 class="crp-page-header-title crp-h1">{{ t.treatmentTitle }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open(screens.requests)">{{ t.backToRefunds }}</button></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') { @let r = s.items[0]; @let decided = r.remainingMinutes === null || closed();
        <section class="crp-refunds-hero" data-state="data"><div><p class="crp-operator-eyebrow">{{ t.origin(r) }}</p><h2>{{ t.paid }} {{ money(r.amountCents) }}</h2></div>
          @if (r.remainingMinutes !== null) { <span class="crp-operator-status crp-is-pending">{{ t.left(r.remainingMinutes) }}</span> }</section>
        <section class="crp-operator-panel"><h2>{{ t.decisionTitle }}</h2><p>{{ t.decisionCopy }}</p><div class="crp-form-actions crp-refunds-actions">
            @if (!decided) { <button type="button" class="crp-operator-primary" [disabled]="busy()" (click)="decide(r)">{{ t.fullRefund }}</button> }
            <ng-container *crpSlot="actions; inputs: { reservationId: r.id, decided, changed }" /></div>
          @if (failed()) { <p role="alert" class="crp-refunds-feedback">{{ t.failed }}</p> }</section>
        <section class="crp-operator-panel"><h2>{{ t.executionTitle }}</h2><p>{{ t.executionCopy }}</p></section>
      }
    }
  `,
})
export class RefundTreatmentPageComponent {
  protected readonly t = REFUNDS_COPY; protected readonly screens = REFUND_SCREENS; protected readonly money = formatCop; protected readonly actions = REFUND_TREATMENT_ACTIONS;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly id = this.navigation?.params()['refund'] ?? '';
  private readonly source = inject(RefundsSource); private readonly writer = inject(RefundsWriter);
  /** One key per opening of the screen, reused on retry (AC-RF.10). */
  private readonly key = inject(IdempotencyKeys).generate();
  protected readonly busy = signal(false); protected readonly failed = signal(false); protected readonly closed = signal(false);
  /** A contribution (the credit balance of HU-COM-017) recorded the other choice: this button closes. */
  protected readonly changed = () => this.closed.set(true);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((all): State => { const found = all.find((r) => r.id === this.id); return found ? { kind: 'data', items: [found] } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  protected decide(r: Refund): void {
    if (this.busy()) return;
    this.busy.set(true); this.failed.set(false);
    this.writer.decideFullRefund(r.id, this.key).subscribe({
      next: () => { this.busy.set(false); this.navigation?.open(REFUND_SCREENS.detail, { refund: r.id }); },
      error: () => { this.busy.set(false); this.failed.set(true); },
    });
  }
}

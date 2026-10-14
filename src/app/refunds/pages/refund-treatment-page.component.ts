import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlotOutlet, REFUND_TREATMENT_ACTIONS } from '../../shared/portal-slots';
import { REFUND_SCREENS, Refund, RefundsSource, RefundsWriter } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

type State = PageState<Refund>;
type Note = { readonly text: string; readonly done: boolean } | null;

/**
 * admin-tratamiento-pendiente-devolucion.html: one card per treatment waiting for the Administrator within the 24 hours (AC-RF.6), each with its reason.
 * "Registrar devolución del 100 %" hands over to the detail, where it is authorized (DP-RF1); a contribution through REFUND_TREATMENT_ACTIONS may record another choice.
 */
@Component({
  selector: 'app-refund-treatment-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.trace }}</p><h1 class="crp-page-header-title crp-h1">{{ t.treatmentTitle }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open(screens.requests)">{{ t.backToRefunds }}</button></header>
    @if (feedback(); as n) { <p class="crp-refunds-feedback" [class.crp-is-valid]="n.done" [attr.role]="n.done ? 'status' : 'alert'">{{ n.text }}</p> }
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.treatmentEmpty }}</p> }
      @case ('data') { <div data-state="data">
        @for (r of cards(s.items); track r.id) { @let decided = closed().includes(r.id);
          <article class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.cardOwner(r) }}</p><h2>{{ t.paid }} {{ money(r.amountCents) }}</h2></div>
              @if (r.remainingMinutes !== null) { <span class="crp-operator-status crp-is-pending">{{ t.left(r.remainingMinutes) }}</span> }</div>
            <p class="crp-operator-copy">{{ r.reason }}</p><p class="crp-operator-copy">{{ t.treatmentRule }} {{ t.cardRule }}</p>
            <div class="crp-form-grid"><div class="crp-refunds-wide"><label [attr.for]="'crp-motive-' + r.id">{{ t.motive }}</label><textarea [id]="'crp-motive-' + r.id" [placeholder]="t.motivePlaceholder" [disabled]="busy()" [value]="motives()[r.id] ?? ''" (input)="motive(r.id, $event)"></textarea></div></div>
            <div class="crp-form-actions crp-refunds-actions">
              @if (!decided) { <button type="button" class="crp-operator-primary" [disabled]="busy()" (click)="decide(r, 'devolver')">{{ t.fullRefund }}</button> }
              <button type="button" class="crp-operator-outline" [disabled]="busy()" (click)="decide(r, 'saldo')">{{ t.creditAction }}</button>
              <button type="button" class="crp-operator-outline" (click)="navigation?.open(screens.detail, { refund: r.id })">{{ t.viewDetailShort }}</button>
              <ng-container *crpSlot="actions; inputs: { reservationId: r.id, decided, changed: closer(r.id) }" /></div></article>
        } @empty { <p class="crp-operator-copy" role="status" data-state="empty">{{ t.treatmentEmpty }}</p> }
      </div> }
    }
  `,
})
export class RefundTreatmentPageComponent {
  protected readonly t = REFUNDS_COPY; protected readonly screens = REFUND_SCREENS; protected readonly money = formatCop; protected readonly actions = REFUND_TREATMENT_ACTIONS;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(RefundsSource); private readonly writer = inject(RefundsWriter); private readonly ids = inject(IdempotencyKeys);
  /** One key per card and choice, reused on retry (AC-RF.10). */
  private readonly keys: Record<string, string> = {}; private readonly closers = new Map<string, () => void>();
  protected readonly busy = signal(false); protected readonly feedback = signal<Note>(null);
  protected readonly motives = signal<Readonly<Partial<Record<string, string>>>>({});
  /** Cards recorded as a credit balance here, and cards whose "Registrar devolución del 100 %" a contribution closed. */
  private readonly gone = signal<readonly string[]>([]); protected readonly closed = signal<readonly string[]>([]);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((all): State => { const items = all.filter((r) => r.state === 'PENDIENTE_DE_DECISION'); return items.length ? { kind: 'data', items } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  /** Only who authorizes decides a treatment (RN-RES-006C): anyone else is sent back to the list. */
  private readonly authorizes = inject(PortalCapabilities).canAuthorizeRefund();
  constructor() { if (!this.authorizes) this.navigation?.open(REFUND_SCREENS.requests); }

  protected cards(items: readonly Refund[]): readonly Refund[] { return this.authorizes ? items.filter((r) => !this.gone().includes(r.id)) : []; }
  protected motive(id: string, event: Event): void { this.motives.update((m) => ({ ...m, [id]: (event.target as HTMLTextAreaElement).value })); }
  /** The same function for the same card, so the outlet does not see a new input on every check. */
  protected closer(id: string): () => void {
    if (!this.closers.has(id)) this.closers.set(id, () => this.closed.update((c) => [...c, id]));
    return this.closers.get(id)!;
  }

  protected decide(r: Refund, choice: 'devolver' | 'saldo'): void {
    if (this.busy()) return;
    const reason = (this.motives()[r.id] ?? '').trim(), key = (this.keys[r.id + choice] ??= this.ids.generate());
    if (!reason) { this.feedback.set({ text: this.t.decideRequired, done: false }); return; }
    const call: Observable<Refund> = choice === 'saldo' ? this.writer.keepAsCreditBalance(r.id, reason, key) : this.writer.decideFullRefund(r.id, key);
    this.busy.set(true); this.feedback.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        if (choice === 'devolver') { this.navigation?.open(REFUND_SCREENS.detail, { refund: r.id }); return; }
        this.gone.update((g) => [...g, r.id]); this.feedback.set({ text: this.t.creditDone, done: true });
      },
      error: () => { this.busy.set(false); this.feedback.set({ text: this.t.failed, done: false }); },
    });
  }
}

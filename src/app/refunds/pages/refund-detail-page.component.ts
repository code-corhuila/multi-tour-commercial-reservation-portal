import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { REFUND_SCREENS, Refund, RefundMethod, RefundsSource, RefundsWriter } from '../data/refunds-ports';
import { REFUNDS_COPY, REFUND_METHOD_LABEL, formatDateTime, refundStateText } from '../refunds-copy';

type State = PageState<Refund>;
type Note = { readonly text: string; readonly done: boolean } | null;

/** admin-detalle-devolucion.html with { refund }: the decision panel for who authorizes, the execution panel once authorized (AC-RF.1 to AC-RF.4). */
@Component({
  selector: 'app-refund-detail-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.detailTitle }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open(screens.requests)">{{ t.backToRequests }}</button></header>
    <p class="crp-access-note">{{ t.accessNote }}</p>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') { @let r = shown() ?? s.items[0]; @let f = t.fields;
        <section class="crp-operator-panel" data-state="data"><p class="crp-operator-eyebrow">{{ t.infoEyebrow }}</p><h2>{{ t.infoTitle }}</h2>
          <dl class="crp-refunds-list"><div><dt>{{ f.reservation }}</dt><dd>#{{ r.id }}</dd></div><div><dt>{{ f.customer }}</dt><dd>{{ r.customer }}</dd></div>
            <div><dt>{{ f.reason }}</dt><dd>{{ r.reason }}</dd></div><div><dt>{{ f.amount }}</dt><dd>{{ money(r.amountCents) }}</dd></div>
            <div><dt>{{ f.decisionReason }}</dt><dd>{{ r.decisionReason ?? t.notApplicable }}</dd></div><div><dt>{{ f.owner }}</dt><dd>{{ r.owner ?? t.noOwner }}</dd></div>
            <div><dt>{{ f.date }}</dt><dd>{{ dateTime(r.date) }}</dd></div><div><dt>{{ f.method }}</dt><dd>{{ r.method ? methods[r.method] : t.notApplicable }}</dd></div>
            <div><dt>{{ f.movement }}</dt><dd>{{ r.cashMovement ?? t.notApplicable }}</dd></div>
            <div><dt>{{ f.state }}</dt><dd>{{ busy() === 'execute' ? t.inExecution : stateText(r) }}</dd></div></dl></section>
        @if (authorizes && (r.state === 'PENDIENTE_DE_AUTORIZACION' || authorizeNote()?.done)) { @let locked = !!busy() || !!authorizeNote()?.done;
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.decisionEyebrow }}</p><h2>{{ t.authorize }}</h2>
            <form novalidate class="crp-refunds-form" (submit)="authorize($event, r)"><div class="crp-refunds-wide"><label for="crp-refunds-reason">{{ t.reason }}</label>
                <textarea id="crp-refunds-reason" required [disabled]="locked" [value]="reason()" (input)="reason.set(value($event))"
                  [attr.aria-invalid]="reasonError() ? 'true' : null" [attr.aria-describedby]="reasonError() ? 'crp-refunds-reason-error' : null"></textarea>
                @if (reasonError()) { <p role="alert" id="crp-refunds-reason-error" class="crp-refunds-error">{{ t.reasonRequired }}</p> }</div>
              @if (authorizeNote(); as n) { <p class="crp-refunds-feedback" [class.crp-is-valid]="n.done" [attr.role]="n.done ? 'status' : 'alert'">{{ n.text }}</p> }
              <div class="crp-form-actions"><button type="submit" class="crp-operator-primary" [disabled]="locked">{{ t.authorize }}</button></div></form></section>
        }
        @if (executes && (r.state === 'AUTORIZADA' || executeNote()?.done)) { @let locked = !!busy() || !!executeNote()?.done;
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.executeEyebrow }}</p><h2>{{ t.executeTitle }}</h2>
            <form novalidate class="crp-refunds-form" (submit)="execute($event, r)"><div class="crp-form-grid">
                <div><label for="crp-refunds-outflow">{{ t.outflow }}</label><select id="crp-refunds-outflow" required [disabled]="locked" (change)="outflow.set(value($event))"
                    [attr.aria-invalid]="outflowError() ? 'true' : null" [attr.aria-describedby]="outflowError() ? 'crp-refunds-outflow-error' : null">
                    <option value="">{{ t.choose }}</option><option value="yes" [selected]="outflow() === 'yes'">{{ t.outflowYes }}</option></select>
                  @if (outflowError()) { <p role="alert" id="crp-refunds-outflow-error" class="crp-refunds-error">{{ t.outflowRequired }}</p> }</div>
                @if (outflow() === 'yes') { <div><label for="crp-refunds-method">{{ t.method }}</label><select id="crp-refunds-method" [disabled]="locked" (change)="method.set($any(value($event)))">
                  @for (m of methodCodes; track m) { <option [value]="m" [selected]="m === method()">{{ methods[m] }}</option> }</select></div> }
              </div>
              @let n = executeNote();
              <p class="crp-refunds-feedback" [class.crp-is-valid]="n?.done" [attr.role]="n ? (n.done ? 'status' : 'alert') : null">{{ n?.text ?? t.executeHint }}</p>
              <div class="crp-form-actions"><button type="submit" class="crp-operator-primary" [disabled]="locked">{{ t.execute }}</button></div></form></section>
        }
      }
    }
  `,
})
export class RefundDetailPageComponent {
  protected readonly t = REFUNDS_COPY; protected readonly stateText = refundStateText; protected readonly methods = REFUND_METHOD_LABEL;
  protected readonly methodCodes = Object.keys(REFUND_METHOD_LABEL) as RefundMethod[];
  protected readonly screens = REFUND_SCREENS; protected readonly money = formatCop; protected readonly dateTime = formatDateTime;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly can = inject(PortalCapabilities);
  protected readonly authorizes = this.can.canAuthorizeRefund(); protected readonly executes = this.can.canExecuteRefund();
  private readonly id = this.navigation?.params()['refund'] ?? '';
  private readonly source = inject(RefundsSource); private readonly writer = inject(RefundsWriter);
  /** One key per intention, made when the screen opens and reused on every retry (AC-RF.10). */
  private readonly keys = { authorize: inject(IdempotencyKeys).generate(), execute: inject(IdempotencyKeys).generate() };
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly shown = signal<Refund | null>(null); protected readonly busy = signal<'authorize' | 'execute' | null>(null);
  protected readonly reason = signal(''); protected readonly reasonError = signal(false); protected readonly authorizeNote = signal<Note>(null);
  protected readonly outflow = signal(''); protected readonly outflowError = signal(false); protected readonly executeNote = signal<Note>(null);
  protected readonly method = signal<RefundMethod>('BANK_TRANSFER');
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.list().pipe(
    map((all): State => { const found = all.find((r) => r.id === this.id); return found ? { kind: 'data', items: [found] } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }

  protected authorize(event: Event, r: Refund): void {
    event.preventDefault();
    const reason = this.reason().trim();
    if (this.check(this.reasonError, !reason)) this.send('authorize', this.authorizeNote, this.writer.authorize(r.id, reason, this.keys.authorize).pipe(map((refund) => ({ refund, text: this.t.authorized, done: true }))));
  }

  protected execute(event: Event, r: Refund): void {
    event.preventDefault();
    if (this.check(this.outflowError, this.outflow() !== 'yes')) this.send('execute', this.executeNote, this.writer.executeRefund(r.id, this.method(), this.keys.execute).pipe(
      map(({ kind, refund }) => ({ refund, text: kind === 'executed' ? this.t.executed : this.t.cashFailed, done: kind === 'executed' }))));
  }

  /** False, with the error beside its field and the focus on it, when the form may not be sent now (AC-RF.8, AC-RF.10). */
  private check(error: { set(v: boolean): void }, missing: boolean): boolean {
    if (this.busy()) return false;
    error.set(missing);
    if (missing) afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
    return !missing;
  }

  private send(intent: 'authorize' | 'execute', note: { set(n: Note): void }, request: Observable<{ refund: Refund; text: string; done: boolean }>): void {
    this.busy.set(intent); note.set(null);
    request.subscribe({
      next: ({ refund, text, done }) => { this.shown.set(refund); note.set({ text, done }); this.busy.set(null); },
      error: () => { note.set({ text: this.t.failed, done: false }); this.busy.set(null); },
    });
  }
}

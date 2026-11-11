import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { STATUS_CLASS, STATUS_LABEL } from '../../reservations/data/reservations-source';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ReschedulingEpisodeView, ReschedulingOutcome, ReschedulingSource, ReschedulingWriter } from '../data/rescheduling-ports';
import { REFUSAL_TEXT, RESCHEDULING_COPY, dueText, episodeStateText, startLine } from '../rescheduling-copy';

type State = PageState<ReschedulingEpisodeView>;
type Status = keyof typeof STATUS_LABEL;

/** admin-reprogramar-reserva.html, opened from the 10A header with { reservation } (DP-RP4). Actions only with canProposeRescheduling (D-07). */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-rescheduling-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header">
      <div class="crp-page-header-main"><p class="crp-page-header-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="back()">{{ t.back }}</button>
    </header>
    <section class="crp-operator-panel" data-episodes>
      <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.listEyebrow }}</p><h2>{{ t.listTitle }}</h2></div></div>
      <div class="crp-operator-table-wrap"><table class="crp-operator-table">
        <thead><tr>@for (h of t.listColumns; track h) { <th>{{ h }}</th> }</tr></thead>
        <tbody>
          @for (ep of episodes(); track ep.reservationId) {
            <tr [attr.data-episode-row]="ep.reservationId"><td><strong>#{{ ep.reservationId }}</strong></td><td>{{ ep.customer }}</td><td>{{ line(ep.original.startsAt) }}</td>
              <td><span class="crp-status" [class.crp-is-pending]="ep.answer === null">{{ stateText(ep) }}</span></td><td>{{ dueText(ep) }}</td>
              <td><button type="button" class="crp-panel-link" (click)="pick(ep.reservationId)">{{ t.view }}</button></td></tr>
          } @empty { <tr><td colspan="6">{{ t.listEmpty }}</td></tr> }
        </tbody></table></div>
    </section>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.none }}</p> }
      @case ('data') {
        @let e = s.items[0]; @let open = e.answer === null;
        <section class="crp-rescheduling-hero" data-state="data">
          <div><p class="crp-operator-eyebrow">{{ t.reservation }} {{ e.reservationId }}</p><h2>{{ t.heroTitle }}</h2></div>
          @if (open) { <span class="crp-status crp-is-pending">{{ t.episodeLeft(e.deadlines.remainingHours) }}</span> }
          @else { <span class="crp-status {{ statusClass(e.status) }}">{{ statusLabel(e.status) }}</span> }
        </section>
        <section class="crp-operator-panel"><h2>{{ t.deadlinesTitle }}</h2><p class="crp-operator-copy">{{ t.deadlines }}</p>
          <div class="crp-form-grid">
            <div><label for="crp-rp-departure">{{ t.newDeparture }}</label>
              <select id="crp-rp-departure" [disabled]="!open || !canAct || pending()" (change)="choose($any($event.target).value)"
                [attr.aria-invalid]="refused() ? 'true' : null" aria-describedby="crp-rp-feedback">
                @for (o of e.options; track o.id) { <option [value]="o.id" [selected]="o.id === chosen(e)">{{ line(o.startsAt) }} · {{ o.tourName }}</option> }
              </select></div>
            <div><label for="crp-rp-answer">{{ t.customerAnswer }}</label>
              <select id="crp-rp-answer" disabled>@for (a of t.answers; track a; let i = $index) { <option [selected]="i === answerIndex(e)">{{ a }}</option> }</select></div>
          </div>
          <p class="crp-access-note">{{ t.heldNote }}</p>
          <p id="crp-rp-feedback" [attr.role]="message() ? (refused() ? 'alert' : 'status') : null">{{ message() }}</p>
          @if (open && canAct) {
            <div class="crp-form-actions"><button type="button" class="crp-operator-outline" [disabled]="pending()" (click)="cancel(e)">{{ t.cancel }}</button>
              <button type="button" class="crp-operator-primary" [disabled]="pending() || !e.options.length" (click)="propose(e)">{{ t.send }}</button></div>
          }
        </section>
      }
    }
  `,
})
export class ReschedulingPageComponent {
  protected readonly t = RESCHEDULING_COPY;
  protected readonly line = startLine;
  protected readonly stateText = episodeStateText;
  protected readonly dueText = dueText;
  protected readonly canAct = inject(PortalCapabilities).canProposeRescheduling();
  protected readonly pending = signal(false);
  protected readonly message = signal('');
  protected readonly refused = signal(false);
  private readonly picked = signal<string | null>(null);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly fromParams = this.navigation?.params()['reservation'] ?? '';
  private readonly departure = this.navigation?.params()['departure'] ?? '';
  private readonly opened = signal('');
  /** The episode of the detail: the one picked in the list, else the one the screen was opened with, else the first open one (the mockup). */
  private readonly code = computed(() => this.opened() || this.fromParams || (this.episodes().find((e) => e.answer === null) ?? this.episodes()[0])?.reservationId || '');
  protected readonly episodes = toSignal(inject(ReschedulingSource).list({ ...(this.fromParams && { reservation: this.fromParams }), ...(this.departure && { departure: this.departure }) })
    .pipe(catchError(() => of<readonly ReschedulingEpisodeView[]>([]))), { initialValue: [] as readonly ReschedulingEpisodeView[] });
  private readonly writer = inject(ReschedulingWriter);
  private readonly source = inject(ReschedulingSource);
  private readonly keys = inject(IdempotencyKeys);
  /** One key per intention (a departure, or the cancellation), reused on every retry of it. */
  private readonly intentions = new Map<string, string>();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(combineLatest([toObservable(this.code), this.requests.pipe(startWith(undefined))]).pipe(switchMap(([code]) => this.source.episode(code).pipe(
    map((e): State => (e ? { kind: 'data', items: [e] } : { kind: 'empty' })),
    catchError((error) => of<State>({ kind: 'error', ...readFailure(error), retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))),
  { initialValue: { kind: 'loading' } as State });
  protected statusLabel(code: string): string { return STATUS_LABEL[code as Status] ?? ''; }
  protected statusClass(code: string): string { return STATUS_CLASS[code as Status] ?? ''; }
  protected chosen(e: ReschedulingEpisodeView): string { return this.picked() ?? e.proposal?.id ?? e.options[0]?.id ?? ''; }
  protected answerIndex(e: ReschedulingEpisodeView): number { return e.answer === 'ACCEPTED' ? 1 : e.answer === 'REJECTED' ? 2 : 0; }
  protected choose(id: string): void { this.picked.set(id); this.refused.set(false); this.message.set(''); }
  /** DP-RP4: back to 10A of the same reservation, as HU-COM-013 does. */
  protected back(): void { this.navigation?.open('reservations', { reservation: this.code() }); }
  protected pick(code: string): void { this.opened.set(code); this.picked.set(null); this.message.set(''); }
  protected propose(e: ReschedulingEpisodeView): void {
    const departureId = this.chosen(e);
    this.run(`propose:${departureId}`, (idempotencyKey) => this.writer.propose({ code: e.reservationId, departureId, idempotencyKey }), () => this.t.sent);
  }
  protected cancel(e: ReschedulingEpisodeView): void {
    this.run('cancel', (idempotencyKey) => this.writer.cancelWithFullRefund({ code: e.reservationId, idempotencyKey }),
      (done) => this.t.cancelled(formatCop(done.refundCents ?? 0)));
  }
  private run(intention: string, call: (key: string) => Observable<ReschedulingOutcome>, said: (done: ReschedulingEpisodeView) => string): void {
    if (this.pending()) return;
    const key = this.intentions.get(intention) ?? this.keys.generate();
    this.intentions.set(intention, key);
    this.pending.set(true);
    call(key).subscribe({
      next: (outcome) => {
        this.pending.set(false);
        this.refused.set(outcome.kind === 'refused');
        if (outcome.kind === 'refused') {
          this.message.set(REFUSAL_TEXT[outcome.reason]);
          afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
          return;
        }
        this.message.set(said(outcome.episode));
        this.picked.set(null);
        this.requests.next();
      },
      error: () => { this.pending.set(false); this.refused.set(true); this.message.set(this.t.failed); },
    });
  }
}

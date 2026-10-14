import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { STATUS_LABEL } from '../../reservations/data/reservations-source';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { MyProposalsSource, ProposalAnswerWriter, ReschedulingEpisodeView } from '../data/rescheduling-ports';
import { PROPOSAL_COPY, REFUSAL_TEXT, RESCHEDULING_COPY, startLine } from '../rescheduling-copy';

type State = PageState<ReschedulingEpisodeView>;

/** 24A (propuesta-reprogramacion.html), opened with { reservation }: only the customer's own proposal (RN-M-13); one answer (RN-RP5). */
@Component({
  selector: 'app-rescheduling-proposal-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-client-panel-header">
      <button type="button" class="crp-client-panel-brand" (click)="go(panel)">{{ t.brand }}</button>
      <button type="button" (click)="go(mine)">{{ t.myReservations }}</button>
    </header>
    <header class="crp-page-header"><div class="crp-page-header-main">
      <p class="crp-page-header-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1><p class="crp-page-header-desc">{{ t.desc }}</p>
    </div></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ c.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ c.failed }} <button type="button" class="crp-outline" (click)="s.retry()">{{ c.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.none }}</p> }
      @case ('data') {
        @let e = s.items[0];
        <section class="crp-operator-panel" data-state="data">
          <p class="crp-operator-eyebrow">{{ t.reservation }} {{ e.reservationId }}</p><h2>{{ e.proposal?.tourName ?? e.tourName }}</h2>
          <dl class="crp-rescheduling-details">
            <div><dt>{{ t.original }}</dt><dd>{{ line(e.original.startsAt) }}</dd></div>
            <div><dt>{{ t.proposed }}</dt><dd>{{ e.proposal ? line(e.proposal.startsAt) : '' }}</dd></div>
            <div><dt>{{ t.travelers }}</dt><dd>{{ t.people(e.people) }}</dd></div>
          </dl>
          <p class="crp-rescheduling-copy">{{ t.held }}</p>
          <p class="crp-rescheduling-copy">{{ t.deadline }}</p>
          @if (e.answer === null) {
            <div class="crp-form-actions"><button type="button" class="crp-primary" [disabled]="pending()" (click)="answer(e, 'ACCEPTED')">{{ t.accept }}</button>
              <button type="button" class="crp-outline" [disabled]="pending()" (click)="answer(e, 'REJECTED')">{{ t.reject }}</button></div>
          }
          <p class="crp-rescheduling-copy" aria-live="polite" [class.crp-is-valid]="e.answer !== null">{{ feedback() || said(e) }}</p>
        </section>
      }
    }
    <p><button type="button" class="crp-panel-link" (click)="go(mine)">{{ t.back }}</button></p>
  `,
})
export class ReschedulingProposalPageComponent {
  protected readonly t = PROPOSAL_COPY;
  protected readonly c = RESCHEDULING_COPY;
  protected readonly line = startLine;
  protected readonly panel = CLIENT_AREA.panel;
  protected readonly mine = CLIENT_AREA.reservations;
  protected readonly pending = signal(false);
  protected readonly feedback = signal('');
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly code = this.navigation?.params()['reservation'] ?? '';
  private readonly source = inject(MyProposalsSource);
  private readonly writer = inject(ProposalAnswerWriter);
  private readonly keys = inject(IdempotencyKeys);
  /** One key per decision of this opening, reused on a retry. */
  private readonly intentions = new Map<string, string>();
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.source.mine().pipe(
    map((all): State => { const e = all.find((x) => x.reservationId === this.code); return e ? { kind: 'data', items: [e] } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))),
  { initialValue: { kind: 'loading' } as State });

  /** The mockup's message, with the reservation's real state (spec section 5). */
  protected said(e: ReschedulingEpisodeView): string {
    if (e.answer === 'ACCEPTED') return this.t.accepted(STATUS_LABEL[e.status as keyof typeof STATUS_LABEL] ?? '');
    return e.answer === 'REJECTED' ? this.t.rejected : '';
  }
  protected go(key: string): void { this.navigation?.open(key); }

  protected answer(e: ReschedulingEpisodeView, decision: 'ACCEPTED' | 'REJECTED'): void {
    if (this.pending()) return;
    const idempotencyKey = this.intentions.get(decision) ?? this.keys.generate();
    this.intentions.set(decision, idempotencyKey);
    this.pending.set(true);
    this.writer.answer({ code: e.reservationId, decision, idempotencyKey }).subscribe({
      next: (outcome) => {
        this.pending.set(false);
        this.feedback.set(outcome.kind === 'refused' ? REFUSAL_TEXT[outcome.reason] : '');
        this.requests.next();
      },
      error: () => { this.pending.set(false); this.feedback.set(this.c.failed); },
    });
  }
}

import { ChangeDetectionStrategy, Component, effect, inject, input, untracked } from '@angular/core';
import { ReadErrorComponent } from '../../../shared/read-error.component';
import { errorState } from '../../../shared/read-failure';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, map, merge, of, startWith, switchMap } from 'rxjs';
import { Reservation } from '../../../reservations/data/reservations-source';
import { formatCop, formatDate } from '../../../shared/format';
import { PageState } from '../../../shared/page-state';
import { ModificationDraft } from '../data/modification-draft';
import { Admission, ModificationLines, ModificationQuote } from '../data/modification-ports';
import { TRAVELLERS_MODIFICATION_COPY } from '../travellers-modification-copy';

type State = PageState<Admission>;
type LinesState = PageState<ModificationLines>;

/**
 * Plan D-09, D-10: the panel of the type, under Tipo: the policy answer of the port, the three fields of the mockup and the four lines the port answers.
 * The tour and the departure are the reserved ones (the service keeps them in a modification), so they are drawn closed; the lines are never computed here.
 */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-travellers-modification-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="crp-travellers-modification">
      <p class="crp-operator-eyebrow">{{ t.eyebrow }}</p><h2>{{ t.title }}</h2><p>{{ t.note }}</p>
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
        @case ('data') { <p role="status" data-state="data" class="crp-travellers-modification-answer">{{ answer(s.items[0]) }}</p> }
      }
      <div class="crp-form-grid">
        <div><label for="crp-travellers-modification-service">{{ t.service }}</label>
          <select id="crp-travellers-modification-service" disabled><option>{{ reservation().tourName }}</option></select></div>
        <div><label for="crp-travellers-modification-departure">{{ t.departure }}</label>
          <select id="crp-travellers-modification-departure" disabled><option>{{ date(reservation().departureDate) }}</option></select></div>
        <div><label for="crp-travellers-modification-people">{{ t.travellers }}</label>
          <input id="crp-travellers-modification-people" type="number" min="1" inputmode="numeric" [value]="draft.typed()" (input)="draft.typed.set(typed($event))"
            [attr.aria-describedby]="draft.people() === null ? 'crp-travellers-modification-people-error' : null">
          @if (draft.people() === null) { <p role="alert" id="crp-travellers-modification-people-error">{{ t.travellersInvalid }}</p> }</div>
      </div>
      @if (draft.people() !== null) {
        @let l = linesState();
        @switch (l.kind) {
          @case ('loading') { <p role="status" data-state="loading-lines">{{ t.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error-lines"><crp-read-error [state]="l" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="l.retry()">{{ t.retry }}</button></div> }
          @case ('data') {
            @let v = l.items[0];
            <dl class="crp-reservation-changes-list" data-state="lines">
              <div><dt>{{ t.lines.projected }}</dt>&ngsp;<dd>{{ money(v.projectedCents) }}</dd></div>
              <div><dt>{{ t.lines.discount }}</dt>&ngsp;<dd>{{ money(v.discountCents) }}</dd></div>
              <div><dt>{{ t.lines.final }}</dt>&ngsp;<dd>{{ money(v.finalCents) }}</dd></div>
              <div><dt>{{ t.lines.balance }}</dt>&ngsp;<dd>{{ money(v.balanceCents) }}</dd></div>
            </dl>
            @if (!v.seatsAvailable) { <p role="status" data-state="no-seats">{{ t.noSeats }}</p> }
          }
        }
      }
    </div>
  `,
})
export class TravellersModificationFormComponent {
  readonly reservation = input.required<Reservation>();
  protected readonly t = TRAVELLERS_MODIFICATION_COPY;
  protected readonly date = formatDate;
  protected readonly draft = inject(ModificationDraft);
  private readonly quotes = inject(ModificationQuote);
  private readonly retries = new Subject<void>();
  private readonly lineRetries = new Subject<void>();
  /** The newest request wins: a new reservation or a retry cancels the previous answer. */
  protected readonly state = toSignal(merge(toObservable(this.reservation), this.retries.pipe(map(() => this.reservation()))).pipe(
    switchMap((r) => this.quotes.admits(r.id).pipe(
      map((a): State => (a ? { kind: 'data', items: [a] } : { kind: 'empty' })),
      catchError((error) => of<State>(errorState(error, () => this.retries.next()))), startWith<State>({ kind: 'loading' })))),
  { initialValue: { kind: 'loading' } as State });
  /** The lines follow the count typed; the newest answer wins, and a count that is not a traveller count asks nothing. */
  protected readonly linesState = toSignal(combineLatest([toObservable(this.reservation), toObservable(this.draft.delta), merge(of(undefined), this.lineRetries)]).pipe(
    switchMap(([r, delta]) => (delta ? this.quotes.lines(r.id, delta).pipe(
      map((l): LinesState => (l ? { kind: 'data', items: [l] } : { kind: 'empty' })),
      catchError((error) => of<LinesState>(errorState(error, () => this.lineRetries.next()))), startWith<LinesState>({ kind: 'loading' })) : of<LinesState>({ kind: 'empty' })))),
  { initialValue: { kind: 'loading' } as LinesState });

  constructor() { effect(() => { const people = this.reservation().people; untracked(() => this.draft.open(people)); }); }

  protected answer(a: Admission): string { return a.kind === 'allowed' ? this.t.allowed : this.t.refused[a.reason]; }
  protected money(cents: number | null): string { return cents === null ? this.t.unavailable : formatCop(cents); }
  protected typed(event: Event): string { return (event.target as HTMLInputElement).value; }
}

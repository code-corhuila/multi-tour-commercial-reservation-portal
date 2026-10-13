import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { Reservation } from '../../../reservations/data/reservations-source';
import { PageState } from '../../../shared/page-state';
import { Admission, ModificationQuote } from '../data/modification-ports';
import { TRAVELLERS_MODIFICATION_COPY } from '../travellers-modification-copy';

type State = PageState<Admission>;

/** Plan D-06: under Tipo, only the policy answer of the port; no field until DP-MD5. Announced as a status (no hook on Tipo). */
@Component({
  selector: 'app-travellers-modification-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="crp-travellers-modification">
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
        @case ('data') { <p role="status" data-state="data" class="crp-travellers-modification-answer">{{ answer(s.items[0]) }}</p> }
      }
    </div>
  `,
})
export class TravellersModificationFormComponent {
  readonly reservation = input.required<Reservation>();
  protected readonly t = TRAVELLERS_MODIFICATION_COPY;
  private readonly quotes = inject(ModificationQuote);
  private readonly retries = new Subject<void>();
  /** The newest request wins: a new reservation or a retry cancels the previous answer. */
  protected readonly state = toSignal(merge(toObservable(this.reservation), this.retries.pipe(map(() => this.reservation()))).pipe(
    switchMap((r) => this.quotes.admits(r.id).pipe(
      map((a): State => (a ? { kind: 'data', items: [a] } : { kind: 'empty' })),
      catchError(() => of<State>({ kind: 'error', retry: () => this.retries.next() })), startWith<State>({ kind: 'loading' })))),
  { initialValue: { kind: 'loading' } as State });

  protected answer(a: Admission): string { return a.kind === 'allowed' ? this.t.allowed : this.t.refused[a.reason]; }
}

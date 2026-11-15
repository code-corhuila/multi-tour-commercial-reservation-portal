import { ChangeDetectionStrategy, Component, Injector, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { Reservation } from '../../../reservations/data/reservations-source';
import { tenantDateTime } from '../../../payments/payment-followup-copy';
import { formatCop } from '../../../shared/format';
import { PageState } from '../../../shared/page-state';
import { PortalSlot } from '../../../shared/portal-slots';
import { ReadErrorComponent } from '../../../shared/read-error.component';
import { readFailure } from '../../../shared/read-failure';
import { ModificationHistorySource, ModificationTrace } from '../data/modification-ports';
import { TRAVELLERS_MODIFICATION_COPY } from '../travellers-modification-copy';

/**
 * 10A block (RESERVATION_DETAIL_BLOCKS), AC-MD.6: "Modificaciones registradas", one row per registered modification with the original value, the
 * recalculated value, the resulting balance, the cause and the user, as the service holds them. Nothing is drawn on 10C or when there is none.
 */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-modification-history', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @if (!fresh() && s.kind !== 'empty') {
      <section class="crp-operator-panel crp-modification-history">
        <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.history.eyebrow }}</p><h2>{{ t.history.title }}</h2></div></div>
        @switch (s.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
          @case ('data') {
            <div class="crp-table-wrap"><table class="crp-operator-table">
              <thead><tr>@for (column of t.history.columns; track column) { <th>{{ column }}</th> }</tr></thead>
              <tbody>@for (row of s.items; track row.at) { <tr><td>{{ when(row.at) }}</td><td>{{ money(row.originalCents) }}</td><td>{{ money(row.recalculatedCents) }}</td>
                <td>{{ money(row.balanceCents) }}</td><td>{{ row.cause }}</td><td>{{ row.by }}</td></tr> }</tbody>
            </table></div>
          }
        }
      </section>
    }
  `,
})
export class ModificationHistoryComponent {
  readonly reservation = input.required<Reservation>();
  readonly fresh = input(false);
  protected readonly t = TRAVELLERS_MODIFICATION_COPY;
  protected readonly money = formatCop;
  protected readonly when = tenantDateTime;
  private readonly source = inject(ModificationHistorySource);
  private readonly retries = new Subject<void>();
  protected readonly state = toSignal(combineLatest([toObservable(this.reservation), this.retries.pipe(startWith(undefined))]).pipe(
    switchMap(([r]) => this.source.list(r.id).pipe(
      map((rows): PageState<ModificationTrace> => (rows.length ? { kind: 'data', items: rows } : { kind: 'empty' })),
      startWith({ kind: 'loading' } as PageState<ModificationTrace>),
      catchError((error) => of<PageState<ModificationTrace>>({ kind: 'error', retry: () => this.retries.next(), ...readFailure(error) })),
    ))), { initialValue: { kind: 'loading' } as PageState<ModificationTrace> });
}

/** The RESERVATION_DETAIL_BLOCKS contribution mount-entry registers after the HU-COM-013 blocks: drawn only when the build supplies the history source. */
export const MODIFICATION_HISTORY_BLOCK: PortalSlot = {
  component: ModificationHistoryComponent, order: 10,
  isAvailable: (injector: Injector) => injector.get(ModificationHistorySource, null) !== null,
};

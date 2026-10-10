import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { CatalogItemsSource } from '../data/catalog-api.service';
import { CatalogItem } from '../model/catalog-item';

/**
 * The four states of a screen (RN-P2, D-05) as one value. Three booleans would allow eight
 * combinations for four legal states, and the illegal ones are the blank screens Annex H forbids.
 */
export type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'data'; readonly items: readonly CatalogItem[] };

@Component({
  selector: 'app-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = state();
    @if (current.kind === 'loading') {
      <p role="status" data-state="loading">Loading</p>
    } @else if (current.kind === 'error') {
      <div role="alert" data-state="error">
        <p>The request failed.</p>
        <button type="button" (click)="current.retry()">Retry</button>
      </div>
    } @else if (current.kind === 'empty') {
      <p role="status" data-state="empty">No results</p>
    } @else {
      <ul data-state="data">
        @for (item of current.items; track item.serviceId) {
          <li>{{ item.commercialName }} · {{ item.catalogStatus }}</li>
        }
      </ul>
    }
  `,
})
export class CatalogPageComponent {
  private readonly source = inject(CatalogItemsSource);
  private readonly requests = new Subject<void>();

  readonly state = signal<PageState>({ kind: 'loading' });

  constructor() {
    this.requests
      .pipe(
        // switchMap unsubscribes the request in flight, so a slow answer is cancelled and never
        // arrives to overwrite a newer one (RN-P3, D-06).
        switchMap(() =>
          this.source.list().pipe(
            map((items): PageState => (items.length === 0 ? { kind: 'empty' } : { kind: 'data', items })),
            catchError(() => of<PageState>({ kind: 'error', retry: () => this.reload() })),
            startWith<PageState>({ kind: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((next) => this.state.set(next));
    this.reload();
  }

  reload(): void {
    this.requests.next();
  }
}

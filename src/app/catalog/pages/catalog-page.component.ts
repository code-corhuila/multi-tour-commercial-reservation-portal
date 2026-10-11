import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { CatalogItemsSource, CatalogItemsWriter } from '../data/catalog-api.service';
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

/** The reason the service gave, or a generic one when the failure has no ApiError shape. */
function reasonOf(error: unknown): string {
  const userMessage = (error as Partial<ApiError> | null)?.userMessage;
  return typeof userMessage === 'string' ? userMessage : 'The request failed.';
}

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
          <li>
            {{ item.commercialName }} · {{ item.catalogStatus }}
            <button type="button" [disabled]="isPending(item.serviceId)" (click)="changeStatus(item)">
              @if (item.catalogStatus === 'ACTIVE') {
                Inactivate
              } @else {
                Reactivate
              }
            </button>
            @if (rowErrors()[item.serviceId]; as reason) {
              <p role="alert">{{ reason }}</p>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class CatalogPageComponent {
  private readonly source = inject(CatalogItemsSource);
  private readonly writer = inject(CatalogItemsWriter);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();

  readonly state = signal<PageState>({ kind: 'loading' });
  /** Per row, apart from the four states of the page: one item pending never blanks the others. */
  private readonly pendingIds = signal<Readonly<Record<string, true>>>({});
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});

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
    this.rowErrors.set({});
    this.requests.next();
  }

  protected isPending(serviceId: string): boolean {
    return this.pendingIds()[serviceId] === true;
  }

  /**
   * Inactivates an active item or reactivates an inactive one. It assumes the Administrator;
   * actions by role are T-07. The item stays in the list either way (AC-P1.4): the answer of the
   * service replaces it, and a refusal leaves it as it was.
   */
  protected changeStatus(item: CatalogItem): void {
    // Checked before anything else: a second click arrives before the button is rendered disabled.
    if (this.isPending(item.serviceId)) {
      return;
    }
    this.pendingIds.update((current) => ({ ...current, [item.serviceId]: true }));
    this.rowErrors.update(({ [item.serviceId]: _cleared, ...rest }) => rest);
    const request =
      item.catalogStatus === 'ACTIVE' ? this.writer.inactivate(item.serviceId) : this.writer.reactivate(item.serviceId);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (stored) => {
        this.settle(item.serviceId);
        this.state.update((current) =>
          current.kind === 'data'
            ? { kind: 'data', items: current.items.map((each) => (each.serviceId === stored.serviceId ? stored : each)) }
            : current,
        );
      },
      error: (error: unknown) => {
        this.settle(item.serviceId);
        this.rowErrors.update((current) => ({ ...current, [item.serviceId]: reasonOf(error) }));
      },
    });
  }

  private settle(serviceId: string): void {
    this.pendingIds.update(({ [serviceId]: _done, ...rest }) => rest);
  }
}

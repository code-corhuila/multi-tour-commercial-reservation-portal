import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { CatalogItemFormComponent } from '../components/catalog-item-form.component';
import { CatalogItemsSource, CatalogItemsWriter } from '../data/catalog-api.service';
import { CATALOG_COPY } from '../catalog-copy';
import { formatCop, formatDateRange } from '../../shared/format';
import { CatalogItem } from '../model/catalog-item';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalNavigation } from '../../portal-navigation';

/** The one form the page may show: registering (no item) or changing the given item. */
interface FormTarget {
  readonly item: CatalogItem | undefined;
}

/** The reason the service gave, or a generic one when the failure has no ApiError shape. */
function reasonOf(error: unknown): string {
  const userMessage = (error as Partial<ApiError> | null)?.userMessage;
  return typeof userMessage === 'string' ? userMessage : CATALOG_COPY.requestFailed;
}

@Component({
  selector: 'app-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadErrorComponent, CatalogItemFormComponent],
  template: `
    @let current = state();
    @if (caps.isDenied) {
      <p role="alert" data-state="denied">{{ copy.denied }}</p>
    } @else {
    <header class="crp-page-header">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ copy.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
      </div>
      <span class="crp-page-header-action crp-header-actions">
      @if (caps.canRegister && current.kind !== 'loading' && current.kind !== 'error') {
        <button class="crp-operator-primary" type="button" [disabled]="saving()" (click)="openForm(undefined)">{{ copy.newItem }}</button>
      }
      @if (navigation) {
        <button class="crp-operator-outline" type="button" (click)="navigation.open('catalog')">{{ copy.backToCatalogs }}</button>
      }
      </span>
    </header>
    <section class="crp-operator-panel" [attr.aria-label]="copy.panelTitle">
    <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ copy.panelEyebrow }}</p><h2>{{ copy.panelTitle }}</h2></div></div>
    <p class="crp-operator-copy">{{ copy.panelCopy }}</p>
    <!-- Outside the states: a reload must not take away a form whose save is in flight. -->
    @if (formTarget(); as target) {
      <div class="crp-form-section">
      <h2>{{ target.item ? copy.editItem : copy.newItem }}</h2>
      <!-- Keyed, so another item or a new one starts a fresh form instead of reusing the old state. -->
      @for (key of [formKey()]; track key) {
        <app-catalog-item-form
          [item]="target.item"
          (saved)="onSaved($event)"
          (cancelled)="closeForm()"
          [scope]="caps.canEditCommercialFields ? 'all' : 'description'"
          (saving)="saving.set($event)"
        />
      }
      </div>
    }
    @if (current.kind === 'loading') {
      <p role="status" data-state="loading">{{ copy.loading }}</p>
    } @else if (current.kind === 'error') {
      <div role="alert" data-state="error">
        <p><crp-read-error [state]="current" [fallback]="copy.requestFailed" /></p>
        <button class="crp-operator-outline" type="button" (click)="current.retry()">{{ copy.retry }}</button>
      </div>
    }
    @if (current.kind === 'empty') {
      <p role="status" data-state="empty">{{ copy.empty }}</p>
    } @else if (current.kind === 'data') {
      <div class="crp-table-wrap">
      <table class="crp-operator-table" data-state="data" [attr.aria-label]="copy.panelTitle">
        <thead><tr><th scope="col">{{ copy.columns.service }}</th><th scope="col">{{ copy.columns.rate }}</th><th scope="col">{{ copy.columns.validity }}</th><th scope="col">{{ copy.columns.status }}</th><th scope="col">{{ copy.columns.actions }}</th></tr></thead>
        <tbody>
        @for (item of current.items; track item.serviceId) {
          <tr>
            <td>{{ item.commercialName }}</td>
            <td>{{ cop(item.baseRateCents) }}</td>
            <td>{{ validity(item) }}</td>
            <td><span class="crp-operator-status" [class.crp-is-confirmed]="item.catalogStatus === 'ACTIVE'" [class.crp-is-pending]="item.catalogStatus === 'INACTIVE'">{{ copy.statuses[item.catalogStatus] }}</span></td>
            <td class="crp-row-actions">
            @if (canEdit) {
              <button class="crp-row-manage" type="button" [disabled]="saving()" (click)="openForm(item)">{{ copy.edit }}</button>
            }
            @if (caps.canChangeStatus) {
              <button class="crp-row-toggle" type="button" [disabled]="isPending(item.serviceId)" (click)="changeStatus(item)">
                @if (item.catalogStatus === 'ACTIVE') {
                  {{ copy.inactivate }}
                } @else {
                  {{ copy.reactivate }}
                }
              </button>
            }
            @if (rowErrors()[item.serviceId]; as reason) {
              <p role="alert">{{ reason }}</p>
            }
            </td>
          </tr>
        }
        </tbody>
      </table>
      </div>
    }
    </section>
    }
  `,
})
export class CatalogPageComponent {
  protected readonly copy = CATALOG_COPY;
  protected readonly cop = formatCop;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(CatalogItemsSource);
  private readonly writer = inject(CatalogItemsWriter);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();

  /**
   * What this actor is offered (RN-P8), derived once. The screen is convenience, not authority (D-09):
   * the service refuses what the actor may not do. DP-PT-06 is open, so it acts as the one internal
   * role the container reports.
   */
  protected readonly caps = inject(PortalCapabilities).catalog();
  protected readonly canEdit = this.caps.canEditCommercialFields || this.caps.canEditDescription;

  readonly state = signal<PageState<CatalogItem>>({ kind: 'loading' });
  /** Per row, apart from the four states of the page: one item pending never blanks the others. */
  private readonly pendingIds = signal<Readonly<Record<string, true>>>({});
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});
  /** Null when no form is open: a single value, so two forms can never be open together. */
  protected readonly formTarget = signal<FormTarget | null>(null);
  protected readonly formKey = computed(() => this.formTarget()?.item?.serviceId ?? 'new');
  /** True while the open form has a save in flight; nothing may replace or close that form then. */
  protected readonly saving = signal(false);

  constructor() {
    this.requests
      .pipe(
        // switchMap unsubscribes the request in flight, so a slow answer is cancelled and never
        // arrives to overwrite a newer one (RN-P3, D-06).
        switchMap(() =>
          this.source.list().pipe(
            // Tours only: transport belongs to operations-cost (spec A.2 row 2).
            map((all): PageState<CatalogItem> => {
              const items = all.filter((each) => each.serviceType === 'TOUR');
              return items.length === 0 ? { kind: 'empty' } : { kind: 'data', items };
            }),
            catchError((error) => of<PageState<CatalogItem>>({ kind: 'error', ...readFailure(error), retry: () => this.reload() })),
            startWith<PageState<CatalogItem>>({ kind: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((next) => this.state.set(next));
    this.reload();
    // "Nuevo servicio" of the hub opens the tour creation (spec A.2 row 7).
    if (this.navigation?.params()['create'] === '1' && this.caps.canRegister) {
      this.formTarget.set({ item: undefined });
    }
  }

  /** The validity range of the offer, or a dash when the contract returns none (gap G-B). */
  protected validity(item: CatalogItem): string {
    return item.validFrom && item.validTo ? formatDateRange(item.validFrom, item.validTo) : this.copy.noValidity;
  }

  reload(): void {
    // The Accountant is denied (AC-P1.10): the list is never asked for.
    if (this.caps.isDenied) {
      return;
    }
    this.rowErrors.set({});
    if (!this.saving()) {
      this.formTarget.set(null);
    }
    this.requests.next();
  }

  /** Opens the form to register (no item) or to change one; it replaces any form already open, never one that is saving. */
  protected openForm(item: CatalogItem | undefined): void {
    const allowed = item === undefined ? this.caps.canRegister : this.canEdit;
    if (allowed && !this.saving()) {
      this.formTarget.set({ item });
    }
  }

  protected closeForm(): void {
    this.saving.set(false);
    this.formTarget.set(null);
  }

  /**
   * Shows what the service stored without asking for the list again (AC-P1.3): a new item goes on
   * top, the most recent first, and a changed one takes the place of the old one.
   */
  protected onSaved(stored: CatalogItem): void {
    const registered = this.formTarget()?.item === undefined;
    this.state.update((current) => {
      if (current.kind === 'empty' && registered) {
        return { kind: 'data', items: [stored] };
      }
      if (current.kind !== 'data') {
        return current;
      }
      const items = registered
        ? [stored, ...current.items]
        : current.items.map((each) => (each.serviceId === stored.serviceId ? stored : each));
      return { kind: 'data', items };
    });
    this.closeForm();
  }

  protected isPending(serviceId: string): boolean {
    return this.pendingIds()[serviceId] === true;
  }

  /**
   * Inactivates an active item or reactivates an inactive one. Only an actor who may change the
   * condition is offered it (T-07). The item stays in the list either way (AC-P1.4): the answer of the
   * service replaces it, and a refusal leaves it as it was.
   */
  protected changeStatus(item: CatalogItem): void {
    if (!this.caps.canChangeStatus) {
      return;
    }
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

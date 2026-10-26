import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, finalize, map, mergeMap, of, startWith, switchMap, tap } from 'rxjs';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ApiError } from '../../shell-contract';
import { EstablishmentFormComponent } from '../components/establishment-form.component';
import { EstablishmentManageComponent } from '../components/establishment-manage.component';
import { ESTABLISHMENTS_COPY, transitionRefusal } from '../establishments-copy';
import { AssociatedEstablishmentsWriter } from '../data/associated-establishments-writer';
import { AssociatedEstablishmentsSource } from '../data/associated-establishments-source';
import {
  ASSOCIATION_STATUSES, ESTABLISHMENT_TYPES, AssociatedEstablishment,
  AssociationStatus, EstablishmentFilters, EstablishmentType,
} from '../model/associated-establishment';
import { PageState } from '../../shared/page-state';
import { PortalNavigation } from '../../portal-navigation';

/** The shared four states, carrying establishment records. */
export type EstablishmentsPageState = PageState<AssociatedEstablishment>;

@Component({
  selector: 'app-establishments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadErrorComponent, EstablishmentFormComponent, EstablishmentManageComponent],
  template: `
    @if (!canRead) {
      <p role="alert" data-state="denied">{{ copy.denied }}</p>
    } @else {
      <header class="crp-page-header">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ fixedType ? copy.eyebrowOf[fixedType] : copy.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ copy.title[fixedType ?? 'all'] }}</h1>
      </div>
      @if (navigation?.has('catalog')) {
        <button class="crp-operator-outline crp-page-header-action" type="button" (click)="navigation?.open('catalog')">{{ copy.backToCatalogs }}</button>
      }
      </header>
      <p class="crp-access-note">{{ fixedType ? copy.noteOf[fixedType] : copy.accessNote }}</p>
      <section class="crp-operator-panel" [attr.aria-label]="copy.panelTitle">
      <div class="crp-operator-panel-head">
        <div><p class="crp-operator-eyebrow">{{ copy.panelEyebrow }}</p><h2>{{ copy.panelTitle }}</h2></div>
        @if (canWrite) {
          <button class="crp-operator-primary" type="button" [disabled]="saving()" (click)="openForm()">{{ copy.newEstablishment }}</button>
        }
      </div>
      @if (formOpen()) {
        <div class="crp-form-section"><h2>{{ copy.newEstablishment }}</h2>
        @for (key of [formKey()]; track key) {
          <app-establishment-form (saved)="onSaved($event)" (cancelled)="formOpen.set(false)" (saving)="saving.set($event)" />
        }
        </div>
      }
      <div class="crp-filters">
      <div>
      <label for="establishment-type">{{ copy.filters.type }}</label>
      <select id="establishment-type" [attr.aria-label]="copy.filters.type" [disabled]="saving()"
        [value]="filters().establishmentType ?? ''" (change)="chooseType($event)">
        <option value="">{{ copy.filters.allTypes }}</option>
        @for (type of types; track type) { <option [value]="type">{{ copy.types[type] }}</option> }
      </select>
      </div>
      <div>
      <label for="association-status">{{ copy.filters.status }}</label>
      <select id="association-status" [attr.aria-label]="copy.filters.status" [disabled]="saving()"
        [value]="filters().associationStatus ?? ''" (change)="chooseStatus($event)">
        <option value="">{{ copy.filters.allStatuses }}</option>
        @for (status of statuses; track status) { <option [value]="status">{{ copy.statuses[status] }}</option> }
      </select>
      </div>
      @if (filters().establishmentType || filters().associationStatus) {
        <button class="crp-operator-outline" type="button" [disabled]="saving()" (click)="clearFilters()">{{ copy.filters.clear }}</button>
      }
      </div>
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loading }}</p> }
        @case ('error') {
          <div role="alert" data-state="error">
            <p><crp-read-error [state]="current" [fallback]="copy.requestFailed" /></p>
            <button class="crp-operator-outline" type="button" [disabled]="saving()" (click)="current.retry()">{{ copy.retry }}</button>
          </div>
        }
        @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        @case ('data') {
          <div class="crp-table-wrap">
          <table class="crp-operator-table" data-state="data" [attr.aria-label]="copy.panelTitle">
            <thead><tr><th scope="col">{{ copy.columns.name }}</th><th scope="col">{{ copy.columns.info }}</th><th scope="col">{{ copy.columns.status }}</th>@if (canWrite) { <th scope="col">{{ copy.columns.actions }}</th> }</tr></thead>
            <tbody>
            @for (item of current.items; track item.associationId) {
              <tr>
                <td><strong>{{ item.commercialName }}</strong><br><small>{{ copy.types[item.establishmentType] }}</small></td>
                <td>{{ item.commercialInformation }}</td>
                <td><span class="crp-operator-status" [class.crp-is-confirmed]="item.associationStatus === 'ACTIVE'" [class.crp-is-pending]="item.associationStatus === 'INACTIVE'">{{ copy.statuses[item.associationStatus] }}</span>
                  <br><small>{{ lastChangeOf(item) }}</small></td>
                @if (canWrite) {
                <td class="crp-row-actions">
                  <button class="crp-operator-outline" type="button" [attr.aria-expanded]="managing() === item.associationId" (click)="managing.set(item.associationId)">{{ copy.manage }}</button>
                  <button class="crp-row-toggle" type="button" [disabled]="saving() || pendingIds()[item.associationId]" (click)="changeStatus(item)">
                    {{ item.associationStatus === 'ACTIVE' ? copy.inactivate : copy.reactivate }}
                  </button>
                @if (rowErrors()[item.associationId]; as reason) { <p role="alert">{{ reason }}</p> }
                </td>
                }
              </tr>
            }
            </tbody>
          </table>
          </div>
          @for (item of [managed(current.items)]; track item?.associationId) {
            @if (item) { <app-establishment-manage [establishment]="item" (saved)="onManaged($event)" (closed)="managing.set(null)" /> }
          }
        }
      }
      </section>
    }
  `,
})
export class EstablishmentsPageComponent {
  protected readonly copy = ESTABLISHMENTS_COPY;
  private readonly source = inject(AssociatedEstablishmentsSource);
  // Without the container's writer this slice stays readable; no local adapter is substituted.
  private readonly writer = inject(AssociatedEstablishmentsWriter, { optional: true });
  private readonly capabilities = inject(PortalCapabilities);
  protected readonly canWrite = !!this.writer && this.capabilities.canRegisterEstablishments();
  protected readonly formOpen = signal(false);
  protected readonly formKey = signal(0);
  protected readonly saving = signal(false);
  /** The establishment whose "Gestionar" panel is open on this screen; one at a time. */
  protected readonly managing = signal<string | null>(null);
  protected readonly pendingIds = signal<Readonly<Record<string, boolean>>>({});
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});
  private readonly local = signal<EstablishmentsPageState | null>(null);
  protected readonly canRead = this.capabilities.canReadEstablishments();
  protected readonly types = ESTABLISHMENT_TYPES;
  protected readonly statuses = ASSOCIATION_STATUSES;
  /** The hub opens the area with { type } (admin-catalogos.html cards); anything else shows both types. */
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly fixedType = ESTABLISHMENT_TYPES.find((type) => type === this.navigation?.params()['type']);
  protected readonly filters = signal<EstablishmentFilters>(this.fixedType ? { establishmentType: this.fixedType } : {});
  private readonly requests = new Subject<EstablishmentFilters>();
  private readonly listed = toSignal(this.requests.pipe(
    // RN-PE3: only the most recent request may supply the screen's next state.
    switchMap((filters) => this.source.list(filters).pipe(
      map((items): EstablishmentsPageState => items.length ? { kind: 'data', items } : { kind: 'empty' }),
      catchError((error) => of<EstablishmentsPageState>({ kind: 'error', ...readFailure(error), retry: () => this.reload() })),
      startWith<EstablishmentsPageState>({ kind: 'loading' }),
    )),
  ), { initialValue: { kind: 'loading' } as EstablishmentsPageState });
  readonly state = computed(() => this.local() ?? this.listed());
  private readonly actions = new Subject<AssociatedEstablishment>();
  private readonly actionResponses = toSignal(this.actions.pipe(mergeMap((item) =>
    (item.associationStatus === 'ACTIVE' ? this.writer!.inactivate(item.associationId) : this.writer!.reactivate(item.associationId)).pipe(
      tap((stored) => {
        const current = this.state();
        if (current.kind === 'data') { this.local.set({ kind: 'data', items: current.items.map((row) => row.associationId === stored.associationId ? stored : row) }); }
      }),
      catchError((error: Partial<ApiError> | null) => {
        this.rowErrors.update((errors) => ({ ...errors, [item.associationId]: transitionRefusal(error) })); return EMPTY;
      }),
      finalize(() => this.pendingIds.update(({ [item.associationId]: _settled, ...rest }) => rest)),
    ),
  )));

  constructor() { this.reload(); }

  reload(): void {
    if (this.canRead && !this.saving()) { this.local.set(null); this.requests.next(this.filters()); }
  }

  protected chooseType(event: Event): void {
    if (this.saving()) { return; }
    const value = (event.target as HTMLSelectElement).value;
    if (value !== '' && !this.types.includes(value as EstablishmentType)) { return; }
    const { establishmentType: _previous, ...rest } = this.filters();
    this.filters.set(value === '' ? rest : { ...rest, establishmentType: value as EstablishmentType });
    this.reload();
  }

  protected chooseStatus(event: Event): void {
    if (this.saving()) { return; }
    const value = (event.target as HTMLSelectElement).value;
    if (value !== '' && !this.statuses.includes(value as AssociationStatus)) { return; }
    const { associationStatus: _previous, ...rest } = this.filters();
    this.filters.set(value === '' ? rest : { ...rest, associationStatus: value as AssociationStatus });
    this.reload();
  }

  protected clearFilters(): void { if (!this.saving()) { this.filters.set({}); this.reload(); } }
  protected openForm(): void {
    if (this.canWrite && !this.saving()) { this.formKey.update((key) => key + 1); this.formOpen.set(true); }
  }
  protected onSaved(stored: AssociatedEstablishment): void {
    const current = this.state();
    this.local.set({ kind: 'data', items: [stored, ...(current.kind === 'data' ? current.items : [])] });
    this.formOpen.set(false);
  }
  protected managed(items: readonly AssociatedEstablishment[]): AssociatedEstablishment | undefined { return items.find((row) => row.associationId === this.managing()); }
  protected lastChangeOf(item: AssociatedEstablishment): string {
    const last = item.changes?.at(-1);
    if (!item.changes) { return this.copy.noChangeInfo; }
    return last ? this.copy.lastChange(last.kind, last.by, last.at) : this.copy.noChange;
  }
  protected onManaged(stored: AssociatedEstablishment): void {
    const current = this.state();
    if (current.kind === 'data') { this.local.set({ kind: 'data', items: current.items.map((row) => row.associationId === stored.associationId ? stored : row) }); }
  }
  protected changeStatus(item: AssociatedEstablishment): void {
    if (!this.canWrite || this.saving() || this.pendingIds()[item.associationId]) { return; }
    this.pendingIds.update((ids) => ({ ...ids, [item.associationId]: true }));
    this.rowErrors.update(({ [item.associationId]: _previous, ...rest }) => rest); this.actions.next(item);
  }
}

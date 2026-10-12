import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, finalize, map, mergeMap, of, startWith, switchMap, tap } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
import { capabilitiesOf } from '../../catalog/model/catalog-item';
import { ApiError } from '../../shell-contract';
import { EstablishmentFormComponent } from '../components/establishment-form.component';
import { AssociatedEstablishmentsWriter } from '../data/associated-establishments-writer';
import { PageState } from '../../catalog/pages/catalog-page.component';
import { AssociatedEstablishmentsSource, canReadEstablishments } from '../data/associated-establishments-source';
import {
  ASSOCIATION_STATUSES, ESTABLISHMENT_TYPES, AssociatedEstablishment,
  AssociationStatus, EstablishmentFilters, EstablishmentType,
} from '../model/associated-establishment';

/** Reuse the catalog discriminant and state shapes, substituting only the data record. */
export type EstablishmentsPageState = Exclude<PageState, { kind: 'data' }>
  | (Omit<Extract<PageState, { kind: 'data' }>, 'items'> & { readonly items: readonly AssociatedEstablishment[] });

@Component({
  selector: 'app-establishments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstablishmentFormComponent],
  template: `
    @if (!canRead) {
      <p role="alert" data-state="denied">You do not have access to associated establishments.</p>
    } @else {
      <h1>Associated establishments</h1>
      @if (canWrite) {
        <button type="button" [disabled]="saving()" (click)="openForm()">New establishment</button>
      }
      @if (formOpen()) {
        @for (key of [formKey()]; track key) {
          <app-establishment-form (saved)="onSaved($event)" (cancelled)="formOpen.set(false)" (saving)="saving.set($event)" />
        }
      }
      <label for="establishment-type">Establishment type</label>
      <select id="establishment-type" aria-label="Establishment type" [disabled]="saving()"
        [value]="filters().establishmentType ?? ''" (change)="chooseType($event)">
        @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
      </select>
      <label for="association-status">Association status</label>
      <select id="association-status" aria-label="Association status" [disabled]="saving()"
        [value]="filters().associationStatus ?? ''" (change)="chooseStatus($event)">
        <option value="">All statuses</option>
        @for (status of statuses; track status) { <option [value]="status">{{ status }}</option> }
      </select>
      @if (filters().establishmentType || filters().associationStatus) {
        <button type="button" [disabled]="saving()" (click)="clearFilters()">Clear filters</button>
      }
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">Loading</p> }
        @case ('error') {
          <div role="alert" data-state="error">
            <p>The request failed.</p>
            <button type="button" [disabled]="saving()" (click)="current.retry()">Retry</button>
          </div>
        }
        @case ('empty') { <p role="status" data-state="empty">No results</p> }
        @case ('data') {
          <ul data-state="data">
            @for (item of current.items; track item.associationId) {
              <li>{{ item.commercialName }} · {{ item.establishmentType }} · {{ item.associationStatus }}
                <p>{{ item.commercialInformation }}</p>
                @if (canWrite) {
                  <button type="button" [disabled]="saving() || pendingIds()[item.associationId]" (click)="changeStatus(item)">
                    {{ item.associationStatus === 'ACTIVE' ? 'Inactivate' : 'Reactivate' }}
                  </button>
                }
                @if (rowErrors()[item.associationId]; as reason) { <p role="alert">{{ reason }}</p> }
              </li>
            }
          </ul>
        }
      }
    }
  `,
})
export class EstablishmentsPageComponent {
  private readonly source = inject(AssociatedEstablishmentsSource);
  // Without the container's writer this slice stays readable; no local adapter is substituted.
  private readonly writer = inject(AssociatedEstablishmentsWriter, { optional: true });
  private readonly actor = inject(ActorContext);
  protected readonly canWrite = !!this.writer && capabilitiesOf(this.actor.role, this.actor.collaboratorMayEditDescription).canRegister;
  protected readonly formOpen = signal(false);
  protected readonly formKey = signal(0);
  protected readonly saving = signal(false);
  protected readonly pendingIds = signal<Readonly<Record<string, boolean>>>({});
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});
  private readonly local = signal<EstablishmentsPageState | null>(null);
  protected readonly canRead = canReadEstablishments(inject(ActorContext));
  protected readonly types = ESTABLISHMENT_TYPES;
  protected readonly statuses = ASSOCIATION_STATUSES;
  protected readonly filters = signal<EstablishmentFilters>({});
  private readonly requests = new Subject<EstablishmentFilters>();
  private readonly listed = toSignal(this.requests.pipe(
    // RN-PE3: only the most recent request may supply the screen's next state.
    switchMap((filters) => this.source.list(filters).pipe(
      map((items): EstablishmentsPageState => items.length ? { kind: 'data', items } : { kind: 'empty' }),
      catchError(() => of<EstablishmentsPageState>({ kind: 'error', retry: () => this.reload() })),
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
        this.rowErrors.update((errors) => ({ ...errors, [item.associationId]: error?.userMessage ?? 'The request failed.' })); return EMPTY;
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
    if (!this.types.includes(value as EstablishmentType)) { return; }
    this.filters.update((filters) => ({ ...filters, establishmentType: value as EstablishmentType }));
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
  protected changeStatus(item: AssociatedEstablishment): void {
    if (!this.canWrite || this.saving() || this.pendingIds()[item.associationId]) { return; }
    this.pendingIds.update((ids) => ({ ...ids, [item.associationId]: true }));
    this.rowErrors.update(({ [item.associationId]: _previous, ...rest }) => rest); this.actions.next(item);
  }
}

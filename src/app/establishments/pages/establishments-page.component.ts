import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
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
  template: `
    @if (!canRead) {
      <p role="alert" data-state="denied">You do not have access to associated establishments.</p>
    } @else {
      <h1>Associated establishments</h1>
      <label for="establishment-type">Establishment type</label>
      <select id="establishment-type" aria-label="Establishment type"
        [value]="filters().establishmentType ?? ''" (change)="chooseType($event)">
        @for (type of types; track type) { <option [value]="type">{{ type }}</option> }
      </select>
      <label for="association-status">Association status</label>
      <select id="association-status" aria-label="Association status"
        [value]="filters().associationStatus ?? ''" (change)="chooseStatus($event)">
        <option value="">All statuses</option>
        @for (status of statuses; track status) { <option [value]="status">{{ status }}</option> }
      </select>
      @if (filters().establishmentType || filters().associationStatus) {
        <button type="button" (click)="clearFilters()">Clear filters</button>
      }
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">Loading</p> }
        @case ('error') {
          <div role="alert" data-state="error">
            <p>The request failed.</p>
            <button type="button" (click)="current.retry()">Retry</button>
          </div>
        }
        @case ('empty') { <p role="status" data-state="empty">No results</p> }
        @case ('data') {
          <ul data-state="data">
            @for (item of current.items; track item.associationId) {
              <li>{{ item.commercialName }} · {{ item.establishmentType }} · {{ item.associationStatus }}
                <p>{{ item.commercialInformation }}</p>
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
  protected readonly canRead = canReadEstablishments(inject(ActorContext));
  protected readonly types = ESTABLISHMENT_TYPES;
  protected readonly statuses = ASSOCIATION_STATUSES;
  protected readonly filters = signal<EstablishmentFilters>({});
  private readonly requests = new Subject<EstablishmentFilters>();
  readonly state = toSignal(this.requests.pipe(
    // RN-PE3: only the most recent request may supply the screen's next state.
    switchMap((filters) => this.source.list(filters).pipe(
      map((items): EstablishmentsPageState => items.length ? { kind: 'data', items } : { kind: 'empty' }),
      catchError(() => of<EstablishmentsPageState>({ kind: 'error', retry: () => this.reload() })),
      startWith<EstablishmentsPageState>({ kind: 'loading' }),
    )),
  ), { initialValue: { kind: 'loading' } as EstablishmentsPageState });

  constructor() { this.reload(); }

  reload(): void {
    if (this.canRead) { this.requests.next(this.filters()); }
  }

  protected chooseType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!this.types.includes(value as EstablishmentType)) { return; }
    this.filters.update((filters) => ({ ...filters, establishmentType: value as EstablishmentType }));
    this.reload();
  }

  protected chooseStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== '' && !this.statuses.includes(value as AssociationStatus)) { return; }
    const { associationStatus: _previous, ...rest } = this.filters();
    this.filters.set(value === '' ? rest : { ...rest, associationStatus: value as AssociationStatus });
    this.reload();
  }

  protected clearFilters(): void { this.filters.set({}); this.reload(); }
}

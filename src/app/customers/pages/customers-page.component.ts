import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext, CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { CatalogItem } from '../../catalog/model/catalog-item';
import { CustomerFormComponent } from '../components/customer-form.component';
import { CUSTOMERS_COPY, PERSON_LABELS, SENSITIVE_LABELS } from '../customers-copy';
import { CustomersSource, SensitiveDataAccess } from '../data/customers-source';
import { CustomerGroup, HighRiskField, Person, canViewSensitiveData, customersCapabilitiesOf } from '../model/customer-group';

type Ready = { kind: 'ready'; group: CustomerGroup | null; activities: readonly CatalogItem[] };
export type CustomersPageState = { kind: 'loading' } | { kind: 'error' } | Ready;

@Component({
  selector: 'app-customers-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, CustomerFormComponent],
  template: `
    @if (caps.isDenied) { <p role="alert">{{ text.denied }}</p> } @else {
      <section class="customers-page">
        <h1>{{ text.title }}</h1>
        <p class="customers-banner">{{ text.banner }}</p>
        @if (state().kind === 'loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @if (state().kind === 'error') { <div role="alert" data-state="error"><crp-read-error [state]="state()" [fallback]="text.failed" />&ngsp;<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @if (ready(); as current) {
          @if (current.group; as group) {
            <div data-state="data">
              <h2>{{ group.activityName }} @if (group.highRisk) { <span class="customers-badge">{{ text.highRisk }}</span> }</h2>
              <table class="customers-table">
                <thead><tr><th></th>@for (f of columns; track f) { <th>{{ labels[f] }}</th> }
                  @if (group.highRisk) { @for (s of sensitive; track s[0]) { <th>{{ s[1] }}</th> } }</tr></thead>
                <tbody>@for (person of people(group); track person.personId; let first = $first) {
                  <tr><td>{{ first ? text.lead : text.companion }}</td>@for (f of columns; track f) { <td>{{ person[f] }}</td> }
                    @if (group.highRisk) { @for (s of sensitive; track s[0]) {
                      <td>@if (seeSensitive) { {{ sensitiveValue(person, s[0]) }} } @else { <span class="customers-restricted">{{ text.restricted }}</span> }</td>
                    } }</tr>
                }</tbody>
              </table>
            </div>
          } @else { <p role="status" data-state="empty">{{ text.empty }}</p> }
          @if (caps.canRegister) {
            @if (!current.group || startingNew()) {
              <app-customer-form kind="lead" [activities]="current.activities" (saved)="onSaved($event)" />
            } @else {
              <button type="button" (click)="startingNew.set(true)">{{ text.newGroup }}</button>
              <app-customer-form kind="companion" [group]="current.group" (saved)="onSaved($event)" />
            }
          }
        }
      </section>
    }
  `,
})
export class CustomersPageComponent {
  private readonly role = inject(ActorContext).role;
  protected readonly caps = customersCapabilitiesOf(this.role);
  protected readonly seeSensitive = canViewSensitiveData(this.role, inject(SensitiveDataAccess).granted);
  private readonly source = inject(CustomersSource); private readonly catalog = inject(CatalogItemsSource);
  protected readonly text = CUSTOMERS_COPY; protected readonly labels = PERSON_LABELS; protected readonly sensitive = SENSITIVE_LABELS;
  protected readonly columns = ['fullName', 'document', 'contact', 'birthDate'] as const;
  protected readonly startingNew = signal(false); private readonly requests = new Subject<void>();
  private readonly local = signal<CustomersPageState | null>(null);
  private readonly loaded = toSignal(this.requests.pipe(switchMap(() => combineLatest([this.source.current(), this.catalog.list()]).pipe(
    map(([group, activities]): CustomersPageState => ({ kind: 'ready', group, activities })),
    catchError((error) => of<CustomersPageState>({ kind: 'error', ...readFailure(error) })), startWith<CustomersPageState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as CustomersPageState });
  readonly state = computed(() => this.local() ?? this.loaded());
  protected readonly ready = computed(() => { const s = this.state(); return s.kind === 'ready' ? s : null; });

  constructor() { this.reload(); }
  reload(): void { if (this.caps.canRead) { this.local.set(null); this.requests.next(); } }
  protected people(group: CustomerGroup): Person[] { return [group.lead, ...group.companions]; }
  protected sensitiveValue(person: Person, field: HighRiskField): string {
    const value = person.highRisk?.[field];
    return field === 'informedConsent' ? (value ? this.text.yes : '') : String(value ?? '');
  }
  protected onSaved(group: CustomerGroup): void {
    this.local.set({ kind: 'ready', group, activities: this.ready()?.activities ?? [] });
    this.startingNew.set(false);
  }
}

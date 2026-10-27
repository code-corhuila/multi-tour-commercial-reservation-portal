import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { CatalogItem } from '../../catalog/data/catalog-api.service';
import { CustomerFormComponent } from '../components/customer-form.component';
import { formatDate } from '../../shared/format';
import { CUSTOMERS_COPY, PERSON_LABELS, SENSITIVE_LABELS, companionCount } from '../customers-copy';
import { CustomersSource, SensitiveDataAccess } from '../data/customers-source';
import { CustomerGroup, HighRiskField, LEAD_FIELDS, PERSON_FIELDS, Person } from '../model/customer-group';
import { PortalCapabilities } from '../../shared/portal-capabilities';

type Ready = { kind: 'ready'; group: CustomerGroup | null; activities: readonly CatalogItem[] };
export type CustomersPageState = { kind: 'loading' } | { kind: 'error' } | Ready;

@Component({
  selector: 'app-customers-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, CustomerFormComponent],
  template: `
    @if (caps.isDenied) { <p role="alert">{{ text.denied }}</p> } @else {
      <section class="crp-customers-page">
        <header class="crp-page-header">
          <div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ text.entry }}</p>
            <h1 class="crp-page-header-title">{{ text.title }}</h1><p class="crp-page-header-desc">{{ text.description }}</p></div>
          @if (caps.canRegister && ready()?.group) {
            <button type="button" class="crp-operator-outline crp-page-header-action" (click)="startingNew.set(!startingNew())">{{ startingNew() ? text.cancel : text.newGroup }}</button>
          }
        </header>
        <p class="crp-customers-banner">{{ text.banner }}</p>
        @if (state().kind === 'loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @if (state().kind === 'error') { <div role="alert" data-state="error"><crp-read-error [state]="state()" [fallback]="text.failed" />&ngsp;<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @if (ready(); as current) {
          @if (leadFormOpen(current.group)) {
            @if (!current.group) { <p role="status" data-state="empty">{{ text.empty }}</p> }
            <app-customer-form kind="lead" [activities]="current.activities" (saved)="onSaved($event)" />
          } @else if (current.group; as group) {
            <div data-state="data">
              <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.leadEyebrow }}</p><h2>{{ text.leadTitle }}</h2>
                <p class="crp-customers-copy">{{ text.activity }}: <strong>{{ group.activityName }}</strong>
                  @if (group.highRisk) { <span class="crp-customers-badge">{{ text.highRisk }}</span> }</p>
                <dl class="crp-customers-grid crp-customers-details">@for (f of leadColumns; track f) { <div><dt>{{ labels[f] }}</dt><dd>{{ shown(group.lead, f) }}</dd></div> }</dl>
              </section>
              <section class="crp-operator-panel">
                <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.companionsEyebrow }}</p><h2>{{ text.companionsTitle }}</h2></div>
                  <span>{{ count(group.companions.length) }}</span></div>
                <p class="crp-customers-copy">{{ text.companionsCopy }}</p>
                @for (person of group.companions; track person.personId; let i = $index) {
                  <article class="crp-customers-card"><strong>{{ text.companion }} {{ i + 1 }}</strong>
                    <dl class="crp-customers-grid crp-customers-details">@for (f of companionColumns; track f) { <div><dt>{{ labels[f] }}</dt><dd>{{ shown(person, f) }}</dd></div> }</dl></article>
                }
                @if (caps.canRegister) {
                  <app-customer-form kind="companion" [group]="group" [position]="group.companions.length + 1" (saved)="onSaved($event)" />
                }
              </section>
              @if (group.highRisk) {
                <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.riskEyebrow }}</p><h2>{{ text.riskTitle }}</h2>
                  <p class="crp-customers-copy">{{ text.riskCopy }}</p>
                  @for (person of people(group); track person.personId; let first = $first; let i = $index) {
                    <article class="crp-customers-risk-card"><strong>{{ first ? text.lead : text.companion + ' ' + i }}</strong>
                      <dl class="crp-customers-grid crp-customers-details">@for (s of sensitive; track s[0]) { <div><dt>{{ s[1] }}</dt>
                        <dd>@if (seeSensitive) { {{ sensitiveValue(person, s[0]) }} } @else { <span class="crp-customers-restricted">{{ text.restricted }}</span> }</dd></div> }</dl>
                    </article>
                  }
                </section>
              }
            </div>
          } @else { <p role="status" data-state="empty">{{ text.empty }}</p> }
        }
      </section>
    }
  `,
})
export class CustomersPageComponent {
  private readonly capabilities = inject(PortalCapabilities);
  protected readonly caps = this.capabilities.customers();
  protected readonly seeSensitive = this.capabilities.canViewSensitiveData(inject(SensitiveDataAccess).granted);
  private readonly source = inject(CustomersSource); private readonly catalog = inject(CatalogItemsSource);
  protected readonly text = CUSTOMERS_COPY; protected readonly labels = PERSON_LABELS; protected readonly sensitive = SENSITIVE_LABELS;
  protected readonly leadColumns = LEAD_FIELDS; protected readonly companionColumns = PERSON_FIELDS; protected readonly count = companionCount;
  protected readonly startingNew = signal(false); private readonly requests = new Subject<void>();
  /** The lead form is drawn when the person may register and there is no group yet, or a new group was asked for. */
  protected leadFormOpen(group: unknown): boolean { return this.caps.canRegister && (!group || this.startingNew()); }
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
  protected shown(person: Person, field: (typeof LEAD_FIELDS)[number]): string {
    return field === 'birthDate' ? formatDate(person.birthDate) : person[field] ?? '';
  }
  protected sensitiveValue(person: Person, field: HighRiskField): string {
    const value = person.highRisk?.[field];
    return field === 'informedConsent' ? (value ? this.text.yes : '') : String(value ?? '');
  }
  protected onSaved(group: CustomerGroup): void {
    this.local.set({ kind: 'ready', group, activities: this.ready()?.activities ?? [] });
    this.startingNew.set(false);
  }
}

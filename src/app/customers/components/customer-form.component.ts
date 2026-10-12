import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, defer, exhaustMap, finalize, tap } from 'rxjs';
import { IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { CatalogItem } from '../../catalog/model/catalog-item';
import { ApiError } from '../../shell-contract';
import { CUSTOMERS_COPY, PERSON_LABELS } from '../customers-copy';
import { CustomersWriter } from '../data/customers-writer';
import { BLOOD_TYPES, CustomerGroup, LeadCommand, PERSON_FIELDS, PersonDraft, PersonField, PersonKind, personCommand, validatePerson } from '../model/customer-group';

interface Control { field: PersonField; label: string; type: 'text' | 'date' | 'checkbox' | 'select'; options?: readonly { value: string; label: string }[] }
let formSequence = 0;

/** One form for the lead (with the activity and the terms) and for each companion (plan D-05). */
@Component({
  selector: 'app-customer-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate class="customers-form" [attr.aria-busy]="pending()" (submit)="submit($event)">
      <h2>{{ kind() === 'lead' ? text.lead : text.companion }}</h2>
      @for (c of controls(); track c.field) {
        <div class="customers-field"><label [for]="id(c.field)">{{ c.label }}</label>
          @switch (c.type) {
            @case ('select') {
              <select [id]="id(c.field)" [name]="c.field" [disabled]="pending()" [attr.aria-invalid]="messages()[c.field] ? 'true' : null"
                [attr.aria-describedby]="errorId(c.field)" (change)="edit(c.field, $event)">
                @for (o of c.options; track o.value) { <option [value]="o.value" [selected]="draft()[c.field] === o.value">{{ o.label }}</option> }
              </select>
            }
            @case ('checkbox') {
              <input type="checkbox" [id]="id(c.field)" [name]="c.field" [disabled]="pending()" [checked]="draft()[c.field] === 'true'"
                [attr.aria-invalid]="messages()[c.field] ? 'true' : null" [attr.aria-describedby]="errorId(c.field)" (change)="edit(c.field, $event)">
            }
            @default {
              <input [type]="c.type" [id]="id(c.field)" [name]="c.field" [disabled]="pending()" [value]="draft()[c.field] ?? ''"
                [attr.aria-invalid]="messages()[c.field] ? 'true' : null" [attr.aria-describedby]="errorId(c.field)" (input)="edit(c.field, $event)">
            }
          }
          @if (messages()[c.field]; as reason) { <p role="alert" class="customers-error" [id]="id(c.field) + '-error'">{{ reason }}</p> }
        </div>
      }
      @if (pending()) { <p role="status">{{ text.saving }}</p> }
      @if (refused()) { <p role="alert" class="customers-error">{{ refused() }}</p> }
      <button type="submit" [disabled]="pending()">{{ kind() === 'lead' ? text.registerLead : text.addCompanion }}</button>
    </form>
  `,
})
export class CustomerFormComponent {
  readonly kind = input.required<PersonKind>();
  readonly group = input<CustomerGroup | null>(null);
  readonly activities = input<readonly CatalogItem[]>([]);
  readonly saved = output<CustomerGroup>();
  private readonly writer = inject(CustomersWriter); private readonly keys = inject(IdempotencyKeys);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `customer-form-${formSequence++}`; protected readonly text = CUSTOMERS_COPY;
  protected readonly draft = signal<PersonDraft>({}); protected readonly pending = signal(false);
  protected readonly refused = signal(''); private readonly submitted = signal(false);
  private readonly highRisk = computed(() => this.kind() === 'lead'
    ? !!this.activities().find((a) => a.serviceId === this.draft().serviceId)?.highRisk : !!this.group()?.highRisk);
  protected readonly messages = computed(() => this.submitted() ? validatePerson(this.draft(), this.kind(), this.highRisk(), this.group()) : {});
  protected readonly controls = computed<Control[]>(() => {
    const lead = this.kind() === 'lead';
    const activities = this.activities().filter((a) => a.catalogStatus === 'ACTIVE').map((a) => ({ value: a.serviceId, label: a.commercialName }));
    return [
      ...(lead ? [{ field: 'serviceId', label: this.text.activity, type: 'select', options: [{ value: '', label: this.text.chooseActivity }, ...activities] } as Control] : []),
      ...PERSON_FIELDS.map((field): Control => ({ field, label: PERSON_LABELS[field], type: field === 'birthDate' ? 'date' : 'text' })),
      ...(lead ? [{ field: 'acceptedTerms', label: this.text.terms, type: 'checkbox' } as Control] : []),
      ...(this.highRisk() ? [
        { field: 'informedConsent', label: PERSON_LABELS.informedConsent, type: 'checkbox' },
        { field: 'bloodType', label: PERSON_LABELS.bloodType, type: 'select', options: ['', ...BLOOD_TYPES].map((value) => ({ value, label: value || '—' })) },
        { field: 'emergencyContact', label: PERSON_LABELS.emergencyContact, type: 'text' },
        { field: 'physicalRestrictions', label: PERSON_LABELS.physicalRestrictions, type: 'text' },
      ] as Control[] : []),
    ];
  });
  private readonly submissions = new Subject<ReturnType<typeof personCommand>>();

  constructor() {
    this.submissions.pipe(exhaustMap((command) => defer(() => this.kind() === 'lead'
      ? this.writer.registerLead(command as LeadCommand, this.key)
      : this.writer.addCompanion(this.group()!.groupId, command, this.key)).pipe(
      tap((group) => { this.key = this.keys.generate(); this.fingerprint = null; this.draft.set({}); this.submitted.set(false); this.saved.emit(group); }),
      catchError((error: Partial<ApiError> | null) => { this.refused.set(error?.userMessage ?? this.text.refused); return EMPTY; }),
      finalize(() => this.pending.set(false)),
    )), takeUntilDestroyed()).subscribe();
  }

  protected id(field: PersonField): string { return `${this.prefix}-${field}`; }
  protected errorId(field: PersonField): string | null { return this.messages()[field] ? `${this.id(field)}-error` : null; }
  protected edit(field: PersonField, event: Event): void {
    if (this.pending()) return;
    const target = event.target as HTMLInputElement;
    this.draft.update((d) => ({ ...d, [field]: target.type === 'checkbox' ? (target.checked ? 'true' : '') : target.value }));
    this.refused.set('');
  }
  protected submit(event: Event): void {
    event.preventDefault(); if (this.pending()) return;
    this.submitted.set(true); this.refused.set('');
    if (Object.keys(validatePerson(this.draft(), this.kind(), this.highRisk(), this.group())).length) return;
    const command = personCommand(this.draft(), this.kind(), this.highRisk()), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true); this.submissions.next(command);
  }
}

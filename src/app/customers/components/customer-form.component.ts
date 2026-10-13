import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, defer, exhaustMap, finalize, tap } from 'rxjs';
import { CatalogItem } from '../../catalog/data/catalog-api.service';
import { ApiError } from '../../shell-contract';
import { CUSTOMERS_COPY, PERSON_LABELS } from '../customers-copy';
import { CustomersWriter } from '../data/customers-writer';
import { CustomerGroup, LEAD_FIELDS, LeadCommand, PERSON_FIELDS, PersonDraft, PersonField, PersonKind, personCommand, validatePerson } from '../model/customer-group';
import { IdempotencyKeys } from '../../shared/idempotency-keys';

interface Control { field: PersonField; label: string; type: 'text' | 'email' | 'tel' | 'date' | 'checkbox' | 'select'; options?: readonly { value: string; label: string }[]; placeholder?: string }
let formSequence = 0;

/** One form for the lead (panel 01, with the tour and the terms) and one card per companion (panel 03) of screen 10B (plan D-05). */
@Component({
  selector: 'app-customer-form', changeDetection: ChangeDetectionStrategy.OnPush, imports: [NgTemplateOutlet],
  template: `
    <ng-template #fields let-list>
      @for (c of asControls(list); track c.field) {
        @if (c.type === 'checkbox') {
          <div class="customers-field customers-wide"><label class="customers-check" [for]="id(c.field)"><input type="checkbox" [id]="id(c.field)" [name]="c.field"
              [disabled]="pending()" [checked]="draft()[c.field] === 'true'" [attr.aria-invalid]="messages()[c.field] ? 'true' : null"
              [attr.aria-describedby]="errorId(c.field)" (change)="edit(c.field, $event)"> {{ c.label }}</label>
            @if (messages()[c.field]; as reason) { <p role="alert" class="customers-error" [id]="id(c.field) + '-error'">{{ reason }}</p> }</div>
        } @else {
          <div class="customers-field" [class.customers-wide]="c.field === 'physicalRestrictions'"><label [for]="id(c.field)">{{ c.label }}</label>
            @if (c.type === 'select') {
              <select [id]="id(c.field)" [name]="c.field" [disabled]="pending()" [attr.aria-invalid]="messages()[c.field] ? 'true' : null"
                [attr.aria-describedby]="errorId(c.field)" (change)="edit(c.field, $event)">
                @for (o of c.options; track o.value) { <option [value]="o.value" [selected]="draft()[c.field] === o.value">{{ o.label }}</option> }
              </select>
            } @else {
              <input [type]="c.type" [id]="id(c.field)" [name]="c.field" [disabled]="pending()" [value]="draft()[c.field] ?? ''" [attr.placeholder]="c.placeholder ?? null"
                [attr.aria-invalid]="messages()[c.field] ? 'true' : null" [attr.aria-describedby]="errorId(c.field)" (input)="edit(c.field, $event)">
            }
            @if (messages()[c.field]; as reason) { <p role="alert" class="customers-error" [id]="id(c.field) + '-error'">{{ reason }}</p> }</div>
        }
      }
    </ng-template>
    <form novalidate class="customers-form" [attr.aria-busy]="pending()" (submit)="submit($event)">
      @if (kind() === 'lead') {
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.leadEyebrow }}</p><h2>{{ text.leadTitle }}</h2>
          <div class="customers-grid"><ng-container *ngTemplateOutlet="fields; context: { $implicit: personControls() }" /></div></section>
        @if (highRisk()) {
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.riskEyebrow }}</p><h2>{{ text.riskTitle }}</h2>
            <p class="customers-copy">{{ text.riskCopy }}</p>
            <article class="customers-risk-card"><strong>{{ text.lead }}</strong>
              <div class="customers-grid"><ng-container *ngTemplateOutlet="fields; context: { $implicit: riskControls() }" /></div></article></section>
        }
      } @else {
        <article class="customers-card"><strong>{{ text.companion }} {{ position() }}</strong>
          <div class="customers-grid"><ng-container *ngTemplateOutlet="fields; context: { $implicit: personControls() }" />
            @if (highRisk()) { <ng-container *ngTemplateOutlet="fields; context: { $implicit: riskControls() }" /> }</div></article>
      }
      <div class="crp-form-actions">
        @if (pending()) { <p role="status">{{ text.saving }}</p> }
        @if (refused()) { <p role="alert" class="customers-error">{{ refused() }}</p> }
        <button type="submit" [disabled]="pending()">{{ kind() === 'lead' ? text.registerLead : text.addCompanion }}</button>
      </div>
    </form>
  `,
})
export class CustomerFormComponent {
  readonly kind = input.required<PersonKind>();
  readonly group = input<CustomerGroup | null>(null);
  readonly activities = input<readonly CatalogItem[]>([]);
  /** The number on the companion card: `Acompañante 2`. */
  readonly position = input(1);
  readonly saved = output<CustomerGroup>();
  private readonly writer = inject(CustomersWriter); private readonly keys = inject(IdempotencyKeys);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `customer-form-${formSequence++}`; protected readonly text = CUSTOMERS_COPY;
  protected readonly draft = signal<PersonDraft>({}); protected readonly pending = signal(false);
  protected readonly refused = signal(''); private readonly submitted = signal(false);
  protected readonly highRisk = computed(() => this.kind() === 'lead'
    ? !!this.activities().find((a) => a.serviceId === this.draft().serviceId)?.highRisk : !!this.group()?.highRisk);
  protected readonly messages = computed(() => this.submitted() ? validatePerson(this.draft(), this.kind(), this.highRisk(), this.group()) : {});
  private static readonly TYPES: Partial<Record<PersonField, Control['type']>> = { email: 'email', contact: 'tel', birthDate: 'date' };
  protected readonly personControls = computed<Control[]>(() => {
    const lead = this.kind() === 'lead';
    const activities = this.activities().filter((a) => a.catalogStatus === 'ACTIVE').map((a) => ({ value: a.serviceId, label: a.commercialName }));
    return [
      ...(lead ? [{ field: 'serviceId', label: this.text.activity, type: 'select', options: [{ value: '', label: this.text.chooseActivity }, ...activities] } as Control] : []),
      ...(lead ? LEAD_FIELDS : PERSON_FIELDS).map((field): Control => ({ field, label: PERSON_LABELS[field], type: CustomerFormComponent.TYPES[field] ?? 'text' })),
      ...(lead ? [{ field: 'acceptedTerms', label: this.text.terms, type: 'checkbox' } as Control] : []),
    ];
  });
  protected readonly riskControls = computed<Control[]>(() => this.highRisk() ? [
    // DP-PC2 is open (no closed list of blood types yet): a text field, as screen 10B draws it.
    { field: 'bloodType', label: PERSON_LABELS.bloodType, type: 'text', placeholder: 'Ej. O+' },
    { field: 'emergencyContact', label: PERSON_LABELS.emergencyContact, type: 'text', placeholder: 'Nombre y teléfono' },
    { field: 'physicalRestrictions', label: PERSON_LABELS.physicalRestrictions, type: 'text', placeholder: 'Indica restricciones o escribe Ninguna.' },
    { field: 'informedConsent', label: PERSON_LABELS.informedConsent, type: 'checkbox' },
  ] : []);
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

  protected asControls(list: unknown): readonly Control[] { return list as readonly Control[]; }
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

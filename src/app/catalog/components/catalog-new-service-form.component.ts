import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '../../shell-contract';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { MoneyRejection, parseMoney } from '../../shared/money';
import { NEW_SERVICE_COPY as COPY } from '../catalog-new-service-copy';
import { CatalogItemsSource, CatalogItemsWriter } from '../data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand } from '../model/catalog-item';

// Declared debt (spec.md DD-11, DD-14): capacity, transport, the image and the per-person rate are not defined for this portal;
// the screen draws them as the mockup does and the container adapter drops what the contract does not know (G-B).

type Field = 'kind' | 'name' | 'type' | 'capacity' | 'restrictions' | 'includesTransport' | 'transportKey' | 'image' | 'route' | 'rate' | 'policy' | 'cost' | 'highRisk' | 'validFrom' | 'validTo';
type Draft = Readonly<Record<Field, string>>;
type Messages = Partial<Record<Field, string>>;

const EMPTY: Draft = { kind: 'operational', name: '', type: 'tour', capacity: '', restrictions: '', includesTransport: 'no', transportKey: '', image: '', route: '', rate: '', policy: 'first-valid-payment', cost: '', highRisk: 'no', validFrom: '', validTo: '' };
const WIRE_FIELDS: Readonly<Record<string, Field>> = {
  commercialName: 'name', baseRateCents: 'rate', baseOperationalCostCents: 'cost', configuredCapacity: 'capacity',
  transportRequired: 'includesTransport', highRisk: 'highRisk', validFrom: 'validFrom', validTo: 'validTo', serviceType: 'type',
};
const MONEY_ERRORS: Readonly<Record<MoneyRejection, string>> = {
  empty: COPY.errors.required, format: COPY.errors.format, 'too-many-decimals': COPY.errors.decimals, negative: COPY.errors.negative, 'out-of-range': COPY.errors.range,
};
const WHOLE_NUMBER = /^[1-9]\d*$/;

/** The command when every field is valid, otherwise the message of each field that is not (money is parsed from the typed text, RN-P7). */
function validate(draft: Draft): { command: CreateCatalogItemCommand | null; messages: Messages } {
  const messages: Messages = {};
  const rate = parseMoney(draft.rate);
  const cost = parseMoney(draft.cost);
  const capacity = draft.capacity.trim();
  if (draft.name.trim() === '') { messages.name = COPY.errors.required; }
  if (draft.type === 'tour' && draft.includesTransport === 'si' && draft.transportKey === '') { messages.transportKey = COPY.errors.transportRequired; }
  if (draft.image === '') { messages.image = COPY.errors.requiredFem; }
  if (rate.kind === 'invalid') { messages.rate = MONEY_ERRORS[rate.reason]; }
  if (cost.kind === 'invalid') { messages.cost = MONEY_ERRORS[cost.reason]; }
  // A tour needs its capacity (like the edit form and the API); a transport may go without it.
  if (capacity === '' && draft.type === 'tour') { messages.capacity = COPY.errors.capacityRequiredForTour; }
  else if (capacity !== '' && !WHOLE_NUMBER.test(capacity)) { messages.capacity = COPY.errors.wholeNumber; }
  // The validity is optional (the API has none); a typed date is still checked.
  for (const name of ['validFrom', 'validTo'] as const) {
    if (draft[name] !== '' && Number.isNaN(Date.parse(draft[name]))) { messages[name] = COPY.errors.invalidDate; }
  }
  if (draft.validFrom !== '' && draft.validTo !== '' && draft.validTo < draft.validFrom) { messages.validTo = COPY.errors.validityOrder; }
  if (rate.kind === 'invalid' || cost.kind === 'invalid' || Object.keys(messages).length > 0) { return { command: null, messages }; }
  const tour = draft.type === 'tour';
  const restrictions = draft.restrictions.trim();
  const route = draft.route.trim();
  return {
    messages,
    command: {
      serviceType: tour ? 'TOUR' : 'TRANSPORTATION', commercialName: draft.name.trim(), baseRateCents: rate.minorUnits, baseOperationalCostCents: cost.minorUnits,
      ...(capacity === '' ? {} : { configuredCapacity: Number(capacity) }),
      // "¿Incluye transporte?" is the mockup's face of the spec's "Transporte obligatorio".
      transportRequired: tour && draft.includesTransport === 'si', highRisk: draft.highRisk === 'si',
      ...(draft.validFrom === '' ? {} : { validFrom: draft.validFrom }),
      ...(draft.validTo === '' ? {} : { validTo: draft.validTo }),
      ...(restrictions === '' ? {} : { operationalRestrictions: restrictions }),
      ...(tour || route === '' ? {} : { route }),
    },
  };
}

const isApiError = (value: unknown): value is ApiError => typeof value === 'object' && value !== null && typeof (value as ApiError).userMessage === 'string';
let nextFormId = 0;

/** admin-nuevo-servicio.html: two stacked cards (01 Producto, 02 Condiciones y publicación) that register a tour or a transport resource. */
@Component({
  selector: 'app-catalog-new-service-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #error let-name>
      @if (message(name); as text) { <p role="alert" class="crp-catalog-error" [id]="id(name) + '-error'">{{ text }}</p> }
    </ng-template>
    <ng-template #text let-name let-label="label" let-type="type" let-placeholder="placeholder">
      <div class="crp-catalog-field">
        <label [for]="id(name)">{{ label }}</label>
        @if (type === 'textarea') {
          <textarea [id]="id(name)" [value]="value(name)" [placeholder]="placeholder" (input)="set(name, $event)"></textarea>
        } @else {
          <input [type]="type" [id]="id(name)" [value]="value(name)" [placeholder]="placeholder" [attr.aria-invalid]="message(name) ? 'true' : null"
            [attr.aria-describedby]="message(name) ? id(name) + '-error' : null" (input)="set(name, $event)" />
        }
        <ng-container *ngTemplateOutlet="error; context: { $implicit: name }" />
      </div>
    </ng-template>
    <ng-template #choice let-name let-label="label" let-options="options" let-wide="wide">
      <div class="crp-catalog-field" [class.crp-catalog-wide]="wide">
        <label [for]="id(name)">{{ label }}</label>
        <select [id]="id(name)" [attr.aria-invalid]="message(name) ? 'true' : null" [attr.aria-describedby]="message(name) ? id(name) + '-error' : null" (change)="set(name, $event)">
          @for (option of options; track option.value) { <option [value]="option.value" [selected]="value(name) === option.value" [disabled]="option.disabled">{{ option.label }}</option> }
        </select>
        <ng-container *ngTemplateOutlet="error; context: { $implicit: name }" />
      </div>
    </ng-template>
    <form class="crp-catalog-new-service" novalidate (submit)="submit($event)">
      <section class="crp-operator-panel">
        <p class="crp-operator-eyebrow">{{ copy.product.eyebrow }}</p>
        <h2>{{ copy.product.title }}</h2>
        <p class="crp-operator-copy">{{ copy.product.intro }}</p>
        <div class="crp-form-grid">
          <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'kind', label: copy.labels.kind, options: kinds(), wide: true }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'name', label: copy.labels.name, type: 'text', placeholder: copy.placeholders.name }" />
          <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'type', label: copy.labels.type, options: types }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'capacity', label: copy.labels.capacity, type: 'text', placeholder: copy.placeholders.capacity }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'restrictions', label: copy.labels.restrictions, type: 'textarea', placeholder: copy.placeholders.restrictions }" />
          @if (isTour()) {
            <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'includesTransport', label: copy.labels.includesTransport, options: yesNo }" />
            @if (draft().includesTransport === 'si') {
              <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'transportKey', label: copy.labels.transport, options: transportOptions() }" />
              @if (transports().length === 0) { <p class="crp-catalog-note crp-catalog-wide">{{ copy.transportEmpty }}</p> }
            }
          } @else {
            <ng-container *ngTemplateOutlet="text; context: { $implicit: 'route', label: copy.labels.route, type: 'text', placeholder: '' }" />
          }
        </div>
      </section>
      <section class="crp-operator-panel">
        <p class="crp-operator-eyebrow">{{ copy.conditions.eyebrow }}</p>
        <h2>{{ copy.conditions.title }}</h2>
        <div class="crp-form-grid">
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'rate', label: isTour() ? copy.labels.rate : copy.labels.ratePerPerson, type: 'text', placeholder: '' }" />
          <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'policy', label: copy.labels.policy, options: policies }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'cost', label: copy.labels.cost, type: 'text', placeholder: '' }" />
          <ng-container *ngTemplateOutlet="choice; context: { $implicit: 'highRisk', label: copy.labels.highRisk, options: yesNo }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'validFrom', label: copy.labels.validFrom, type: 'date', placeholder: '' }" />
          <ng-container *ngTemplateOutlet="text; context: { $implicit: 'validTo', label: copy.labels.validTo, type: 'date', placeholder: '' }" />
          <div class="crp-catalog-field crp-catalog-wide">
            <label [for]="id('image')">{{ copy.labels.image }}</label>
            <input type="file" accept="image/*" [id]="id('image')" [attr.aria-invalid]="message('image') ? 'true' : null"
              [attr.aria-describedby]="message('image') ? id('image') + '-error' : null" (change)="setImage($event)" />
            <ng-container *ngTemplateOutlet="error; context: { $implicit: 'image' }" />
          </div>
        </div>
      </section>
      <p class="crp-catalog-note">{{ copy.note }}</p>
      @for (reason of refusal(); track $index) { <p role="alert" class="crp-catalog-error">{{ reason }}</p> }
      <div class="crp-form-actions">
        <button class="crp-operator-outline" type="button" [disabled]="pending()" (click)="cancelled.emit()">{{ copy.cancel }}</button>
        <button class="crp-operator-primary" type="submit" [disabled]="pending()">{{ copy.save }}</button>
      </div>
    </form>
  `,
})
export class CatalogNewServiceFormComponent {
  protected readonly copy = COPY;
  private readonly writer = inject(CatalogItemsWriter);
  private readonly source = inject(CatalogItemsSource);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);
  private readonly formId = `catalog-new-service-${nextFormId++}`;
  /** One per create intention, born with the form and kept by a refusal, so a retry is the same intention (D-07). */
  private readonly idempotencyKey = inject(IdempotencyKeys).generate();

  /** HU-COM-002 owns the establishments form: the option is drawn but disabled while the build has no such area. */
  readonly establishmentsAvailable = input(false);
  readonly saved = output<CatalogItem>();
  readonly cancelled = output<void>();
  readonly establishmentChosen = output<void>();

  protected readonly draft = signal<Draft>(EMPTY);
  protected readonly pending = signal(false);
  protected readonly refusal = signal<readonly string[]>([]);
  private readonly attempted = signal(false);
  private readonly refused = signal<Messages>({});
  protected readonly isTour = computed(() => this.draft().type === 'tour');
  protected readonly messages = computed<Messages>(() => ({ ...this.refused(), ...(this.attempted() ? validate(this.draft()).messages : {}) }));

  /** The active transport resources a tour can include (RN-TRA-001); the mockup lists only those. */
  protected readonly transports = signal<readonly CatalogItem[]>([]);
  protected readonly transportOptions = computed(() => [{ value: '', label: COPY.transportPlaceholder }, ...this.transports().map((each) => ({ value: each.serviceId, label: each.commercialName }))]);

  protected readonly types = [{ value: 'tour', label: COPY.types.tour }, { value: 'transport', label: COPY.types.transport }];
  protected readonly yesNo = [{ value: 'no', label: COPY.yesNo.no }, { value: 'si', label: COPY.yesNo.yes }];
  protected readonly policies = [{ value: 'first-valid-payment', label: COPY.policy }];
  protected readonly kinds = computed(() => [{ value: 'operational', label: COPY.kinds.operational }, { value: 'establishment', label: COPY.kinds.establishment, disabled: !this.establishmentsAvailable() }]);

  constructor() {
    this.source.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.transports.set(items.filter((each) => each.serviceType === 'TRANSPORTATION' && each.catalogStatus === 'ACTIVE')),
      // Without the list the select only offers its placeholder; the form does not break.
      error: () => this.transports.set([]),
    });
  }

  protected id(name: string): string { return `${this.formId}-${name}`; }
  protected value(name: Field): string { return this.draft()[name]; }
  protected message(name: Field): string | undefined { return this.messages()[name]; }

  protected set(name: Field, event: Event): void {
    const control = event.target as HTMLInputElement;
    if (name === 'kind' && control.value === 'establishment') {
      control.value = EMPTY.kind;
      this.establishmentChosen.emit();
      return;
    }
    this.draft.update((current) => ({ ...current, [name]: control.value }));
    this.refused.update(({ [name]: _cleared, ...rest }) => rest);
  }

  /** The mockup keeps the file as the service image; the contract has no field for it yet, so only its presence is checked (G-B). */
  protected setImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.draft.update((current) => ({ ...current, image: file?.name ?? '' }));
    this.refused.update(({ image: _cleared, ...rest }) => rest);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    // Checked before anything else: a second click arrives before the button is rendered disabled.
    if (this.pending()) { return; }
    this.attempted.set(true);
    const { command } = validate(this.draft());
    if (command === null) { this.focusFirstErrorOnRender(); return; }
    this.pending.set(true);
    this.refused.set({});
    this.refusal.set([]);
    this.writer.create(command, this.idempotencyKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (stored) => { this.pending.set(false); this.saved.emit(stored); },
      // The draft stays as typed: a refusal keeps what the person wrote (RN-P10).
      error: (error: unknown) => { this.pending.set(false); this.showRefusal(error); },
    });
  }

  private showRefusal(error: unknown): void {
    if (!isApiError(error)) { this.refusal.set([COPY.errors.requestFailed]); return; }
    const fields: Messages = {};
    const unplaced: string[] = [];
    for (const detail of Array.isArray(error.details) ? error.details : []) {
      const field = WIRE_FIELDS[detail.field];
      if (field) { fields[field] = detail.message; } else { unplaced.push(detail.message); }
    }
    this.refused.set(fields);
    this.refusal.set([error.userMessage, ...unplaced]);
    this.focusFirstErrorOnRender();
  }

  /** HC-4: once the errors are drawn, the focus goes to the first field in error. */
  private focusFirstErrorOnRender(): void {
    afterNextRender(() => focusFirstError(this.host.nativeElement), { injector: this.injector });
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '../../shell-contract';
import { CatalogItemsWriter, IdempotencyKeys } from '../data/catalog-api.service';
import { CATALOG_SERVICE_TYPES, CatalogItem, CatalogServiceType, UpdateCatalogItemCommand, UpdateDescriptionCommand } from '../model/catalog-item';
import { MoneyRejection, formatMoney, parseMoney } from '../model/money';

// Declared debt (spec.md DD-11): these fields are the columns of catalog_services, which wait for
// DP-01 (what a tour is) and G-H (who owns the operational cost).
// Declared debt (spec.md DD-14): the per-person transport rate has no column (G-E), so the form
// cannot offer it yet.

type TextField = 'commercialName' | 'baseRate' | 'baseOperationalCost' | 'configuredCapacity';
type CheckField = 'transportRequired' | 'highRisk';
type FieldName = TextField | CheckField | 'serviceType';

interface Draft {
  readonly serviceType: CatalogServiceType;
  readonly commercialName: string;
  /** Money stays as typed until it is parsed, so a refusal never rewrites what the person wrote. */
  readonly baseRate: string;
  readonly baseOperationalCost: string;
  readonly configuredCapacity: string;
  readonly transportRequired: boolean;
  /** Explicit, never defaulted behind the person: it starts unchecked and visible. */
  readonly highRisk: boolean;
}

type FieldMessages = Partial<Record<FieldName, string>>;

const CHECK_FIELDS: ReadonlyArray<{ readonly name: CheckField; readonly label: string }> = [
  { name: 'transportRequired', label: 'Transport required' },
  { name: 'highRisk', label: 'High risk' },
];

const TEXT_FIELDS: ReadonlyArray<{ readonly name: TextField; readonly label: string }> = [
  { name: 'commercialName', label: 'Commercial name' },
  { name: 'baseRate', label: 'Base rate' },
  { name: 'baseOperationalCost', label: 'Base operational cost' },
  { name: 'configuredCapacity', label: 'Configured capacity' },
];

/** The service may name a field by its wire name (cents) or by the form name; both land on one control. */
const FIELD_OF_WIRE_NAME: Readonly<Record<string, FieldName>> = {
  serviceType: 'serviceType',
  commercialName: 'commercialName',
  baseRate: 'baseRate',
  baseRateCents: 'baseRate',
  baseOperationalCost: 'baseOperationalCost',
  baseOperationalCostCents: 'baseOperationalCost',
  configuredCapacity: 'configuredCapacity',
  transportRequired: 'transportRequired',
  highRisk: 'highRisk',
};

const MONEY_MESSAGES: Readonly<Record<MoneyRejection, string>> = {
  empty: 'Required',
  format: 'Use digits and a dot, for example 12.50',
  'too-many-decimals': 'Use at most two decimals',
  negative: 'Cannot be negative',
  'out-of-range': 'Too large',
};

/** A tour needs its capacity for the departures; a transportation item may go without (draft contract). */
const CAPACITY_REQUIRED_FOR: CatalogServiceType = 'TOUR';
const WHOLE_NUMBER = /^[1-9]\d*$/;
const REQUEST_FAILED = 'The request failed.';

function toDraft(item: CatalogItem | undefined): Draft {
  return {
    serviceType: item?.serviceType ?? CATALOG_SERVICE_TYPES[0],
    commercialName: item?.commercialName ?? '',
    baseRate: item ? formatMoney(item.baseRateCents) : '',
    baseOperationalCost: item ? formatMoney(item.baseOperationalCostCents) : '',
    configuredCapacity: item?.configuredCapacity != null ? String(item.configuredCapacity) : '',
    transportRequired: item?.transportRequired ?? false,
    highRisk: item?.highRisk ?? false,
  };
}

/** The command if every field is valid, otherwise the message of each field that is not. */
/** The fields shared by registering and changing; the type is added only when registering. */
function validate(draft: Draft): { command: UpdateCatalogItemCommand | null; messages: FieldMessages } {
  const messages: FieldMessages = {};
  if (draft.commercialName.trim() === '') {
    messages.commercialName = 'Required';
  }
  const rate = parseMoney(draft.baseRate);
  if (rate.kind === 'invalid') {
    messages.baseRate = MONEY_MESSAGES[rate.reason];
  }
  const cost = parseMoney(draft.baseOperationalCost);
  if (cost.kind === 'invalid') {
    messages.baseOperationalCost = MONEY_MESSAGES[cost.reason];
  }
  const capacityText = draft.configuredCapacity.trim();
  if (capacityText === '' && draft.serviceType === CAPACITY_REQUIRED_FOR) {
    messages.configuredCapacity = 'Required for a tour';
  } else if (capacityText !== '' && !WHOLE_NUMBER.test(capacityText)) {
    messages.configuredCapacity = 'Use a whole number of 1 or more';
  }
  if (rate.kind === 'invalid' || cost.kind === 'invalid' || Object.keys(messages).length > 0) {
    return { command: null, messages };
  }
  return {
    messages,
    command: {
      commercialName: draft.commercialName.trim(),
      baseRateCents: rate.minorUnits,
      baseOperationalCostCents: cost.minorUnits,
      configuredCapacity: capacityText === '' ? null : Number(capacityText),
      transportRequired: draft.transportRequired,
      highRisk: draft.highRisk,
    },
  };
}

/** What a Collaborator may change (AC-P1.6): only the commercial name, so only it is validated and sent. */
function validateDescription(draft: Draft): { command: UpdateDescriptionCommand | null; messages: FieldMessages } {
  if (draft.commercialName.trim() === '') {
    return { command: null, messages: { commercialName: 'Required' } };
  }
  return { command: { commercialName: draft.commercialName.trim() }, messages: {} };
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && typeof (value as ApiError).userMessage === 'string';
}

let nextFormId = 0;

@Component({
  selector: 'app-catalog-item-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate (submit)="submit($event)">
      @if (scope() === 'all') {
      <div>
        <label [for]="id('serviceType')">Service type</label>
        <select
          [id]="id('serviceType')"
          [disabled]="item() !== undefined"
          [attr.aria-invalid]="messages().serviceType ? 'true' : null"
          [attr.aria-describedby]="describedBy('serviceType')"
          (change)="onType($event)"
        >
          @for (type of serviceTypes; track type) {
            <option [value]="type" [selected]="draft().serviceType === type">{{ type }}</option>
          }
        </select>
        @if (messages().serviceType; as text) {
          <p role="alert" [id]="id('serviceType') + '-error'">{{ text }}</p>
        }
      </div>
      }
      @for (field of shownTextFields(); track field.name) {
        <div>
          <label [for]="id(field.name)">{{ field.label }}</label>
          <input
            type="text"
            [id]="id(field.name)"
            [value]="draft()[field.name]"
            [attr.aria-invalid]="messages()[field.name] ? 'true' : null"
            [attr.aria-describedby]="describedBy(field.name)"
            (input)="onText(field.name, $event)"
          />
          @if (messages()[field.name]; as text) {
            <p role="alert" [id]="id(field.name) + '-error'">{{ text }}</p>
          }
        </div>
      }
      @if (scope() === 'all') {
      @for (field of checkFields; track field.name) {
        <div>
          <input
            type="checkbox"
            [id]="id(field.name)"
            [checked]="draft()[field.name]"
            [attr.aria-invalid]="messages()[field.name] ? 'true' : null"
            [attr.aria-describedby]="describedBy(field.name)"
            (change)="onCheck(field.name, $event)"
          />
          <label [for]="id(field.name)">{{ field.label }}</label>
          @if (messages()[field.name]; as text) {
            <p role="alert" [id]="id(field.name) + '-error'">{{ text }}</p>
          }
        </div>
      }
      }
      <div class="crp-form-actions">
      <button class="crp-primary" type="submit" [disabled]="pending()">Save</button>
      <!-- Disabled while saving: closing the form then would drop the answer of a save in flight. -->
      <button class="crp-outline" type="button" [disabled]="pending()" (click)="cancelled.emit()">Cancel</button>
      </div>
      @for (text of formMessages(); track $index) {
        <p role="alert">{{ text }}</p>
      }
    </form>
  `,
})
export class CatalogItemFormComponent implements OnInit {
  private readonly writer = inject(CatalogItemsWriter);
  private readonly keys = inject(IdempotencyKeys);
  private readonly destroyRef = inject(DestroyRef);
  /**
   * One per registration intention, born when the form opens and not when it is submitted (D-07):
   * a key made at submit would give a double click two keys, which is the duplicate it prevents.
   * A refusal keeps it so the retry is the same intention; only a saved item makes a new one.
   */
  private idempotencyKey: string | null = null;
  private readonly formId = `catalog-item-form-${nextFormId++}`;

  /** Present to edit an item; absent to register a new one. */
  readonly item = input<CatalogItem | undefined>(undefined);
  /** The item as the service stored it, so the list can refresh without reloading the page. */
  readonly saved = output<CatalogItem>();
  /** The person gave up without saving; the host decides to close the form. */
  /**
   * What the actor may change: everything, or only the descriptive information (AC-P1.6). The other
   * fields are not rendered, not just disabled, and the command carries only the name.
   */
  readonly scope = input<'all' | 'description'>('all');
  readonly cancelled = output<void>();
  /** True when a save starts and false when it ends, so the host never replaces the form mid-flight. */
  readonly saving = output<boolean>();

  protected readonly serviceTypes = CATALOG_SERVICE_TYPES;
  protected readonly shownTextFields = computed(() => (this.scope() === 'all' ? TEXT_FIELDS : TEXT_FIELDS.filter((field) => field.name === 'commercialName')));
  protected readonly checkFields = CHECK_FIELDS;
  protected readonly draft = linkedSignal(() => toDraft(this.item()));
  protected readonly pending = signal(false);

  private readonly attempted = signal(false);
  private readonly refusedFields = signal<FieldMessages>({});
  protected readonly formMessages = signal<readonly string[]>([]);

  /** Local errors appear once the person tried to save; the service's own refusal always shows. */
  protected readonly messages = computed<FieldMessages>(() => ({
    ...this.refusedFields(),
    ...(this.attempted() ? this.check().messages : {}),
  }));

  private check(): { command: UpdateCatalogItemCommand | UpdateDescriptionCommand | null; messages: FieldMessages } {
    return this.scope() === 'all' ? validate(this.draft()) : validateDescription(this.draft());
  }

  ngOnInit(): void {
    if (this.item() === undefined) {
      this.idempotencyKey = this.keys.generate();
    }
  }

  protected id(name: FieldName): string {
    return `${this.formId}-${name}`;
  }

  protected describedBy(name: FieldName): string | null {
    return this.messages()[name] ? `${this.id(name)}-error` : null;
  }

  protected onText(name: TextField, event: Event): void {
    this.edit(name, (event.target as HTMLInputElement).value);
  }

  protected onType(event: Event): void {
    this.edit('serviceType', (event.target as HTMLSelectElement).value as CatalogServiceType);
  }

  protected onCheck(name: CheckField, event: Event): void {
    this.edit(name, (event.target as HTMLInputElement).checked);
  }

  private edit<K extends FieldName>(name: K, value: Draft[K]): void {
    this.draft.update((current) => ({ ...current, [name]: value }));
    this.refusedFields.update(({ [name]: _cleared, ...rest }) => rest);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    // Checked before anything else: a second click arrives before the button is rendered disabled.
    if (this.pending()) {
      return;
    }
    this.attempted.set(true);
    const { command } = this.check();
    if (command === null) {
      return;
    }
    this.pending.set(true);
    this.saving.emit(true);
    this.refusedFields.set({});
    this.formMessages.set([]);
    const current = this.item();
    // Editing sends no serviceType: the contract refuses it, the type is fixed at creation.
    const request = current
      ? this.writer.update(current.serviceId, command)
      : this.writer.create({ serviceType: this.draft().serviceType, ...(command as UpdateCatalogItemCommand) }, (this.idempotencyKey ??= this.keys.generate()));
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (stored) => {
        this.pending.set(false);
        this.saving.emit(false);
        if (!current) {
          this.draft.set(toDraft(undefined));
          this.idempotencyKey = this.keys.generate();
          this.attempted.set(false);
        }
        this.saved.emit(stored);
      },
      // The draft is left as it is: a refusal must keep what the person typed (RN-P10).
      error: (error: unknown) => {
        this.pending.set(false);
        this.saving.emit(false);
        this.showRefusal(error);
      },
    });
  }

  private showRefusal(error: unknown): void {
    if (!isApiError(error)) {
      this.formMessages.set([REQUEST_FAILED]);
      return;
    }
    const fields: FieldMessages = {};
    const unplaced: string[] = [];
    for (const detail of Array.isArray(error.details) ? error.details : []) {
      const field = FIELD_OF_WIRE_NAME[detail.field];
      if (field) {
        fields[field] = detail.message;
      } else {
        unplaced.push(detail.message);
      }
    }
    this.refusedFields.set(fields);
    this.formMessages.set([error.userMessage, ...unplaced]);
  }
}

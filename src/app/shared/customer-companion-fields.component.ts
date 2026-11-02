import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CUSTOMER_COMPANIONS_COPY as COPY } from './customer-companions-copy';
import { CompanionIssues, CustomerCompanion, ageText } from './customer-companions';

type Row = { key: keyof CustomerCompanion; type: string; label: string };
const ROWS: readonly Row[] = [
  { key: 'fullName', type: 'text', label: COPY.fullName },
  { key: 'document', type: 'text', label: COPY.document },
  { key: 'birthDate', type: 'date', label: COPY.birthDate },
  { key: 'phone', type: 'text', label: COPY.phone },
  { key: 'emergency', type: 'text', label: COPY.emergency },
];

/**
 * The five fields of each companion, shared by screen 21 (the "Viajeros" card) and screen 25 (HU-COM-005 amendment A.2 row 6):
 * one component, so the two screens cannot drift. The parent owns the values, the checks and the Idempotency-Key.
 */
@Component({
  selector: 'app-customer-companion-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (companion of companions(); track $index; let i = $index) {
      <article class="crp-customers-companion"><strong>{{ text.companion }} {{ i + 1 }}</strong>
        <div class="crp-customers-grid">
          @for (row of rows; track row.key) {
            <div class="crp-customers-field">
              <label [for]="'crp-companion-' + row.key + '-' + i">{{ row.label }}</label>
              <input [id]="'crp-companion-' + row.key + '-' + i" [name]="'companion-' + row.key + '-' + i" [type]="row.type" [value]="companion[row.key]"
                [attr.placeholder]="placeholders()[row.key]" [attr.max]="row.key === 'birthDate' ? today() : null" (input)="typed(i, row.key, $event)"
                [attr.aria-invalid]="row.key === 'document' && issues()?.documents?.[i] ? 'true' : null" [attr.aria-describedby]="describedBy(row.key, i)" />
              @if (row.key === 'birthDate' && age(companion.birthDate); as years) { <small [id]="'crp-companion-age-' + i">{{ years }}</small> }
              @if (row.key === 'document' && issues()?.documents?.[i]; as reason) { <p [id]="'crp-companion-document-' + i + '-error'" class="crp-customers-error">{{ reason }}</p> }
            </div>
          }
        </div>
      </article>
    }
  `,
})
export class CustomerCompanionFieldsComponent {
  /** One entry per companion required. */
  readonly companions = input.required<readonly CustomerCompanion[]>();
  readonly variant = input<'checkout' | 'standalone'>('checkout');
  /** The tenant's day (shared clock): the latest birth date and the base of the age. */
  readonly today = input.required<string>();
  /** The checks of the last submit; null before the first one. */
  readonly issues = input<CompanionIssues | null>(null);
  readonly changed = output<{ index: number; field: keyof CustomerCompanion; value: string }>();
  protected readonly text = COPY;
  protected readonly rows = ROWS;
  protected readonly placeholders = computed<Partial<Record<keyof CustomerCompanion, string>>>(() => COPY.placeholders[this.variant()]);
  protected age(birthDate: string): string { return ageText(birthDate, this.today()); }
  protected typed(index: number, field: keyof CustomerCompanion, event: Event): void { this.changed.emit({ index, field, value: (event.target as HTMLInputElement).value }); }
  protected describedBy(key: keyof CustomerCompanion, index: number): string | null {
    return key === 'document' && this.issues()?.documents?.[index] ? `crp-companion-document-${index}-error` : null;
  }
}

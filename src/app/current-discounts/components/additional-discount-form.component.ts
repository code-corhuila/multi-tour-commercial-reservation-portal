import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize } from 'rxjs';
import { ActorContext, IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { DISCOUNT_SELECTS } from '../../discounts/model/discount-rule';
import { ApiError } from '../../shell-contract';
import { AdditionalDiscountWriter } from '../data/additional-discount-writer';
import { AdditionalDiscount, AdditionalDraft, CURRENT_DISCOUNTS_TEXT, EMPTY_ADDITIONAL, additionalCommand,
  canAuthorizeAdditionalDiscount, validateAdditional } from '../model/current-discounts';
let formSequence = 0;

/** T-03: value, type and reason; the authorizer is the session's actor, answered by the service (plan D-06). */
@Component({
  selector: 'app-additional-discount-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed) {
      <form novalidate class="current-discounts-form" [attr.aria-busy]="pending()" (submit)="submit($event)">
        @for (field of fields; track field.name) {
          <div><label [for]="id(field.name)">{{ field.label }}</label>
            <input type="text" [name]="field.name" [id]="id(field.name)" [value]="draft()[field.name]" [disabled]="pending()"
              [attr.aria-invalid]="messages()[field.name] ? 'true' : null" [attr.aria-describedby]="messages()[field.name] ? id(field.name) + '-error' : null"
              (input)="edit(field.name, $event)">
            @if (messages()[field.name]; as reason) { <p role="alert" [id]="id(field.name) + '-error'">{{ reason }}</p> }
          </div>
        }
        <div><label [for]="id('type')">{{ types.label }}</label>
          <select name="type" [id]="id('type')" [value]="draft().type" [disabled]="pending()" (change)="edit('type', $event)">
            @for (option of types.options; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
          </select>
        </div>
        <button type="submit" [disabled]="pending()">{{ text.apply }}</button>
        @if (failure()) { <p role="alert">{{ failure() }}</p> }
      </form>
    }
  `,
})
export class AdditionalDiscountFormComponent {
  readonly serviceId = input.required<string>();
  readonly saved = output<AdditionalDiscount>();
  protected readonly allowed = canAuthorizeAdditionalDiscount(inject(ActorContext));
  private readonly writer = inject(AdditionalDiscountWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `current-discounts-form-${formSequence++}`;
  protected readonly text = CURRENT_DISCOUNTS_TEXT; protected readonly types = DISCOUNT_SELECTS[1];
  protected readonly fields = [{ name: 'value', label: 'Value' }, { name: 'reason', label: CURRENT_DISCOUNTS_TEXT.reason }] as const;
  protected readonly draft = signal<AdditionalDraft>(EMPTY_ADDITIONAL);
  protected readonly pending = signal(false); protected readonly failure = signal('');
  private readonly attempted = signal(false);
  protected readonly messages = computed(() => this.attempted() ? validateAdditional(this.draft()) : {});
  protected id(field: keyof AdditionalDraft): string { return `${this.prefix}-${field}`; }
  protected edit(field: keyof AdditionalDraft, event: Event): void {
    if (!this.pending()) this.draft.update((d) => ({ ...d, [field]: (event.target as HTMLInputElement).value }));
  }
  protected submit(event: Event): void {
    event.preventDefault(); if (!this.allowed || this.pending()) return;
    this.attempted.set(true); this.failure.set('');
    if (Object.keys(validateAdditional(this.draft())).length) return;
    const command = additionalCommand(this.serviceId(), this.draft()), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true);
    defer(() => this.writer.register(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false)))
      .subscribe({
        next: (stored) => {
          this.key = this.keys.generate(); this.fingerprint = null; this.attempted.set(false); this.draft.set(EMPTY_ADDITIONAL); this.saved.emit(stored);
        },
        error: (error: Partial<ApiError> | null) => this.failure.set(error?.userMessage ?? this.text.failed),
      });
  }
}

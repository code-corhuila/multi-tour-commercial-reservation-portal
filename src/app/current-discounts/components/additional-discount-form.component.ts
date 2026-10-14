import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { AdditionalDiscountWriter } from '../data/additional-discount-writer';
import { AdditionalDiscount, AdditionalDraft, CURRENT_DISCOUNTS_TEXT, EMPTY_ADDITIONAL, additionalCommand,
  validateAdditional } from '../model/current-discounts';
import { focusFirstError } from '../../shared/focus';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
let formSequence = 0;

/** T-03: percentage (1 to 100, no fixed amount: the mockup defines none) and reason; the authorizer is the session's actor, answered by the service (plan D-06). */
@Component({
  selector: 'app-additional-discount-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed) {
      <form novalidate class="crp-current-discounts-form" [attr.aria-busy]="pending()" (submit)="submit($event)">
        <div><label [for]="id('value')">{{ text.value }}</label>
          <input type="text" name="value" inputmode="decimal" [id]="id('value')" [value]="draft().value" [disabled]="pending()"
            [attr.aria-invalid]="messages().value ? 'true' : null" [attr.aria-describedby]="messages().value ? id('value') + '-error' : null"
            (input)="edit('value', $event)">
          @if (messages().value; as reason) { <p role="alert" [id]="id('value') + '-error'">{{ reason }}</p> }
        </div>
        <div class="crp-current-discounts-wide"><label [for]="id('reason')">{{ text.reasonField }}</label>
          <textarea name="reason" [id]="id('reason')" [placeholder]="text.reasonHint" [value]="draft().reason" [disabled]="pending()"
            [attr.aria-invalid]="messages().reason ? 'true' : null" [attr.aria-describedby]="messages().reason ? id('reason') + '-error' : null"
            (input)="edit('reason', $event)"></textarea>
          @if (messages().reason; as reason) { <p role="alert" [id]="id('reason') + '-error'">{{ reason }}</p> }
        </div>
        <p class="crp-current-discounts-note">{{ text.note }}</p>
        @if (failure()) { <p role="alert">{{ failure() }}</p> }
        <div class="crp-form-actions"><button class="crp-operator-outline" type="button" [disabled]="pending()" (click)="clear()">{{ text.cancel }}</button>
          <button class="crp-operator-primary" type="submit" [disabled]="pending()">{{ text.apply }}</button></div>
      </form>
    }
  `,
})
export class AdditionalDiscountFormComponent {
  readonly serviceId = input.required<string>();
  readonly saved = output<AdditionalDiscount>();
  protected readonly allowed = inject(PortalCapabilities).canAuthorizeAdditionalDiscount();
  private readonly writer = inject(AdditionalDiscountWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `current-discounts-form-${formSequence++}`;
  protected readonly text = CURRENT_DISCOUNTS_TEXT;
  protected readonly draft = signal<AdditionalDraft>(EMPTY_ADDITIONAL);
  protected readonly pending = signal(false); protected readonly failure = signal('');
  private readonly attempted = signal(false);
  protected readonly messages = computed(() => this.attempted() ? validateAdditional(this.draft()) : {});
  protected id(field: keyof AdditionalDraft): string { return `${this.prefix}-${field}`; }
  protected edit(field: keyof AdditionalDraft, event: Event): void {
    if (!this.pending()) this.draft.update((d) => ({ ...d, [field]: (event.target as HTMLInputElement).value }));
  }
  protected clear(): void { this.attempted.set(false); this.failure.set(''); this.draft.set(EMPTY_ADDITIONAL); }
  protected submit(event: Event): void {
    event.preventDefault(); if (!this.allowed || this.pending()) return;
    this.attempted.set(true); this.failure.set('');
    if (Object.keys(validateAdditional(this.draft())).length) { afterNextRender(() => { focusFirstError(event.target as HTMLFormElement); }, { injector: this.injector }); return; }
    const command = additionalCommand(this.serviceId(), this.draft()), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true);
    defer(() => this.writer.register(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false)))
      .subscribe({
        next: (stored) => {
          this.key = this.keys.generate(); this.fingerprint = null; this.attempted.set(false); this.draft.set(EMPTY_ADDITIONAL); this.saved.emit(stored);
        },
        error: (error: Partial<ApiError> | null) => this.failure.set(error?.userMessage ?? this.text.applyFailed),
      });
  }
}

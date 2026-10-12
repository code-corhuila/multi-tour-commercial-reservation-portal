import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, defer, exhaustMap, finalize, tap } from 'rxjs';
import { ActorContext, IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { ApiError } from '../../shell-contract';
import { DiscountRulesWriter } from '../data/discount-rules-writer';
import { DISCOUNT_FIELDS, DISCOUNT_SELECTS, DISCOUNT_TEXT, DiscountField, DiscountMessages, DiscountRule,
  DiscountRuleCommand, canManageDiscounts, discountCommand, discountDraft, validateDiscount } from '../model/discount-rule';
let formSequence = 0;
@Component({
  selector: 'app-discount-rule-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed) {
      <form novalidate [attr.data-state]="state()" [attr.aria-busy]="pending()" (submit)="submit($event)">
        @if (pending()) { <p role="status">{{ text.loading }}</p> }
        @for (field of fields; track field.name) {
          <div><label [for]="id(field.name)">{{ field.label }}</label>
            <input [name]="field.name" [id]="id(field.name)" [type]="field.kind" [value]="draft()[field.name]" [disabled]="pending()"
              [attr.aria-invalid]="messages()[field.name] ? 'true' : null" [attr.aria-describedby]="errorId(field.name)"
              (input)="edit(field.name, $event)" (blur)="touch(field.name)">
            @if (messages()[field.name]; as reason) { <p role="alert" [id]="id(field.name) + '-error'">{{ reason }}</p> }
          </div>
        }
        @for (field of selects; track field.name) {
          <div><label [for]="id(field.name)">{{ field.label }}</label>
            <select [name]="field.name" [id]="id(field.name)" [disabled]="pending()" [value]="draft()[field.name]"
              [attr.aria-invalid]="messages()[field.name] ? 'true' : null" [attr.aria-describedby]="errorId(field.name)"
              (change)="edit(field.name, $event)" (blur)="touch(field.name)">
              @for (option of field.options; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
            @for (option of field.options; track option.value) { @if (option.explanation) { <p>{{ option.label }}: {{ option.explanation }}</p> } }
            @if (messages()[field.name]; as reason) { <p role="alert" [id]="id(field.name) + '-error'">{{ reason }}</p> }
          </div>
        }
        <button type="submit" [disabled]="pending()">{{ text.save }}</button>
        <button type="button" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
      </form>
    }
  `,
})
export class DiscountRuleFormComponent {
  readonly rule = input<DiscountRule | null>(null);
  readonly saved = output<DiscountRule>(); readonly cancelled = output<void>(); readonly saving = output<boolean>();
  protected readonly allowed = canManageDiscounts(inject(ActorContext));
  private readonly writer = inject(DiscountRulesWriter); private readonly keys = inject(IdempotencyKeys);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `discount-form-${formSequence++}`;
  protected readonly fields = DISCOUNT_FIELDS; protected readonly selects = DISCOUNT_SELECTS; protected readonly text = DISCOUNT_TEXT;
  protected readonly draft = signal(discountDraft(null)); protected readonly pending = signal(false);
  private readonly touched = signal<Partial<Record<DiscountField, boolean>>>({}); private readonly refused = signal<DiscountMessages>({});
  protected readonly state = computed(() => this.pending() ? 'loading' : Object.keys(this.refused()).length ? 'error' : this.draft().name ? 'data' : 'empty');
  protected readonly messages = computed(() => ({ ...this.refused(), ...Object.fromEntries(
    Object.entries(validateDiscount(this.draft())).filter(([field]) => this.touched()[field as DiscountField]),
  ) }));
  private readonly submissions = new Subject<DiscountRuleCommand>();
  private readonly responses = toSignal(this.submissions.pipe(exhaustMap(command => defer(() => this.rule()
    ? this.writer.update(this.rule()!.id, command, this.key) : this.writer.create(command, this.key)).pipe(
    tap(stored => { this.key = this.keys.generate(); this.fingerprint = null; this.draft.set(discountDraft(null)); this.touched.set({}); this.saved.emit(stored); }),
    catchError((error: Partial<ApiError> | null) => {
      const messages: DiscountMessages = {}, reason = error?.userMessage ?? this.text.failed;
      for (const detail of error?.details ?? []) {
        const field = detail.field in this.draft() ? detail.field as DiscountField : 'value';
        messages[field] = `${messages[field] ?? reason} ${detail.message}`;
      }
      this.refused.set(Object.keys(messages).length ? messages : { value: reason }); return EMPTY;
    }), finalize(() => { this.pending.set(false); this.saving.emit(false); }),
  ))));
  constructor() { effect(() => { const rule = this.rule(); untracked(() => this.draft.set(discountDraft(rule))); }); }
  protected id(field: DiscountField): string { return `${this.prefix}-${field}`; }
  protected errorId(field: DiscountField): string | null { return this.messages()[field] ? this.id(field) + '-error' : null; }
  protected touch(field: DiscountField): void { this.touched.update(t => ({ ...t, [field]: true })); }
  protected edit(field: DiscountField, event: Event): void {
    if (this.pending()) return;
    this.draft.update(d => ({ ...d, [field]: (event.target as HTMLInputElement).value })); this.refused.set({});
  }
  protected submit(event: Event): void {
    event.preventDefault(); if (!this.allowed || this.pending()) return;
    this.touched.set(Object.fromEntries(Object.keys(this.draft()).map(f => [f, true]))); this.refused.set({});
    if (Object.keys(validateDiscount(this.draft())).length) return;
    const command = discountCommand(this.draft()), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true); this.saving.emit(true); this.submissions.next(command);
  }
}

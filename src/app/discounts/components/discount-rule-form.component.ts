import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, defer, exhaustMap, finalize, map, of, tap } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { ApiError } from '../../shell-contract';
import { DiscountRulesWriter } from '../data/discount-rules-writer';
import { DISCOUNT_CONTROLS, DISCOUNT_SECTIONS, DISCOUNT_TEXT } from '../discounts-copy';
import { DiscountField, DiscountMessages, DiscountRule, DiscountRuleCommand, discountCommand, discountDraft, validateDiscount } from '../model/discount-rule';
import { focusFirstError } from '../../shared/focus';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
let formSequence = 0;
type DiscountControl = (typeof DISCOUNT_CONTROLS)[number];
type Option = { value: string; label: string };
@Component({
  selector: 'app-discount-rule-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed) {
      <form #form class="crp-discount-form" novalidate [attr.data-state]="state()" [attr.aria-busy]="pending()" (submit)="submit($event, form)">
        @for (section of sections; track section.eyebrow; let order = $index) {
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ section.eyebrow }}</p>
            <h2>{{ order ? text.orderLead : rule() ? text.editLead : text.newLead }}</h2>
            @if (!order) { <p class="crp-operator-copy">{{ text.toursOnly }}</p> }
            <div class="crp-discount-grid">@for (name of section.fields; track name) { @let field = control(name);
              <div><label [for]="id(name)">{{ field.label }}</label>
                @if (field.options) {
                  <select [name]="name" [id]="id(name)" [disabled]="pending()"
                    [attr.aria-invalid]="messages()[name] ? 'true' : null" [attr.aria-describedby]="errorId(name)"
                    (change)="edit(name, $event)" (blur)="touch(name)">
                    @if (name === 'tourId') { <option value="" [selected]="!draft()[name]">{{ text.pickTour }}</option> }
                    @for (option of options(name); track option.value) { <option [value]="option.value" [selected]="option.value === draft()[name]">{{ option.label }}</option> }
                  </select>
                } @else {
                  <input [name]="name" [id]="id(name)" [type]="field.kind ?? 'text'" [attr.placeholder]="field.placeholder ?? null" [value]="draft()[name]" [disabled]="pending()"
                    [attr.aria-invalid]="messages()[name] ? 'true' : null" [attr.aria-describedby]="errorId(name)"
                    (input)="edit(name, $event)" (blur)="touch(name)">
                }
                @if (messages()[name]; as reason) { <p role="alert" [id]="id(name) + '-error'">{{ reason }}</p> }
              </div>
            }</div>
          </section>
        }
        @if (pending()) { <p role="status">{{ text.saving }}</p> }
        <p class="crp-discount-feedback">{{ rule() ? text.editFeedback : text.newFeedback }}</p>
        <div class="crp-form-actions">
          <button class="crp-outline" type="button" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
          <button class="crp-primary" type="submit" [disabled]="pending()">{{ rule() ? text.save : text.create }}</button>
        </div>
      </form>
    }
  `,
})
export class DiscountRuleFormComponent {
  readonly rule = input<DiscountRule | null>(null);
  readonly saved = output<DiscountRule>(); readonly cancelled = output<void>(); readonly saving = output<boolean>();
  protected readonly allowed = inject(PortalCapabilities).canManageDiscounts();
  private readonly injector = inject(Injector); private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly writer = inject(DiscountRulesWriter); private readonly keys = inject(IdempotencyKeys);
  private key = this.keys.generate(); private fingerprint: string | null = null;
  private readonly prefix = `discount-form-${formSequence++}`;
  protected readonly sections = DISCOUNT_SECTIONS; protected readonly text = DISCOUNT_TEXT;
  private readonly controls = new Map<string, DiscountControl>(DISCOUNT_CONTROLS.map(c => [c.name, c]));
  protected control(name: DiscountField): DiscountControl { return this.controls.get(name)!; }
  /** The active tours of the catalog (HU-COM-001 port); the tour the rule already has stays choosable while it is edited. */
  private readonly tours = toSignal((inject(CatalogItemsSource, { optional: true })?.list() ?? of([])).pipe(
    map(items => items.filter(i => i.serviceType === 'TOUR' && i.catalogStatus === 'ACTIVE').map(i => ({ value: i.serviceId, label: i.commercialName }))),
    catchError(() => of<Option[]>([]))), { initialValue: [] as Option[] });
  protected options(name: DiscountField): readonly Option[] {
    const own = this.rule();
    return name !== 'tourId' ? this.control(name).options! : own && !this.tours().some(t => t.value === own.tourId)
      ? [{ value: own.tourId, label: own.tourName }, ...this.tours()] : this.tours();
  }
  protected readonly draft = signal(discountDraft(null)); protected readonly pending = signal(false);
  private readonly touched = signal<Partial<Record<DiscountField, boolean>>>({}); private readonly refused = signal<DiscountMessages>({});
  protected readonly state = computed(() => this.pending() ? 'loading' : Object.keys(this.refused()).length ? 'error' : this.draft().tourId ? 'data' : 'empty');
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
        const field = detail.field in this.draft() ? detail.field as DiscountField : 'percentage';
        messages[field] = `${messages[field] ?? reason} ${detail.message}`;
      }
      this.refused.set(Object.keys(messages).length ? messages : { percentage: reason });
      afterNextRender(() => { focusFirstError(this.host); }, { injector: this.injector }); return EMPTY;
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
  protected submit(event: Event, form: HTMLFormElement): void {
    event.preventDefault(); if (!this.allowed || this.pending()) return;
    this.touched.set(Object.fromEntries(Object.keys(this.draft()).map(f => [f, true]))); this.refused.set({});
    if (Object.keys(validateDiscount(this.draft())).length) { afterNextRender(() => { focusFirstError(form); }, { injector: this.injector }); return; }
    const command = discountCommand(this.draft()), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true); this.saving.emit(true); this.submissions.next(command);
  }
}

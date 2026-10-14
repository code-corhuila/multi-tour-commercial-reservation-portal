import { Clock, tenantDay } from '../../shared/clock';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { DiscountRuleFormComponent } from '../components/discount-rule-form.component';
import { DiscountRulesWriter } from '../data/discount-rules-writer';
import { DiscountRulesSource } from '../data/discount-rules-source';
import { DISCOUNT_TEXT } from '../discounts-copy';
import { DiscountRule, discountDetail, discountValueText } from '../model/discount-rule';
import { DISCOUNTS_PAGE_PANELS, PortalSlotOutlet } from '../../shared/portal-slots';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
export type DiscountsPageState = { kind: 'loading' | 'empty' } | { kind: 'error' } | { kind: 'data'; items: readonly DiscountRule[] };
@Component({
  selector: 'app-discounts-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, DiscountRuleFormComponent, PortalSlotOutlet],
  template: `
    @if (allowed) {
      <header class="crp-page-header"><div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ text.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ formOpen() ? (editing() ? text.editTitle : text.newTitle) : text.title }}</h1></div>
        @if (formOpen()) { <button class="crp-outline crp-page-header-action" type="button" [disabled]="saving()" (click)="formOpen.set(false)">{{ text.back }}</button> }
        @else if (writer) { <button class="crp-primary crp-page-header-action" type="button" [disabled]="busy()" (click)="openForm(null)">{{ text.create }}</button> }
      </header>
      @if (formOpen()) { @for (key of [formKey()]; track key) {
        <app-discount-rule-form [rule]="editing()" (saved)="onSaved($event)" (cancelled)="formOpen.set(false)" (saving)="saving.set($event)" />
      } } @else {
      <section class="crp-discount-hero"><div><p class="crp-operator-eyebrow">{{ text.heroEyebrow }}</p><h2>{{ text.heroTitle }}</h2></div><p>{{ text.heroCopy }}</p></section>
      <section class="crp-operator-panel" [attr.aria-label]="text.panelTitle">
      @let current = state();
      <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.panelEyebrow }}</p><h2>{{ text.panelTitle }}</h2></div>
        @if (current.kind === 'data') { @let active = inForce(current.items);
          <span class="crp-operator-status crp-is-confirmed">{{ active }} {{ active === 1 ? 'activa' : 'activas' }}</span> }</div>
      @if (selected(); as rule) {
        <div class="crp-discount-dialog" role="dialog" aria-modal="true" [attr.aria-label]="text.confirm">
          <p>{{ text.confirmation }}</p>
          <button class="crp-primary" type="button" [disabled]="pending()" (click)="confirm()">{{ text.confirm }}</button>
          <button class="crp-outline" type="button" [disabled]="pending()" (click)="selected.set(null)">{{ text.cancel }}</button>
          @if (actionError()) { <p role="alert">{{ actionError() }}</p> }
        </div>
      }
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><p><crp-read-error [state]="current" [fallback]="text.failed" /></p><button class="crp-outline" type="button" [disabled]="busy()" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
        @case ('data') {
          <ul class="crp-discount-list" data-state="data">@for (rule of current.items; track rule.id) { @let badge = rule.validity;
            <li class="crp-discount-promo"><div><span>{{ rule.tourName }}</span><strong>{{ valueText(rule) }}</strong>
              <p>{{ detail(rule) }}</p>
              <em [class]="'crp-operator-status crp-is-' + badge.tone">{{ badge.label }}</em></div>
              @if (writer) { <div class="crp-row-actions">
                <button type="button" [disabled]="busy()" (click)="openForm(rule)">{{ text.edit }}</button>
                @if (rule.status === activeStatus) { <button class="crp-discount-toggle" type="button" [disabled]="busy()" (click)="ask(rule)">{{ text.inactivate }}</button> }
              </div> }
            </li>
          }</ul>
        }
      }
      </section> }
    } @else { <p role="alert" data-state="denied">{{ text.denied }}</p> }
  `,
})
export class DiscountsPageComponent {
  protected readonly allowed = inject(PortalCapabilities).canManageDiscounts();
  private readonly source = inject(DiscountRulesSource);
  protected readonly writer = inject(DiscountRulesWriter, { optional: true });
  private readonly keys = inject(IdempotencyKeys); private readonly lifetime = inject(DestroyRef);
  protected readonly formOpen = signal(false); protected readonly formKey = signal(0); protected readonly editing = signal<DiscountRule | null>(null);
  protected readonly selected = signal<DiscountRule | null>(null); protected readonly pending = signal(false); protected readonly saving = signal(false);
  protected readonly busy = computed(() => this.saving() || this.pending() || this.formOpen() || !!this.selected());
  protected readonly actionError = signal(''); private actionKey = '';
  protected readonly activeStatus: DiscountRule['status'] = 'ACTIVE';
  protected readonly text = DISCOUNT_TEXT;
  protected readonly valueText = discountValueText;
  protected readonly detail = discountDetail;
  protected readonly panels = DISCOUNTS_PAGE_PANELS;
  protected inForce(items: readonly DiscountRule[]): number { return items.filter(r => r.validity.inForce).length; }
  private readonly requests = new Subject<void>();
  private readonly local = signal<DiscountsPageState | null>(null);
  private readonly listed = toSignal(this.requests.pipe(switchMap(() => this.source.list().pipe(
    map((items): DiscountsPageState => items.length ? { kind: 'data', items: [...items].sort((a, b) => a.priority - b.priority) } : { kind: 'empty' }),
    catchError((error) => of<DiscountsPageState>({ kind: 'error', ...readFailure(error) })), startWith<DiscountsPageState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as DiscountsPageState });
  readonly state = computed(() => this.local() ?? this.listed());
  constructor() { this.reload(); }
  reload(): void { if (this.allowed && !this.busy()) { this.local.set(null); this.requests.next(); } }
  protected openForm(rule: DiscountRule | null): void {
    if (!this.allowed || !this.writer || this.busy()) return;
    this.editing.set(rule); this.formKey.update(k => k + 1); this.formOpen.set(true);
  }
  protected onSaved(stored: DiscountRule): void {
    const current = this.state(), items = current.kind === 'data' ? current.items : [];
    this.local.set({ kind: 'data', items: [...items.filter(r => r.id !== stored.id), stored].sort((a, b) => a.priority - b.priority) });
    this.formOpen.set(false);
  }
  protected ask(rule: DiscountRule): void {
    if (!this.allowed || !this.writer || this.busy() || rule.status !== this.activeStatus) return;
    this.actionKey = this.keys.generate(); this.actionError.set(''); this.selected.set(rule);
  }
  protected confirm(): void {
    const rule = this.selected(); if (!this.allowed || !this.writer || !rule || this.pending()) return;
    this.pending.set(true); this.actionError.set('');
    defer(() => this.writer!.inactivate(rule.id, this.actionKey)).pipe(takeUntilDestroyed(this.lifetime),
      finalize(() => this.pending.set(false)),
    ).subscribe({ next: stored => { this.onSaved(stored); this.selected.set(null); },
      error: (error: Partial<ApiError> | null) => this.actionError.set(error?.userMessage ?? this.text.failed) });
  }
}

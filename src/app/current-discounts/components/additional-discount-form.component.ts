import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, defer, finalize, of, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { ApiError } from '../../shell-contract';
import { formatCop } from '../../shared/format';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { pesosText } from '../../shared/money';
import { ADDITIONAL_DISCOUNT_COPY } from '../current-discounts-copy';
import { AdditionalDiscountContext, AdditionalDiscountContexts } from '../data/additional-discount-contexts';
import { ADDITIONAL_DISCOUNT_MODE } from '../data/additional-discount-eligibility';
import { AdditionalDiscountApplied, AdditionalDiscountWriter } from '../data/additional-discount-writer';
import { AdditionalDraft, EMPTY_ADDITIONAL, additionalCommand, previewBasisPoints, validateAdditional } from '../model/current-discounts';
let formSequence = 0;

/**
 * Panel 02 of admin-aplicar-descuento.html: percentage (no fixed amount: the mockup defines none), the cap, the new value and the excess
 * (resolved by the port, the view only formats), and the reason. The authorizer is the session's actor, answered by the service (plan D-06).
 */
@Component({
  selector: 'app-additional-discount-form', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form novalidate [attr.aria-busy]="pending()" (submit)="submit($event)">
      <section class="crp-operator-panel crp-additional-discount-panel">
        <p class="crp-operator-eyebrow">{{ text.authorizationStep }}</p>
        <h2>{{ text.authorizationTitle }}</h2>
        <div class="crp-form-grid">
          <div class="crp-reservations-field"><label [for]="id('value')">{{ text.value }}</label>
            <input type="text" name="value" inputmode="decimal" [id]="id('value')" [value]="draft().value" [disabled]="locked()"
              [attr.aria-invalid]="messages().value ? 'true' : null" [attr.aria-describedby]="messages().value ? id('value') + '-error' : null"
              (input)="edit('value', $event)">
            @if (messages().value; as reason) { <p role="alert" [id]="id('value') + '-error'">{{ reason }}</p> }
          </div>
          <div class="crp-reservations-field"><label [for]="id('cap')">{{ text.cap }}</label><input type="text" readonly [id]="id('cap')" [value]="text.capValue(capText)"></div>
          <div class="crp-reservations-field"><label [for]="id('new')">{{ text.newValue }}</label><input type="text" readonly [id]="id('new')" [value]="money(preview()?.newValueCents ?? context().currentValueCents)"></div>
          <div class="crp-reservations-field"><label [for]="id('excess')">{{ text.excess }}</label><input type="text" readonly [id]="id('excess')" [value]="preview()?.excessCents ? money(preview()!.excessCents) : text.noExcess"></div>
          <div class="crp-reservations-field crp-additional-discount-wide"><label [for]="id('reason')">{{ text.reasonField }}</label>
            <textarea name="reason" [id]="id('reason')" [placeholder]="text.reasonHint" [value]="draft().reason" [disabled]="locked()"
              [attr.aria-invalid]="messages().reason ? 'true' : null" [attr.aria-describedby]="messages().reason ? id('reason') + '-error' : null"
              (input)="edit('reason', $event)"></textarea>
            @if (messages().reason; as reason) { <p role="alert" [id]="id('reason') + '-error'">{{ reason }}</p> }
          </div>
        </div>
      </section>
      <p class="crp-additional-discount-note">{{ text.note }}</p>
      @if (failure()) { <p role="alert" tabindex="-1" data-failure>{{ failure() }}</p> }
      @if (applied(); as done) { <p role="status">{{ text.applied }}@if (done.excessCents) { {{ text.excessOpened(money(done.excessCents)) }} }</p> }
      <div class="crp-form-actions"><button class="crp-operator-outline" type="button" [disabled]="pending()" (click)="cancel()">{{ text.cancel }}</button><button class="crp-operator-primary" type="submit" [disabled]="locked()">{{ text.apply }}</button></div>
    </form>
  `,
})
export class AdditionalDiscountFormComponent {
  readonly context = input.required<AdditionalDiscountContext>();
  private readonly contexts = inject(AdditionalDiscountContexts); private readonly writer = inject(AdditionalDiscountWriter);
  private readonly keys = inject(IdempotencyKeys); private readonly lifetime = inject(DestroyRef); private readonly injector = inject(Injector);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private key = this.keys.generate(); private fingerprint: string | null = null; private readonly prefix = `additional-discount-form-${formSequence++}`;
  protected readonly text = ADDITIONAL_DISCOUNT_COPY; protected readonly money = formatCop;
  protected readonly draft = signal<AdditionalDraft>(EMPTY_ADDITIONAL);
  protected readonly pending = signal(false); protected readonly failure = signal(''); protected readonly applied = signal<AdditionalDiscountApplied | null>(null); private readonly attempted = signal(false);
  protected readonly locked = computed(() => this.pending() || !!this.applied());
  protected readonly messages = computed(() => this.attempted() ? validateAdditional(this.draft(), this.context().capBasisPoints) : {});
  protected get capText(): string { return pesosText(this.context().capBasisPoints); }
  /** The newest percentage typed wins (pillar 8): switchMap drops the answer of an older one. A preview the port cannot answer leaves the current value, never a broken form. */
  protected readonly preview = toSignal(toObservable(computed(() => previewBasisPoints(this.draft(), this.context().capBasisPoints)))
    .pipe(switchMap((basisPoints) => basisPoints ? this.contexts.preview(this.context().reservationId, basisPoints).pipe(catchError(() => of(null))) : of(null))), { initialValue: null });
  protected id(field: string): string { return `${this.prefix}-${field}`; }
  protected edit(field: keyof AdditionalDraft, event: Event): void {
    if (!this.locked()) this.draft.update((d) => ({ ...d, [field]: (event.target as HTMLInputElement).value }));
  }
  /** "Cancelar" returns to Reservas in mode, as the mockup link does. */
  protected cancel(): void { this.navigation?.open('reservations', { mode: ADDITIONAL_DISCOUNT_MODE }); }
  protected submit(event: Event): void {
    event.preventDefault(); if (this.locked()) return;
    this.attempted.set(true); this.failure.set('');
    const cap = this.context().capBasisPoints;
    if (Object.keys(validateAdditional(this.draft(), cap)).length) { afterNextRender(() => { focusFirstError(event.target as HTMLFormElement); }, { injector: this.injector }); return; }
    const command = additionalCommand(this.context().reservationId, this.draft(), cap), fingerprint = JSON.stringify(command);
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) this.key = this.keys.generate();
    this.fingerprint = fingerprint; this.pending.set(true);
    defer(() => this.writer.register(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false)))
      .subscribe({
        next: (stored) => { this.key = this.keys.generate(); this.fingerprint = null; this.attempted.set(false); this.applied.set(stored); },
        error: (error: Partial<ApiError> | null) => {
          this.failure.set(error?.userMessage ?? this.text.applyFailed);
          afterNextRender(() => { this.host.querySelector<HTMLElement>('[data-failure]')?.focus(); }, { injector: this.injector });
        },
      });
  }
}

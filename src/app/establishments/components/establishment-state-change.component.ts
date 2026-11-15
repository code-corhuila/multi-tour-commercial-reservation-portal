import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { ESTABLISHMENTS_COPY } from '../establishments-copy';
import { AssociatedEstablishment } from '../model/associated-establishment';

/**
 * "Cambiar estado" of the mockup (admin-gestionar-hospedaje.html), drawn as an inline panel and not as a floating dialog
 * (spec 002, DP-002-V19-2): the reason is mandatory and the page sends it with the transition (AC-PE.13).
 */
@Component({
  selector: 'app-establishment-state-change',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-form-section" [attr.aria-label]="title()">
      <p class="crp-operator-eyebrow">{{ t.eyebrow }}</p>
      <h2>{{ title() }}</h2>
      <p class="crp-operator-copy">{{ inactivating() ? t.copyInactivate : t.copyReactivate }}</p>
      <label for="crp-state-reason">{{ t.reason }}</label>
      <textarea id="crp-state-reason" name="reason" maxlength="500" [value]="reason()" [attr.placeholder]="t.placeholder"
        [attr.aria-invalid]="missing() ? 'true' : null" [attr.aria-describedby]="missing() ? 'crp-state-reason-error' : null"
        (input)="reason.set($any($event.target).value)"></textarea>
      @if (missing()) { <p role="alert" id="crp-state-reason-error">{{ t.required }}</p> }
      <div class="crp-form-actions">
        <button class="crp-operator-outline" type="button" (click)="cancelled.emit()">{{ t.cancel }}</button>
        <button class="crp-operator-primary" type="button" (click)="confirm()">{{ inactivating() ? t.confirmInactivate : t.confirmReactivate }}</button>
      </div>
    </section>
  `,
})
export class EstablishmentStateChangeComponent {
  readonly establishment = input.required<AssociatedEstablishment>();
  /** The trimmed reason; the page does the write. */
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly t = ESTABLISHMENTS_COPY.stateChange;
  protected readonly reason = signal('');
  protected readonly missing = signal(false);
  protected readonly inactivating = computed(() => this.establishment().associationStatus === 'ACTIVE');
  protected readonly title = computed(() => this.t.title(this.inactivating() ? ESTABLISHMENTS_COPY.inactivate : ESTABLISHMENTS_COPY.reactivate, this.establishment().commercialName));
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  constructor() {
    // The focus moves to "Motivo" when the panel opens, as the dialog of the mockup does.
    afterNextRender(() => this.host.querySelector('textarea')?.focus(), { injector: this.injector });
  }

  protected confirm(): void {
    const reason = this.reason().trim();
    this.missing.set(reason === '');
    if (reason !== '') { this.confirmed.emit(reason); return; }
    afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
  }
}

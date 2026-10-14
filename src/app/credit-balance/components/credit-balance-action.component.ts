import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlot } from '../../shared/portal-slots';
import { CREDIT_BALANCE_COPY } from '../credit-balance-copy';
import { CreditBalance, CreditBalanceSource, CreditBalanceWriter } from '../data/credit-balance-ports';

/**
 * "Registrar saldo a favor del 100 %" of admin-tratamiento-pendiente-devolucion.html (HU-COM-017 AC-CB.1, AC-CB.7 to AC-CB.9),
 * drawn by the treatment page of HU-COM-016 through REFUND_TREATMENT_ACTIONS. Only with the capability, while the treatment is open
 * and the host has not decided; one Idempotency-Key per intention, reused by Reintentar.
 */
@Component({
  selector: 'app-credit-balance-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer()) { <button type="button" class="crp-operator-outline" (click)="record()">{{ copy.record }}</button> }
    @if (state(); as s) {
      @switch (s.kind) {
        @case ('loading') {
          <button type="button" class="crp-operator-outline" disabled aria-busy="true">{{ copy.record }}</button>
          <p class="crp-credit-balance-note" data-state="loading" role="status">{{ copy.loading }}</p>
        }
        @case ('error') {
          <div class="crp-credit-balance-error" data-state="error" role="alert" tabindex="-1">{{ copy.failed }}
            <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ copy.retry }}</button></div>
        }
        @case ('data') {
          <div class="crp-credit-balance-result" data-state="data" aria-live="polite">
            <span class="crp-operator-status crp-is-pending">{{ copy.pending }}</span>
            @for (line of s.items; track line.id) {
              <dl class="crp-credit-balance-list">
                <div><dt>{{ copy.amount }}</dt><dd>{{ money(line.amountCents) }}</dd></div>
                <div><dt>{{ copy.owner }}</dt><dd>{{ line.recordedBy }}</dd></div>
                <div><dt>{{ copy.date }}</dt><dd>{{ date(line.recordedAt) }}</dd></div>
              </dl>
            }
          </div>
        }
      }
    }`,
})
export class CreditBalanceActionComponent {
  readonly reservationId = input.required<string>();
  /** The host's answer: a refund or its default already closed the treatment (HU-COM-016 AC6). */
  readonly decided = input(false);
  /** Called once the balance is recorded, so the host closes its own button. */
  readonly changed = input<(() => void) | undefined>(undefined);
  protected readonly copy = CREDIT_BALANCE_COPY;
  protected readonly money = formatCop;
  protected readonly date = formatDate;
  private readonly allowed = inject(PortalCapabilities).canRegisterCreditBalance();
  private readonly source = inject(CreditBalanceSource);
  private readonly writer = inject(CreditBalanceWriter);
  private readonly keys = inject(IdempotencyKeys);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly treatment = toSignal(toObservable(this.reservationId).pipe(switchMap((id) =>
    (this.allowed ? this.source.treatmentOf(id) : of(null)).pipe(catchError(() => of(null))))), { initialValue: null });
  private readonly action = signal<PageState<CreditBalance> | null>(null);
  private key: string | null = null;
  /** The action's state, or the balance already recorded; null while the button is only offered or not at all. */
  protected readonly state = computed((): PageState<CreditBalance> | null => {
    const recorded = this.treatment()?.recorded;
    return this.action() ?? (recorded ? { kind: 'data', items: [recorded] } : null);
  });
  protected readonly offer = computed(() => !this.state() && !!this.treatment()?.open && !this.decided());

  protected record(): void {
    this.key ??= this.keys.generate();
    this.action.set({ kind: 'loading' });
    this.writer.recordFromTreatment(this.reservationId(), this.key).subscribe({
      next: (line) => { this.action.set({ kind: 'data', items: [line] }); this.changed()?.(); },
      error: () => {
        this.action.set({ kind: 'error', retry: () => this.record() });
        afterNextRender(() => this.host.querySelector<HTMLElement>('[data-state="error"]')?.focus(), { injector: this.injector });
      },
    });
  }
}

/** The contribution mount-entry.ts registers on REFUND_TREATMENT_ACTIONS; drawn only when the build provides the credit balance ports. */
export const CREDIT_BALANCE_TREATMENT_ACTION: PortalSlot = {
  component: CreditBalanceActionComponent, order: 10, isAvailable: (injector) => injector.get(CreditBalanceSource, null) !== null,
};

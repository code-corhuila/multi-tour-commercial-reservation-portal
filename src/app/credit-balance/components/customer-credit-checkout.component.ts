import { ChangeDetectionStrategy, Component, Injector, Provider, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { CHECKOUT_BLOCKS, CONTINUE_PAYMENT_BLOCKS, contribute } from '../../shared/portal-slots';
import { CREDIT_BALANCE_COPY } from '../credit-balance-copy';
import { CUSTOMER_CREDIT_COPY } from '../customer-credit-copy';
import { CustomerCreditSource, CustomerCreditWriter } from '../data/customer-credit-ports';

/**
 * The box of 21 (finalizar-reserva.html, data-checkout-credit-box, AC-CB.12, DP-CB6 PROPUESTO): hidden unless the customer has credit; when ticked, the credit is applied as a
 * validated payment of the reservation. A new reservation does not exist yet, so the application waits for it (the `reservation` input); an existing one is applied at once.
 * The amount, the refusals and the seat are the port's (pillar 2); one Idempotency-Key per intention.
 */
@Component({
  selector: 'app-customer-credit-checkout', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <div class="crp-self-service-note" data-checkout-credit-box>
        <label><input type="checkbox" [checked]="ticked()" [disabled]="busy() || done()" (change)="ticked.set($any($event.target).checked)" />&ngsp;<span>{{ label() }}</span></label>
        @if (feedback(); as text) { <p role="status" data-checkout-credit-feedback>{{ text }}</p> }
        @if (refusal(); as text) { <p role="alert" class="crp-self-service-field-error" data-checkout-credit-refusal>{{ text }}</p> }
      </div>
    }`,
})
export class CustomerCreditCheckoutComponent {
  /** True on the second mode of 21 (an existing reservation). */
  readonly existing = input(false);
  readonly reservation = input<{ readonly reservationId: string } | null>(null);
  private readonly writer = inject(CustomerCreditWriter); private readonly keys = inject(IdempotencyKeys); private key = this.keys.generate();
  protected readonly t = CUSTOMER_CREDIT_COPY;
  protected readonly total = toSignal(inject(CustomerCreditSource).mine().pipe(map((c) => c.totalCents), catchError(() => of(0))), { initialValue: 0 });
  protected readonly ticked = signal(false); protected readonly busy = signal(false); protected readonly done = signal(false);
  protected readonly feedback = signal<string | null>(null); protected readonly refusal = signal<string | null>(null);

  constructor() {
    effect(() => {
      const target = this.reservation();
      if (this.ticked() && target && !untracked(() => this.busy() || this.done())) untracked(() => this.apply(target.reservationId));
    });
  }

  protected label(): string { const money = formatCop(this.total()); return this.existing() ? this.t.checkoutExisting(money) : this.t.checkoutNew(money); }

  private apply(reservationId: string): void {
    this.busy.set(true); this.refusal.set(null);
    this.writer.apply(reservationId, this.key).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (r.ok) { this.done.set(true); this.feedback.set(CREDIT_BALANCE_COPY.applied(formatCop(r.appliedCents), reservationId, r.firstPayment)); } else { this.ticked.set(false); this.refusal.set(r.reason); this.key = this.keys.generate(); }
      },
      error: () => { this.busy.set(false); this.ticked.set(false); this.refusal.set(CUSTOMER_CREDIT_COPY.failed); },
    });
  }
}

const offered = (injector: Injector) => injector.get(CustomerCreditSource, null) !== null && injector.get(CustomerCreditWriter, null) !== null;
/** Registered in mount-entry.ts: the box in the main column of 21, in both modes, only with the customer credit ports. */
export const CUSTOMER_CREDIT_CHECKOUT: Provider[] = [
  contribute(CHECKOUT_BLOCKS, { component: CustomerCreditCheckoutComponent, order: 15, isAvailable: offered }),
  contribute(CONTINUE_PAYMENT_BLOCKS, { component: CustomerCreditCheckoutComponent, order: 15, isAvailable: offered }),
];

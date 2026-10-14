import { ChangeDetectionStrategy, Component, inject, input, signal, ElementRef, Injector, afterNextRender } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { CustomerReservation, PaymentMethodsSource, SelectionQuote } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { parseMoney } from '../../shared/money';
import { PortalSlot } from '../../shared/portal-slots';
import { PaymentsWriter } from '../data/payments-writer';
import { CUSTOMER_PAYMENT_TEXT, PAYMENTS_TEXT } from '../payments-copy';

/**
 * 21 (finalizar-reserva.html) "Método y plazo de pago", after the Medio de pago of 008-: the enabled types and the Monto a abonar;
 * the notes of the medium chosen on 21 (AC-PY.2, DP-PY6: the office registers cash); once the reservation exists, Continuar al pago opens 24.
 */
@Component({
  selector: 'app-checkout-payment-block', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="crp-booking-card crp-checkout-payment"><h2>{{ text.blockTitle }}</h2>
      @let options = types();
      @if (options === 'loading') { <p role="status">{{ common.loading }}</p> }
      @else if (options === 'error') { <div role="alert">{{ common.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ common.retry }}</button></div> }
      @else {
        <fieldset><legend>{{ text.typeTitle }}</legend>
          @for (option of options; track option.code) {
            <label class="crp-checkout-option"><input type="radio" name="paymentType" [value]="option.code" [checked]="chosen(options) === option.code"
              (change)="type.set(option.code)" />&ngsp;<span><strong>{{ option.label }}</strong>&ngsp;<span>{{ text.typeHint[option.code] }}</span></span></label>
          }
        </fieldset>
        @if (chosen(options) === 'PARTIAL') {
          <label for="crp-checkout-deposit">{{ text.deposit }}</label>
          <input id="crp-checkout-deposit" name="deposit" type="text" inputmode="decimal" autocomplete="off" [placeholder]="text.depositPlaceholder" [value]="deposit()"
            (input)="deposit.set($any($event.target).value)" [attr.aria-invalid]="invalid() ? 'true' : null" aria-describedby="crp-checkout-deposit-error" />
          <p id="crp-checkout-deposit-error" class="self-service-field-error">{{ invalid() ? text.depositInvalid : '' }}</p>
          <p class="self-service-note">{{ text.depositHint }}</p>
        }
        <div class="crp-checkout-deadline">@for (line of text.deadline; track line) { <p class="self-service-note">{{ line }}</p> }
          @if (chosen(options) === 'PARTIAL') { <p class="self-service-note">{{ text.balanceRule }}</p> }</div>
        @let r = reservation(); @let medium = r?.paymentMethod ?? method();
        @if (medium === 'BANK_TRANSFER') {
          <p class="self-service-note">{{ text.transferHint }}</p>
          @if (r) { <button type="button" class="crp-primary" (click)="pay(r, chosen(options))">{{ text.continue }}</button> }
        } @else if (medium) { <p class="self-service-note">{{ text.cashHint }}</p> }
      }
    </article>
  `,
})
export class CheckoutPaymentBlockComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  private focusFirstErrorOnRender(): void { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); }
  readonly quote = input.required<SelectionQuote>();
  readonly reservation = input<CustomerReservation | null>(null);
  /** The medium chosen on 21 before the reservation exists. */
  readonly method = input('');
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly methods = inject(PaymentMethodsSource);
  private readonly requests = new Subject<void>();
  protected readonly types = toSignal(this.requests.pipe(switchMap(() => defer(() => this.methods.listTypes()).pipe(
    startWith('loading' as const), catchError(() => of('error' as const))))), { initialValue: 'loading' as const });
  protected readonly text = CUSTOMER_PAYMENT_TEXT; protected readonly common = PAYMENTS_TEXT;
  protected readonly type = signal(''); protected readonly deposit = signal(''); protected readonly invalid = signal(false);
  constructor() { this.reload(); }
  protected reload(): void { this.requests.next(); }
  /** The mockup checks the first enabled type. */
  protected chosen(options: readonly { code: string }[]): string { return this.type() || options[0]?.code || ''; }

  /** Pago total pays the final value; an Abono pays the Monto a abonar, above zero and up to the final value (mockup 21). */
  protected pay(r: CustomerReservation, type: string): void {
    const parsed = parseMoney(this.deposit()), cents = parsed.kind === 'valid' ? parsed.minorUnits : 0;
    const final = this.quote().finalValueCents, amount = type === 'PARTIAL' ? cents : final;
    this.invalid.set(amount <= 0 || amount > final);
    if (this.invalid()) this.focusFirstErrorOnRender();
    else this.navigation?.open('transfer-payment', { reservation: r.reservationId, type, amount: String(amount) });
  }
}

/** CHECKOUT_BLOCKS contribution (mount-entry.ts): drawn only when the build supplies the payment ports. */
export const PAYMENTS_CHECKOUT_BLOCK: PortalSlot = {
  component: CheckoutPaymentBlockComponent, order: 10,
  isAvailable: (injector) => injector.get(PaymentsWriter, null) !== null && injector.get(PaymentMethodsSource, null) !== null,
};

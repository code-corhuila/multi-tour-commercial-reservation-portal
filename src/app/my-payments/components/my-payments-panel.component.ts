import { ChangeDetectionStrategy, Component, Injector, Provider, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { CustomerContext } from '../../self-service-reservation/data/customer-context';
import { CLIENT_NOTICES, CLIENT_QUICK_ACTIONS, RESERVATION_CARD_EXTRAS, contribute } from '../../shared/portal-slots';
import { ContinuePaymentTarget, MyPaymentsSource, PaymentNotice, TRANSFER_PAYMENT_AREA } from '../data/my-payments-source';
import { MY_PAYMENTS_TEXT, labelOf } from '../my-payments-copy';
import { ReservationEconomicLinesComponent } from './reservation-economic-lines.component';

const QUICK_ITEM = `<button type="button" class="crp-panel-quick-item" (click)="go()"><span class="crp-panel-quick-icon" aria-hidden="true">{{ item.icon }}</span>&ngsp;<span class="crp-panel-quick-copy"><strong>{{ item.title }}</strong>&ngsp;<span>{{ item.copy }}</span></span></button>`;

/** "Continuar pago" of 17 (CP): only for the reservation the port names (DP-MP3); opens screen 24 once and records nothing (RN-MP5). */
@Component({
  selector: 'li[crpContinuePayment]', changeDetection: ChangeDetectionStrategy.OnPush, host: { '[hidden]': '!target()' },
  template: `@if (target()) { ${QUICK_ITEM} }`,
})
export class ContinuePaymentActionComponent {
  protected readonly item = MY_PAYMENTS_TEXT.continuePay;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly named = toSignal(inject(MyPaymentsSource).continuePaymentTarget().pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly target = computed<ContinuePaymentTarget | null>(() => (this.navigation?.has(TRANSFER_PAYMENT_AREA) ? this.named() : null));
  private opened = false;

  protected go(): void {
    const t = this.target();
    if (!t || this.opened) return;
    this.opened = true;
    this.navigation?.open(TRANSFER_PAYMENT_AREA, { reservation: t.reservationId, ...(t.paymentType && { type: t.paymentType }), amount: String(t.amountCents) });
  }
}

/** "Mis pagos" of 17 (MP): opens the area of mis-pagos.html when the build has it. */
@Component({
  selector: 'li[crpMyPayments]', changeDetection: ChangeDetectionStrategy.OnPush, host: { '[hidden]': '!shown' },
  template: `@if (shown) { ${QUICK_ITEM} }`,
})
export class MyPaymentsActionComponent {
  protected readonly item = MY_PAYMENTS_TEXT.myPayments;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly shown = this.navigation?.has(CLIENT_AREA.payments) ?? false;

  protected go(): void { this.navigation?.open(CLIENT_AREA.payments); }
}

/** "Notificaciones" of 17: one proof notice per reservation the port names (DP-MP4); it acts on nothing. */
@Component({
  selector: 'crp-my-payments-notices', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (n of notices(); track n.reservationId) {
    <p><strong>{{ t.noticeLead }} {{ n.reservationId }}:</strong> {{ t.noticeProof }} {{ label('proof', n.proofStatus) }}. {{ t.noticeReview }}</p>
  }`,
})
export class PaymentNoticesComponent {
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly label = labelOf;
  protected readonly notices = toSignal(inject(MyPaymentsSource).notices().pipe(catchError(() => of<readonly PaymentNotice[]>([]))),
    { initialValue: [] as readonly PaymentNotice[] });
}

const withPort = (injector: Injector) => injector.get(MyPaymentsSource, null) !== null;

/** Plan D-05: what this story adds to 17 and to Mis reservas, registered in mount-entry.ts; nothing without its port. */
export const MY_PAYMENTS_CONTRIBUTIONS: Provider[] = [
  contribute(CLIENT_QUICK_ACTIONS, { component: ContinuePaymentActionComponent, order: 0, isAvailable: withPort }),
  contribute(CLIENT_QUICK_ACTIONS, { component: MyPaymentsActionComponent, order: 0.5, isAvailable: withPort }),
  contribute(CLIENT_NOTICES, { component: PaymentNoticesComponent, order: 0,
    isAvailable: (injector) => withPort(injector) && injector.get(CustomerContext).standing === 'FINAL_CUSTOMER' }),
  contribute(RESERVATION_CARD_EXTRAS, { component: ReservationEconomicLinesComponent, order: 10, isAvailable: withPort }),
];

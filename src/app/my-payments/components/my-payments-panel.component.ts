import { ChangeDetectionStrategy, Component, Injector, Provider, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { CustomerContext } from '../../self-service-reservation/data/customer-context';
import { CLIENT_NOTICES, CLIENT_QUICK_ACTIONS, RESERVATION_CARD_ACTIONS, RESERVATION_CARD_EXTRAS, contribute } from '../../shared/portal-slots';
import { ContinuePaymentTarget, MyPaymentsSource, PaymentNotice, TRANSFER_PAYMENT_AREA } from '../data/my-payments-source';
import { NoticeLine, noticeLines } from '../economic-rows';
import { MY_PAYMENTS_TEXT } from '../my-payments-copy';
import { ReservationEconomicActionsComponent, ReservationEconomicLinesComponent } from './reservation-economic-lines.component';

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

/** "Notificaciones" of 17: what the mockup writes (app.js 4758) of each reservation the port names (DP-MP4). It records nothing: the links only open screens. */
@Component({
  selector: 'crp-my-payments-notices', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (n of notices(); track n.reservationId) {
    @for (line of lines(n); track line.text) {
      <p><strong>{{ t.noticeLead }} {{ n.reservationId }}:</strong> {{ line.text }}</p>
      @if (line.action; as action) { @if (available(action)) { &ngsp;<button type="button" class="crp-panel-link" (click)="open(action, n)">{{ actionLabel(action) }}</button> } }
    }
  }`,
})
export class PaymentNoticesComponent {
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly lines = noticeLines;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly notices = toSignal(inject(MyPaymentsSource).notices().pipe(catchError(() => of<readonly PaymentNotice[]>([]))),
    { initialValue: [] as readonly PaymentNotice[] });

  /** A link is drawn only when the build has its destination (lesson A4). */
  protected available(action: NonNullable<NoticeLine['action']>): boolean {
    return this.navigation?.has(action === 'credit' ? CLIENT_AREA.payments : TRANSFER_PAYMENT_AREA) ?? false;
  }

  protected actionLabel(action: NonNullable<NoticeLine['action']>): string {
    return action === 'pay' ? this.t.payAction : action === 'present' ? this.t.presentAction : this.t.seeCredit;
  }

  protected open(action: NonNullable<NoticeLine['action']>, n: PaymentNotice): void {
    if (action === 'credit') this.navigation?.open(CLIENT_AREA.payments, { reservation: n.reservationId });
    else this.navigation?.open(TRANSFER_PAYMENT_AREA, { reservation: n.reservationId, ...(n.paymentType && { type: n.paymentType }), amount: String(n.balanceCents ?? 0) });
  }
}

const withPort = (injector: Injector) => injector.get(MyPaymentsSource, null) !== null;

/** Plan D-05: what this story adds to 17 and to Mis reservas, registered in mount-entry.ts; nothing without its port. */
export const MY_PAYMENTS_CONTRIBUTIONS: Provider[] = [
  contribute(CLIENT_QUICK_ACTIONS, { component: ContinuePaymentActionComponent, order: 0, isAvailable: withPort }),
  contribute(CLIENT_QUICK_ACTIONS, { component: MyPaymentsActionComponent, order: 0, isAvailable: withPort }),
  contribute(CLIENT_NOTICES, { component: PaymentNoticesComponent, order: 0,
    isAvailable: (injector) => withPort(injector) && injector.get(CustomerContext).isFinalCustomer }),
  contribute(RESERVATION_CARD_EXTRAS, { component: ReservationEconomicLinesComponent, order: 10, isAvailable: withPort }),
  contribute(RESERVATION_CARD_ACTIONS, { component: ReservationEconomicActionsComponent, order: 1, isAvailable: withPort }),
];

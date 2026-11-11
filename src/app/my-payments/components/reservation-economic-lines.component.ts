import { ChangeDetectionStrategy, Component, Signal, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { formatCop } from '../../shared/format';
import { CustomerPaymentSummary, MyPaymentsSource, TRANSFER_PAYMENT_AREA } from '../data/my-payments-source';
import { deadlineText, detailRows, paymentAction } from '../economic-rows';
import { MY_PAYMENTS_TEXT, labelOf } from '../my-payments-copy';

/** The line of one own reservation from the port that Mis pagos reads (RN-MP1), for the card input `reservationId`. */
function lineOf(source: MyPaymentsSource, id: Signal<string>) {
  return toSignal(toObservable(id).pipe(filter(Boolean), switchMap((code) => source.listMine().pipe(
    map((all): CustomerPaymentSummary | null => all.find((r) => r.reservationId === code) ?? null), catchError(() => of(null))))), { initialValue: null });
}

/** The economic lines of a mis-reservas.html card (RESERVATION_CARD_EXTRAS), read only from the same port as Mis pagos (RN-MP1). */
@Component({
  selector: 'crp-my-payments-card-lines', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (line(); as r) {
    <small>{{ t.type }}: {{ label('type', r.paymentType) }} · {{ t.method }}: {{ label('method', r.paymentMethod) }}</small>
    &ngsp;<small>{{ t.proof }}: {{ label('proof', r.proofStatus) }}@if (r.financialStatus !== null) { · {{ t.financial }}: {{ label('financial', r.financialStatus) }} }</small>
    @if (r.reservationStatus !== 'CANCELLED') { &ngsp;<small>{{ t.lineBalance }}: {{ cop(r.balanceCents) }}</small> }
    @if (deadline(r); as text) { &ngsp;<small>{{ text }}</small> }
    @if (r.cancellationCause) { &ngsp;<small>{{ r.cancellationCause }}</small> }
    @if (r.refundTreatment) { &ngsp;<small>{{ r.refundTreatment }}</small> }
    &ngsp;<details class="crp-my-payments-details"><summary>{{ t.detail }}</summary><dl>@for (row of rows(r); track row[0]) { <div><dt>{{ row[0] }}</dt>&ngsp;<dd>{{ row[1] }}</dd></div> }</dl></details>
  }`,
})
export class ReservationEconomicLinesComponent {
  readonly reservationId = input('');
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly label = labelOf;
  protected readonly cop = formatCop;
  protected readonly deadline = deadlineText;
  protected readonly rows = detailRows;
  protected readonly line = lineOf(inject(MyPaymentsSource), this.reservationId);
}

/** "Continuar pago" / "Presentar nuevo comprobante" and "Ver pagos y comprobantes" of a mis-reservas.html card; each only if its destination exists (lesson A4). */
@Component({
  selector: 'crp-my-payments-card-actions', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (line(); as r) {
    @let act = canPay ? action(r) : null;
    @if (act || canSee) {
      <div class="crp-my-payments-card-actions">
        @if (act) { <button type="button" class="crp-primary" (click)="pay(r)">{{ act === 'pay' ? t.payAction : t.presentAction }}</button> }
        @if (canSee) { <button type="button" class="crp-outline" (click)="see(r)">{{ t.seePayments }}</button> }
      </div>
    }
  }`,
})
export class ReservationEconomicActionsComponent {
  readonly reservationId = input('');
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly action = paymentAction;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly canPay = this.navigation?.has(TRANSFER_PAYMENT_AREA) ?? false;
  protected readonly canSee = this.navigation?.has(CLIENT_AREA.payments) ?? false;
  protected readonly line = lineOf(inject(MyPaymentsSource), this.reservationId);

  protected pay(r: CustomerPaymentSummary): void {
    this.navigation?.open(TRANSFER_PAYMENT_AREA, { reservation: r.reservationId, ...(r.paymentType && { type: r.paymentType }), amount: String(r.balanceCents) });
  }

  protected see(r: CustomerPaymentSummary): void { this.navigation?.open(CLIENT_AREA.payments, { reservation: r.reservationId }); }
}

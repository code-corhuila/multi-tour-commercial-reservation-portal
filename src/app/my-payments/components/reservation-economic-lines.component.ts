import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { formatCop } from '../../shared/format';
import { CustomerPaymentSummary, MyPaymentsSource } from '../data/my-payments-source';
import { MY_PAYMENTS_TEXT, labelOf } from '../my-payments-copy';

/** The economic lines of a mis-reservas.html card (RESERVATION_CARD_EXTRAS), read only from the same port as Mis pagos (RN-MP1). */
@Component({
  selector: 'crp-my-payments-card-lines', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (line(); as r) {
    <small>{{ t.lineType }}: {{ label('type', r.paymentType) }} · {{ t.lineMethod }}: {{ label('method', r.paymentMethod) }}</small>
    &ngsp;<small>{{ t.lineProof }}: {{ label('proof', r.proofStatus) }}@if (r.financialStatus !== null) { · {{ t.financial }}: {{ label('financial', r.financialStatus) }} }</small>
    &ngsp;<small>{{ t.lineBalance }}: {{ cop(r.balanceCents) }}</small>
    @if (r.cancellationCause) { &ngsp;<small>{{ r.cancellationCause }}</small> }
    @if (r.refundTreatment) { &ngsp;<small>{{ r.refundTreatment }}</small> }
  }`,
})
export class ReservationEconomicLinesComponent {
  readonly reservationId = input('');
  protected readonly t = MY_PAYMENTS_TEXT;
  protected readonly label = labelOf;
  protected readonly cop = formatCop;
  private readonly source = inject(MyPaymentsSource);
  protected readonly line = toSignal(toObservable(this.reservationId).pipe(filter(Boolean), switchMap((id) => this.source.listMine().pipe(
    map((all): CustomerPaymentSummary | null => all.find((r) => r.reservationId === id) ?? null), catchError(() => of(null))))), { initialValue: null });
}

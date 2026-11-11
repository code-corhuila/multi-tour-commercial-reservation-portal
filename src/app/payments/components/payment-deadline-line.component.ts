import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { CustomerReservation } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { PaymentDeadlineReader } from '../data/payment-followup-ports';
import { PAYMENT_FOLLOWUP_TEXT, dateTime } from '../payment-followup-copy';

/** 24 (reservationId) and 21 once the reservation exists (reservation): "Ningún plazo de pago supera el inicio de la salida, …" (RN-RES-006);
    on 24 it carries the travel-transfer-reference-copy style of the review limit, as pago-transferencia.html writes both in one line. */
@Component({ selector: 'app-payment-deadline-line', changeDetection: ChangeDetectionStrategy.OnPush, template: `@if (line()) { <p [class.crp-transfer-reference-copy]="!!reservationId()">{{ line() }}</p> }` })
export class PaymentDeadlineLineComponent {
  readonly reservationId = input('');
  readonly reservation = input<Pick<CustomerReservation, 'reservationId'> | null>(null);
  private readonly reader = inject(PaymentDeadlineReader);
  private readonly id = computed(() => this.reservationId() || this.reservation()?.reservationId || '');
  protected readonly line = toSignal(toObservable(this.id).pipe(
    switchMap((id) => (id ? this.reader.deadlineOf(id).pipe(catchError(() => of(null))) : of(null))),
    map((d) => (d ? PAYMENT_FOLLOWUP_TEXT.departureLimit(dateTime(d.departureStartsAt)) : ''))), { initialValue: '' });
}

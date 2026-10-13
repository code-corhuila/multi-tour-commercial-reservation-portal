import { ChangeDetectionStrategy, Component, Injector, Provider, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CHECKOUT_BLOCKS, PAYMENTS_TABLE_BODIES, TRANSFER_PAYMENT_LINES, contribute } from '../../shared/portal-slots';
import { PaymentDeadlineReader, PendingPaymentsSource } from '../data/payment-followup-ports';
import { PAYMENT_FOLLOWUP_TEXT } from '../payment-followup-copy';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';
import { PaymentDeadlineLineComponent } from './payment-deadline-line.component';
import { PaymentLabels, modalityOf, paymentLabels } from './reservation-payments-block.component';

type State = PageState<{ rows: readonly Reservation[]; labels: PaymentLabels }>;

/** 13 (admin-pagos.html): the "Saldo pendiente" rows after the proofs of HU-COM-010; the action is a button, never the row (plan D-07). */
@Component({
  selector: 'tbody[crpPendingPaymentRows]', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <tr><td colspan="6" role="status" data-state="loading">{{ common.loading }}</td></tr> }
      @case ('error') { <tr><td colspan="6" role="alert" data-state="error">{{ common.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ common.retry }}</button></td></tr> }
      @case ('data') { @let d = s.items[0];
        @for (r of d.rows; track r.id) {
          <tr><td><strong>#{{ r.id }}</strong></td><td>{{ r.leadCustomerName }}</td><td>{{ modality(r, d.labels) }}</td><td>{{ money(r.balanceCents) }}</td>
            <td><span class="crp-operator-status crp-is-pending">{{ t.pendingBalance }}</span></td>
            <td>@if (canFollowUp) { <button type="button" (click)="open(r)">{{ t.title }}</button> }</td></tr>
        }
      }
      @case ('empty') { @if (!proofs()) { <tr><td colspan="6" role="status" data-state="empty">{{ emptyTable }}</td></tr> } }
    }
  `,
})
export class PendingPaymentRowsComponent {
  /** The proof rows the host drew: with none and no pending row, the table shows HU-COM-010's empty text (spec 011-). */
  readonly proofs = input(0); protected readonly emptyTable = PROOF_REVIEW_TEXT.empty;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(PendingPaymentsSource); private readonly methods = inject(PaymentMethodsSource);
  protected readonly canFollowUp = inject(PortalCapabilities).canFollowUp();
  protected readonly t = PAYMENT_FOLLOWUP_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly money = formatCop; protected readonly modality = modalityOf;
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => defer(() => forkJoin({ rows: this.source.list(), labels: paymentLabels(this.methods) })).pipe(
    map(({ rows, labels }): State => (rows.length ? { kind: 'data', items: [{ rows, labels }] } : { kind: 'empty' })),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  protected open(r: Reservation): void { this.navigation?.open('payments-followup', { reservation: r.id }); }
}

const has = (port: unknown) => (injector: Injector) => injector.get(port as never, null) !== null;
/** HU-COM-011 contributions (mount-entry.ts): the rows of 13 with the pending source; the sentence of 24 after the review limit of
 * HU-COM-010 (order 0) and of 21 after the payment block of HU-COM-009 (order 10), with the deadline reader. */
export const PAYMENT_FOLLOWUP_CONTRIBUTIONS: readonly Provider[] = [
  contribute(PAYMENTS_TABLE_BODIES, { component: PendingPaymentRowsComponent, order: 10, isAvailable: has(PendingPaymentsSource) }),
  contribute(CHECKOUT_BLOCKS, { component: PaymentDeadlineLineComponent, order: 20, isAvailable: has(PaymentDeadlineReader) }),
  contribute(TRANSFER_PAYMENT_LINES, { component: PaymentDeadlineLineComponent, order: 10, isAvailable: has(PaymentDeadlineReader) }),
];

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { FINANCIAL_LABEL, Reservation } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { formatCop } from '../../shared/format';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlot } from '../../shared/portal-slots';
import { PaymentsWriter } from '../data/payments-writer';
import { tenantDateTime } from '../payment-followup-copy';
import { PAYMENTS_TEXT } from '../payments-copy';

export type PaymentLabels = Readonly<Record<string, string | undefined>>;

/** The labels of the enabled types and methods, by code (DP-PY4), as one lookup. */
export function paymentLabels(source: PaymentMethodsSource): Observable<PaymentLabels> {
  return forkJoin({ types: source.listTypes(), methods: source.listEnabled() }).pipe(
    map(({ types, methods }) => Object.fromEntries([...types, ...methods].map((option) => [option.code, option.label]))));
}

/** "Tipo · Medio" of the reservation (Modalidad of 13), or Sin modalidad definida. */
export function modalityOf(r: Reservation, labels: PaymentLabels): string {
  const parts = [r.paymentType, r.paymentMethod].map((code) => labels[code ?? '']).filter(Boolean);
  return r.paymentMethod && parts.length ? parts.join(' · ') : PAYMENTS_TEXT.noModality;
}

/** 10A "Pagos y soportes" (fresh = false) or the "Gestionar pago" action of 10C (fresh = true). The values come resolved. */
@Component({
  selector: 'app-reservation-payments-block', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = reservation();
    @if (fresh()) { @if (canRegister) { <button type="button" class="crp-operator-primary" (click)="manage()">{{ text.manage }}</button> } }
    @else {
      <section class="crp-operator-panel crp-payments-block">
        <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.blockEyebrow }}</p><h2>{{ text.blockTitle }}</h2></div>
          @if (canRegister) { <button type="button" class="crp-operator-primary" (click)="manage()">{{ text.manage }}</button> }</div>
        @let names = labels();
        @if (names === 'loading') { <p role="status">{{ text.loading }}</p> }
        @else if (names === 'error') { <div role="alert">{{ text.failed }} <button type="button" class="crp-operator-outline" (click)="reload()">{{ text.retry }}</button></div> }
        @else {
          @let last = r.payments?.at(-1);
          <div class="crp-table-wrap"><table class="crp-operator-table">
            <thead><tr>@for (column of text.columns; track column) { <th>{{ column }}</th> }</tr></thead>
            <tbody><tr><td>{{ names[r.paymentType ?? ''] ?? text.noModality }}</td><td>{{ names[r.paymentMethod ?? ''] ?? text.noModality }}</td>
              <td>{{ last ? text.proofStatus[last.proofStatus] : text.noProof }}</td><td>{{ financial[r.financialStatus] }}</td>
              <td>{{ money(r.validatedCents ?? 0) }}</td><td>{{ money(r.balanceCents) }}</td></tr></tbody>
          </table></div>
        }
      </section>
      <section class="crp-operator-panel crp-payments-receipts">
        <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.receiptsEyebrow }}</p><h2>{{ text.receiptsTitle }}</h2></div></div>
        <div class="crp-table-wrap"><table class="crp-operator-table">
          <thead><tr>@for (column of text.receiptColumns; track column) { <th>{{ column }}</th> }</tr></thead>
          <tbody>@for (p of receipts(); track p.id) { <tr><td>{{ presented(p) }}</td><td>{{ money(p.amountCents) }}</td>
            <td>{{ p.proofStatus === 'APROBADO' && p.review?.verifiedAmountCents != null ? money(p.review!.verifiedAmountCents!) : '—' }}</td><td>{{ text.proofStatus[p.proofStatus] }}</td>
            <td>{{ p.review ? p.review.actorLabel + ' · ' + tenant(p.review.decidedAt) + (p.review.reason ? ' · ' + p.review.reason : '') : text.pendingDecision }}</td></tr> }
            @empty { <tr><td colspan="5">{{ text.noReceipts }}</td></tr> }</tbody>
        </table></div>
      </section>
    }
  `,
})
export class ReservationPaymentsBlockComponent {
  readonly reservation = input.required<Reservation>();
  readonly fresh = input(false);
  protected readonly canRegister = inject(PortalCapabilities).canRegisterPayment();
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly methods = inject(PaymentMethodsSource);
  private readonly requests = new Subject<void>();
  protected readonly labels = toSignal(this.requests.pipe(switchMap(() => defer(() => paymentLabels(this.methods)).pipe(
    startWith('loading' as const), catchError(() => of('error' as const))))), { initialValue: 'loading' as const });
  protected readonly receipts = computed(() => (this.reservation().payments ?? []).filter((p) => p.method === 'BANK_TRANSFER'));
  protected readonly tenant = tenantDateTime;
  protected presented(p: { presentedAt?: string }): string { return p.presentedAt ? tenantDateTime(p.presentedAt) : '—'; }
  protected readonly text = PAYMENTS_TEXT; protected readonly financial = FINANCIAL_LABEL; protected readonly money = formatCop;
  constructor() { this.reload(); }
  protected reload(): void { this.requests.next(); }
  protected manage(): void { this.navigation?.open('payment-management', { reservation: this.reservation().id }); }
}

/** RESERVATION_DETAIL_BLOCKS contribution (mount-entry.ts): drawn only when the build supplies the payment ports. */
export const PAYMENTS_DETAIL_BLOCK: PortalSlot = {
  component: ReservationPaymentsBlockComponent, order: 10,
  isAvailable: (injector) => injector.get(PaymentsWriter, null) !== null && injector.get(PaymentMethodsSource, null) !== null,
};

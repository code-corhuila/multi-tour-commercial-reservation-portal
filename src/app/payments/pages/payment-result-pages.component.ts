import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { CustomerPaymentSummary, MyPaymentsSource, TRANSFER_PAYMENT_AREA } from '../../my-payments/data/my-payments-source';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { FINANCIAL_LABEL } from '../../reservations/data/reservations-source';
import { reservationState } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { Clock } from '../../shared/clock';
import { departureLine, formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PAYMENT_RESULT_TEXT } from '../payment-result-copy';
import { PAYMENTS_TEXT, viajeros } from '../payments-copy';

/** Reads the own reservation these two screens are about (22 and 23, opened with { reservation }); the container decides whose they are. */
abstract class PaymentResultPage {
  protected readonly t = PAYMENT_RESULT_TEXT;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly cop = formatCop; protected readonly when = departureLine; protected readonly travelers = viajeros;
  protected readonly area = CLIENT_AREA;
  private readonly clock = inject(Clock);
  private readonly source = inject(MyPaymentsSource);
  protected readonly wanted = this.navigation?.params()['reservation'];
  private readonly requests = new Subject<void>();
  protected abstract pick(all: readonly CustomerPaymentSummary[]): CustomerPaymentSummary | undefined;
  protected readonly state = toSignal(this.requests.pipe(switchMap(() => this.source.listMine().pipe(
    map((all): PageState<CustomerPaymentSummary> => { const found = this.pick(all); return found ? { kind: 'data', items: [found] } : { kind: 'empty' }; }),
    catchError((error) => of<PageState<CustomerPaymentSummary>>({ kind: 'error', ...readFailure(error), retry: () => this.reload() })),
    startWith<PageState<CustomerPaymentSummary>>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PageState<CustomerPaymentSummary> });

  constructor() { this.reload(); }
  protected reload(): void { this.requests.next(); }
  protected open(key: string, params: Record<string, string> = {}): void { this.navigation?.open(key, params); }
  protected status(r: CustomerPaymentSummary): string { return reservationState(r.reservationStatus)[0]; }
  protected expired(r: CustomerPaymentSummary): boolean { return !!r.deadlineAt && Date.parse(r.deadlineAt) < this.clock.now(); }
}

/** pago-exitoso.html (22, "Comprobante recibido"): the proof is En validación and does not confirm the reservation. */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-payment-received-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-result" aria-labelledby="crp-result-title">
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') { <h1 id="crp-result-title">{{ t.received.missingTitle }}</h1><p class="crp-result-copy" data-state="empty">{{ t.received.missing }}</p> }
        @case ('data') {
          @let r = s.items[0];
          <div class="crp-result-icon" aria-hidden="true">✓</div>
          <h1 id="crp-result-title">{{ t.received.title }}</h1><p class="crp-result-copy" data-state="data">{{ t.received.message }}</p>
          <p class="crp-result-summary"><strong>{{ r.tourName }}</strong>&ngsp;<span>{{ when(r.departureAt) }}</span>@if (r.people) { &ngsp;<span>{{ travelers(r.people) }}</span> }</p>
          <p class="crp-result-ref"><span>{{ t.reservation }}</span>&ngsp;<strong>#{{ r.reservationId }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.received.proof }}</span>&ngsp;<strong>{{ proofs[r.proofStatus] }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.received.status }}</span>&ngsp;<strong>{{ status(r) }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.received.financial }}</span>&ngsp;<strong>{{ r.financialStatus ? financial[r.financialStatus] : t.received.noFinancial }}</strong></p>
          <p class="crp-result-deadline">{{ r.deadlineAt ? t.received.deadline(when(r.deadlineAt)) : t.received.deadlineDefault }}</p>
        }
      }
      <div class="crp-result-actions">
        @if (navigation?.has(area.reservations)) { <button type="button" class="crp-primary" (click)="open(area.reservations)">{{ t.seeReservations }}</button> }
        @if (navigation?.has(area.panel)) { <button type="button" class="crp-outline" (click)="open(area.panel)">{{ t.backToPanel }}</button> }
      </div>
    </section>
  `,
})
export class PaymentReceivedPageComponent extends PaymentResultPage {
  protected readonly proofs = PAYMENTS_TEXT.proofStatus; protected readonly financial: Readonly<Record<string, string>> = FINANCIAL_LABEL;
  protected override pick(all: readonly CustomerPaymentSummary[]) { return all.find((r) => r.reservationId === this.wanted); }
}

/** pago-fallido.html (23, "Comprobante rechazado"): the reason decided in HU-COM-010, and a new proof on the same reservation while the deadline lasts. */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-payment-rejected-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-result crp-result-rejected" aria-labelledby="crp-result-title">
      @let s = state();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="t.failed" />&ngsp;<button type="button" class="crp-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
        @case ('empty') {
          <h1 id="crp-result-title">{{ t.rejected.noneTitle }}</h1><p class="crp-result-copy" data-state="empty">{{ t.rejected.none }}</p>
          @if (navigation?.has(area.payments)) { <div class="crp-result-actions"><button type="button" class="crp-primary" (click)="open(area.payments)">{{ t.rejected.toPayments }}</button></div> }
        }
        @case ('data') {
          @let r = s.items[0];
          <div class="crp-result-icon" aria-hidden="true">!</div>
          <h1 id="crp-result-title">{{ t.rejected.title }}</h1><p class="crp-result-copy" data-state="data">{{ t.rejected.message }}</p>
          <p class="crp-result-summary"><strong>{{ r.tourName }}</strong>&ngsp;<span>{{ when(r.departureAt) }}</span>@if (r.people) { &ngsp;<span>{{ travelers(r.people) }}</span> }</p>
          <p class="crp-result-ref"><span>{{ t.reservation }}</span>&ngsp;<strong>#{{ r.reservationId }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.rejected.state }}</span>&ngsp;<strong>{{ t.rejected.proof }} · {{ t.rejected.reservation }} {{ status(r) }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.rejected.reason }}</span>&ngsp;<strong>{{ reason(r) }}</strong></p>
          <p class="crp-result-ref"><span>{{ t.rejected.balance }}</span>&ngsp;<strong>{{ cop(r.balanceCents) }}</strong></p>
          <p class="crp-result-deadline">{{ expired(r) ? t.rejected.expired : r.deadlineAt ? t.rejected.deadline(when(r.deadlineAt)) : t.rejected.deadlineDefault }}</p>
          <div class="crp-result-actions">
            @if (!expired(r)) { <button type="button" class="crp-primary" (click)="present(r)">{{ t.rejected.present }}</button> }
            @if (navigation?.has(area.reservations)) { <button type="button" [class]="expired(r) ? 'crp-primary' : 'crp-outline'" (click)="open(area.reservations)">{{ t.seeReservations }}</button> }
          </div>
        }
      }
    </section>
  `,
})
export class PaymentRejectedPageComponent extends PaymentResultPage {
  protected override pick(all: readonly CustomerPaymentSummary[]) {
    return all.find((r) => r.proofStatus === 'RECHAZADO' && r.reservationStatus !== 'CANCELLED' && (!this.wanted || r.reservationId === this.wanted));
  }
  protected reason(r: CustomerPaymentSummary): string { return [...(r.receipts ?? [])].reverse().find((p) => p.status === 'RECHAZADO')?.rejectionReason ?? this.t.rejected.noReason; }
  /** Back to 24 with the balance, the same reservation and its type (DP-MP5). */
  protected present(r: CustomerPaymentSummary): void {
    this.open(TRANSFER_PAYMENT_AREA, { reservation: r.reservationId, ...(r.paymentType && { type: r.paymentType }), amount: String(r.balanceCents) });
  }
}

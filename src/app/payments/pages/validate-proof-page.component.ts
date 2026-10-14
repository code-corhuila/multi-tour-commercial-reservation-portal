import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { FINANCIAL_LABEL, Reservation, ReservationPayment, ReservationsSource } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { parseCop } from '../../shared/money';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PaymentLabels, modalityOf, paymentLabels } from '../components/reservation-payments-block.component';
import { DecideProofCommand, PendingProofsSource, ProofReviewWriter } from '../data/proof-review-ports';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';

type Decision = DecideProofCommand['decision'];
type State = PageState<{ reservation: Reservation; payment: ReservationPayment; labels: PaymentLabels; overdue: boolean }>;
/** The mockup waits this long on its answer before it goes back to admin-pagos.html. */
const BACK_DELAY_MS = 1600;

/**
 * admin-validar-soporte.html (13, titled Validar comprobante), opened with { reservation, payment }; without Validar comprobantes,
 * the mockup's "Ver comprobante" mode. The preview of the file (image or PDF viewer) is blocked by contract: the port gives its name only.
 */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-validate-proof-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ canDecide ? t.validate : t.view }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="back()">{{ t.back }}</button></header>
    <p class="crp-access-note">{{ t.accessNote }}</p>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="common.failed" />&ngsp;<button type="button" class="crp-operator-outline" (click)="s.retry()">{{ common.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') {
        @let r = s.items[0].reservation; @let p = s.items[0].payment; @let locked = !canDecide || p.proofStatus !== 'EN_VALIDACION' || pending();
        <form novalidate data-state="data" [attr.aria-busy]="pending()" (submit)="$event.preventDefault()">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.proofEyebrow }}</p><h2>{{ canDecide ? t.heading : t.readOnlyHeading }}</h2>
            <div class="crp-form-grid">
              <div><label for="crp-proof-review-code">{{ t.reservation }}</label><input id="crp-proof-review-code" readonly [value]="'#' + r.id"></div>
              <div><label for="crp-proof-review-customer">{{ t.customer }}</label><input id="crp-proof-review-customer" readonly [value]="r.leadCustomerName"></div>
              <div><label for="crp-proof-review-method">{{ t.modality }}</label><input id="crp-proof-review-method" readonly [value]="modality(r, s.items[0].labels)"></div>
              <div><label for="crp-proof-review-declared">{{ t.declared }}</label><input id="crp-proof-review-declared" readonly [value]="money(p.amountCents)"></div>
              <div><label for="crp-proof-review-amount">{{ t.amount }}</label><input id="crp-proof-review-amount" name="verifiedAmount" type="text" inputmode="decimal" autocomplete="off"
                  [readonly]="locked" [value]="locked ? money(p.review?.verifiedAmountCents ?? p.amountCents) : amountOf(p)" (input)="amount.set(value($event)); keyFor = null"
                  [attr.aria-invalid]="errors().amount ? 'true' : null" aria-describedby="crp-proof-review-amount-error">
                <p id="crp-proof-review-amount-error" class="crp-payments-error">{{ errors().amount }}</p></div>
              <div><label for="crp-proof-review-status">{{ t.status }}</label><input id="crp-proof-review-status" readonly [value]="common.proofStatus[p.proofStatus]"></div>
              <div class="crp-proof-review-wide"><span>{{ t.proof }}</span><p>{{ t.file(p.proofName) }}</p></div>
              @if (canDecide) { <div class="crp-proof-review-wide"><label for="crp-proof-review-reason">{{ t.reason }}</label>
                <textarea id="crp-proof-review-reason" name="reason" required [disabled]="locked" [placeholder]="t.reasonPlaceholder" (input)="reason.set(value($event)); keyFor = null"
                  [attr.aria-invalid]="errors().reason ? 'true' : null" aria-describedby="crp-proof-review-reason-error"></textarea>
                <p id="crp-proof-review-reason-error" class="crp-payments-error">{{ errors().reason }}</p></div> }
            </div>
            <p class="crp-operator-copy">{{ t.recognized }}</p>
          </section>
          <p role="status">{{ feedback(p, s.items[0].overdue) }}</p>
          <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back()">{{ t.back }}</button>
            @if (canDecide) { <button type="button" class="crp-operator-outline" [disabled]="locked" (click)="decide(r, p, 'RECHAZADO')">{{ t.reject }}</button>
              <button type="button" class="crp-operator-primary" [disabled]="locked" (click)="decide(r, p, 'APROBADO')">{{ t.approve }}</button> }</div>
        </form>
      }
    }
  `,
})
export class ValidateProofPageComponent {
  private readonly navigation = inject(PortalNavigation, { optional: true }); private readonly params = this.navigation?.params() ?? {};
  private readonly source = inject(ReservationsSource); private readonly methods = inject(PaymentMethodsSource); private readonly proofs = inject(PendingProofsSource);
  private readonly writer = inject(ProofReviewWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly canDecide = inject(PortalCapabilities).canDecideProof();
  protected readonly t = PROOF_REVIEW_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly money = formatCop; protected readonly modality = modalityOf;
  protected readonly amount = signal<string | null>(null); protected readonly reason = signal(''); protected readonly errors = signal<{ amount?: string; reason?: string }>({});
  protected readonly pending = signal(false); private readonly outcome = signal(''); private readonly refused = signal('');
  /** One key per intention: a retry of the same decision reuses it; an edit (keyFor = null) or the other decision takes a new one. */
  private key = ''; protected keyFor: Decision | null = null; private readonly requests = new Subject<void>(); private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly loaded = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => defer(() => forkJoin({ all: this.source.list(), marks: this.proofs.list(), labels: paymentLabels(this.methods) })).pipe(
    map(({ all, marks, labels }): State => {
      const reservation = all.find((r) => r.id === this.params['reservation']), payment = reservation?.payments?.find((p) => p.id === this.params['payment']);
      const overdue = marks.rows.some((row) => row.payment.id === payment?.id && row.overdue);
      return reservation && payment ? { kind: 'data', items: [{ reservation, payment, labels, overdue }] } : { kind: 'empty' };
    }),
    catchError((error) => of<State>({ kind: 'error', ...readFailure(error), retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  /** The reservation as the writer answered it; the newest answer wins over the list. */
  private readonly saved = signal<Reservation | null>(null);
  protected readonly state = computed((): State => {
    const s = this.loaded(), saved = this.saved(), payment = s.kind === 'data' && saved?.payments?.find((p) => p.id === s.items[0].payment.id);
    return s.kind === 'data' && saved && payment ? { kind: 'data', items: [{ ...s.items[0], reservation: saved, payment }] } : s;
  });

  constructor() { inject(DestroyRef).onDestroy(() => clearTimeout(this.timer)); }

  protected amountOf(p: ReservationPayment): string { return this.amount() ?? formatCop(p.amountCents); }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }

  protected feedback(p: ReservationPayment, overdue: boolean): string {
    return this.outcome() || (!this.canDecide ? this.t.readOnly : p.proofStatus !== 'EN_VALIDACION' ? this.t.decided(p.proofStatus === 'APROBADO', p.review?.actorLabel)
      : this.refused() || (overdue ? this.t.overdueNotice : this.t.hint));
  }
  protected decide(r: Reservation, p: ReservationPayment, decision: Decision): void {
    if (this.pending() || this.outcome() || !this.canDecide) return;
    const reason = this.reason().trim(), parsed = parseCop(this.amountOf(p)), cents = parsed.kind === 'valid' ? parsed.minorUnits : 0, approving = decision === 'APROBADO';
    // The reason is mandatory when rejecting and when the verified amount differs from the declared one (RN-RES-006A).
    const errors = { reason: !reason && (!approving || cents !== p.amountCents) ? (approving ? this.t.differenceRequired : this.t.reasonRequired) : undefined,
      amount: !approving || cents > 0 ? undefined : this.t.amountRequired };
    this.errors.set(errors);
    if (errors.reason || errors.amount) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    if (this.keyFor !== decision) { this.key = this.keys.generate(); this.keyFor = decision; }
    this.pending.set(true); this.refused.set('');
    this.writer.decide({ reservationId: r.id, paymentId: p.id, decision, verifiedAmountCents: approving ? cents : 0, reason }, this.key).subscribe({
      next: (saved) => { this.saved.set(saved); this.outcome.set(this.answer(r, saved, p.id, approving)); this.pending.set(false); this.timer = setTimeout(() => this.back(), BACK_DELAY_MS); },
      error: (e: { userMessage?: string }) => { this.refused.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
  /** The mockup's sentence: what was applied and the situation, then the confirmation, the excess and the cancelled treatment when they happen. */
  private answer(before: Reservation, saved: Reservation, paymentId: string, approved: boolean): string {
    if (!approved) return this.t.rejected;
    const review = saved.payments?.find((x) => x.id === paymentId)?.review, extra: string[] = [];
    if (before.status === 'PENDIENTE_DE_PAGO' && saved.status === 'CONFIRMADA') extra.push(this.t.confirmed);
    if (review?.surplusCents) extra.push(this.t.surplus(formatCop(review.surplusCents)));
    if (review?.pendingTreatmentCents) extra.push(this.t.untreated(formatCop(review.pendingTreatmentCents)));
    return this.t.approved(formatCop(review?.appliedCents ?? 0), FINANCIAL_LABEL[saved.financialStatus], extra);
  }
  protected back(): void { this.navigation?.open('payments'); }
}

import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation, ReservationPayment, ReservationsSource } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { formatMoney, parseMoney } from '../../shared/money';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PaymentLabels, modalityOf, paymentLabels } from '../components/reservation-payments-block.component';
import { DecideProofCommand, ProofReviewWriter } from '../data/proof-review-ports';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';

type Decision = DecideProofCommand['decision'];
type State = PageState<{ reservation: Reservation; payment: ReservationPayment; labels: PaymentLabels }>;

/** admin-validar-soporte.html (13), opened with { reservation, payment }; without Validar comprobantes, the mockup's "Ver soporte" mode. */
@Component({
  selector: 'app-validate-proof-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ canDecide ? t.validate : t.view }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="back()">{{ t.back }}</button></header>
    <p class="crp-access-note">{{ t.accessNote }}</p>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ common.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ common.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') {
        @let r = s.items[0].reservation; @let p = s.items[0].payment; @let locked = !canDecide || p.proofStatus !== 'EN_VALIDACION' || pending();
        <form novalidate data-state="data" [attr.aria-busy]="pending()" (submit)="$event.preventDefault()">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.proofEyebrow }}</p><h2>{{ canDecide ? t.heading : t.readOnlyHeading }}</h2>
            <div class="crp-form-grid">
              <div><label for="crp-proof-review-code">{{ t.reservation }}</label><input id="crp-proof-review-code" readonly [value]="'#' + r.id"></div>
              <div><label for="crp-proof-review-customer">{{ t.customer }}</label><input id="crp-proof-review-customer" readonly [value]="r.leadCustomerName"></div>
              <div><label for="crp-proof-review-method">{{ t.modality }}</label><input id="crp-proof-review-method" readonly [value]="modality(r, s.items[0].labels)"></div>
              <div><label for="crp-proof-review-amount">{{ t.amount }}</label><input id="crp-proof-review-amount" name="verifiedAmount" type="text" inputmode="decimal" autocomplete="off"
                  [readonly]="locked" [value]="locked ? money(p.review?.verifiedAmountCents ?? p.amountCents) : amountOf(p)" (input)="amount.set(value($event)); keyFor = null"
                  [attr.aria-invalid]="errors().amount ? 'true' : null" aria-describedby="crp-proof-review-amount-error">
                <p id="crp-proof-review-amount-error" class="crp-payments-error">{{ errors().amount }}</p></div>
              <div><label for="crp-proof-review-status">{{ t.status }}</label><input id="crp-proof-review-status" readonly [value]="common.proofStatus[p.proofStatus]"></div>
              <div class="crp-proof-review-wide"><span>{{ t.proof }}</span><p>{{ p.proofName }}</p></div>
              @if (canDecide) { <div class="crp-proof-review-wide"><label for="crp-proof-review-reason">{{ t.reason }}</label>
                <textarea id="crp-proof-review-reason" name="reason" required [disabled]="locked" [placeholder]="t.reasonPlaceholder" (input)="reason.set(value($event)); keyFor = null"
                  [attr.aria-invalid]="errors().reason ? 'true' : null" aria-describedby="crp-proof-review-reason-error"></textarea>
                <p id="crp-proof-review-reason-error" class="crp-payments-error">{{ errors().reason }}</p></div> }
            </div>
          </section>
          <p role="status">{{ feedback(p) }}</p>
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
  private readonly source = inject(ReservationsSource); private readonly methods = inject(PaymentMethodsSource);
  private readonly writer = inject(ProofReviewWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly canDecide = inject(PortalCapabilities).canDecideProof();
  protected readonly t = PROOF_REVIEW_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly money = formatCop; protected readonly modality = modalityOf;
  protected readonly amount = signal<string | null>(null); protected readonly reason = signal(''); protected readonly errors = signal<{ amount?: string; reason?: string }>({});
  protected readonly pending = signal(false); private readonly done = signal<Decision | null>(null); private readonly refused = signal('');
  /** One key per intention: a retry of the same decision reuses it; an edit (keyFor = null) or the other decision takes a new one. */
  private key = ''; protected keyFor: Decision | null = null; private readonly requests = new Subject<void>();
  private readonly loaded = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => defer(() => forkJoin({ all: this.source.list(), labels: paymentLabels(this.methods) })).pipe(
    map(({ all, labels }): State => {
      const reservation = all.find((r) => r.id === this.params['reservation']), payment = reservation?.payments?.find((p) => p.id === this.params['payment']);
      return reservation && payment ? { kind: 'data', items: [{ reservation, payment, labels }] } : { kind: 'empty' };
    }),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  /** The reservation as the writer answered it; the newest answer wins over the list. */
  private readonly saved = signal<Reservation | null>(null);
  protected readonly state = computed((): State => {
    const s = this.loaded(), saved = this.saved(), payment = s.kind === 'data' && saved?.payments?.find((p) => p.id === s.items[0].payment.id);
    return s.kind === 'data' && saved && payment ? { kind: 'data', items: [{ ...s.items[0], reservation: saved, payment }] } : s;
  });

  protected amountOf(p: ReservationPayment): string { return this.amount() ?? formatMoney(p.amountCents).replace(/\.00$/, ''); }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }

  protected feedback(p: ReservationPayment): string {
    const done = this.done();
    return done ? (done === 'APROBADO' ? this.t.approved : this.t.rejected) : !this.canDecide ? this.t.readOnly
      : p.proofStatus !== 'EN_VALIDACION' ? this.t.decided(p.proofStatus === 'APROBADO') : this.refused() || this.t.hint;
  }
  protected decide(r: Reservation, p: ReservationPayment, decision: Decision): void {
    if (this.pending() || this.done() || !this.canDecide) return;
    const reason = this.reason().trim(), parsed = parseMoney(this.amountOf(p)), cents = parsed.kind === 'valid' ? parsed.minorUnits : 0;
    const errors = { reason: reason ? undefined : this.t.reasonRequired, amount: decision === 'RECHAZADO' || cents > 0 ? undefined : this.common.amountRequired };
    this.errors.set(errors);
    if (errors.reason || errors.amount) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    if (this.keyFor !== decision) { this.key = this.keys.generate(); this.keyFor = decision; }
    this.pending.set(true); this.refused.set('');
    this.writer.decide({ reservationId: r.id, paymentId: p.id, decision, verifiedAmountCents: decision === 'APROBADO' ? cents : 0, reason }, this.key).subscribe({
      next: (saved) => { this.saved.set(saved); this.done.set(decision); this.pending.set(false); },
      error: (e: { userMessage?: string }) => { this.refused.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
  protected back(): void { this.navigation?.open('payments'); }
}

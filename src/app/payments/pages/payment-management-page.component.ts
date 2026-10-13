import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { FINANCIAL_LABEL, Reservation, ReservationsSource, STATUS_CLASS, STATUS_LABEL } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { parseMoney } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PAYMENT_MANAGEMENT_ACTIONS, PortalSlotOutlet } from '../../shared/portal-slots';
import { PaymentLabels, modalityOf, paymentLabels } from '../components/reservation-payments-block.component';
import { PaymentsWriter } from '../data/payments-writer';
import { proofProblem } from '../model/payment';
import { PAYMENTS_TEXT } from '../payments-copy';

type State = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; reservation: Reservation; labels: PaymentLabels };

/** Screen 13 (admin-gestion-pago.html), a sub-screen of Reservas opened from 10A or 10C with { reservation }. Validating is HU-COM-010. */
@Component({
  selector: 'app-payment-management-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ text.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ text.title }}</h1></div></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" class="crp-operator-outline" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <div role="status" data-state="empty"><p>{{ text.notFound }}</p><button type="button" class="crp-operator-outline" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('data') {
        @let r = s.reservation; @let last = r.payments?.at(-1); @let kind = kindOf(r);
        <div data-state="data">
          <section class="crp-operator-panel crp-payments-hero"><div><p class="crp-operator-eyebrow">{{ text.reservation }}</p><h2>#{{ r.id }}</h2></div>
            <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span></section>
          <div class="crp-payments-grid">
            <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.infoEyebrow }}</p><h2>{{ r.leadCustomerName }}</h2>
              <dl class="crp-payments-list"><div><dt>{{ text.modality }}</dt><dd>{{ modality(r, s.labels) }}</dd></div>
                <div><dt>{{ text.proofState }}</dt><dd>{{ last ? text.proofStatus[last.proofStatus] : text.noProof }}</dd></div>
                <div><dt>{{ text.financial }}</dt><dd>{{ financial[r.financialStatus] }}</dd></div></dl></article>
            <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ text.economyEyebrow }}</p><h2>{{ money(r.balanceCents) }}</h2>
              <dl class="crp-payments-list"><div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ text.balance }}</dt><dd>{{ money(r.balanceCents) }}</dd></div></dl></article>
          </div>
          <section class="crp-operator-panel crp-payments-action"><p class="crp-operator-eyebrow">{{ text.actionEyebrow }}</p><h2>{{ text.actionTitle }}</h2><p>{{ text.actionCopy }}</p>
            @if (canRegister) {
              <form class="crp-payments-form" novalidate (submit)="$event.preventDefault(); send(r)">
                <label for="crp-payments-amount">{{ text.amount }}</label>
                <input id="crp-payments-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" [value]="amount()" [disabled]="!kind"
                  [placeholder]="kind === 'partial' ? text.partialAmount : text.amount" (input)="edit({ amount: $any($event.target).value })"
                  [attr.aria-invalid]="errors().amount ? 'true' : null" aria-describedby="crp-payments-amount-error" />
                <p id="crp-payments-amount-error" class="crp-payments-error">{{ errors().amount }}</p>
                @if (kind === 'transfer') {
                  <label for="crp-payments-proof">{{ text.proof }}</label>
                  <input id="crp-payments-proof" name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="edit({ proof: $any($event.target).files?.[0] ?? null })"
                    [attr.aria-invalid]="errors().proof ? 'true' : null" aria-describedby="crp-payments-proof-error" />
                  <p id="crp-payments-proof-error" class="crp-payments-error">{{ errors().proof }}</p>
                }
                @if (refused()) { <p role="alert" class="crp-payments-feedback">{{ refused() }}</p> }
                @else if (!kind) { <p role="status" class="crp-payments-feedback">{{ text.noModalityFeedback }}</p> }
                @else if (done()) { <p role="status" class="crp-payments-feedback">{{ kind === 'transfer' ? text.registered.transfer : text.registered.cash }}</p> }
                <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back(r)">{{ text.back }}</button>
                  <button type="submit" class="crp-operator-primary" [disabled]="pending() || !kind">{{ kind ? text.submit[kind] : text.submit.total }}</button></div>
              </form>
            } @else { <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back(r)">{{ text.back }}</button></div> }
            <ng-container *crpSlot="actions; inputs: { reservation: r }" />
            @if (r.payments?.length) {
              <ul class="crp-payments-lines">@for (p of r.payments; track p.id) {
                <li>{{ money(p.amountCents) }} · {{ s.labels[p.method] }} · {{ text.proofStatus[p.proofStatus] }} · {{ text.registeredBy }} {{ p.registeredBy }}</li> }</ul>
            }
          </section>
        </div>
      }
    }
  `,
})
export class PaymentManagementPageComponent {
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly id = this.navigation?.params()['reservation'];
  private readonly source = inject(ReservationsSource); private readonly methods = inject(PaymentMethodsSource);
  private readonly writer = inject(PaymentsWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly canRegister = inject(PortalCapabilities).canRegisterPayment();
  protected readonly text = PAYMENTS_TEXT;
  protected readonly actions = PAYMENT_MANAGEMENT_ACTIONS;
  protected readonly status = STATUS_LABEL; protected readonly badge = STATUS_CLASS; protected readonly financial = FINANCIAL_LABEL;
  protected readonly money = formatCop; protected readonly modality = modalityOf;
  protected readonly amount = signal('');
  private proof: File | null = null; private key = this.keys.generate();
  protected readonly errors = signal<{ amount?: string; proof?: string }>({});
  protected readonly pending = signal(false); protected readonly done = signal(false); protected readonly refused = signal('');
  private readonly requests = new Subject<void>();
  private readonly loaded = toSignal(this.requests.pipe(switchMap(() => defer(() => forkJoin({ all: this.source.list(), labels: paymentLabels(this.methods) })).pipe(
    map(({ all, labels }): State => { const reservation = all.find((r) => r.id === this.id); return reservation ? { kind: 'data', reservation, labels } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error' })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  /** The reservation as the writer answered it; the newest answer wins over the list. */
  private readonly saved = signal<Reservation | null>(null);
  protected readonly state = computed((): State => { const s = this.loaded(), saved = this.saved(); return s.kind === 'data' && saved ? { ...s, reservation: saved } : s; });

  constructor() { this.reload(); }
  protected reload(): void { this.saved.set(null); this.requests.next(); }

  /** The form of 13 follows the reservation's modality (DP-PY3); none means nothing can be registered. */
  protected kindOf(r: Reservation): 'transfer' | 'partial' | 'total' | null {
    return !r.paymentMethod ? null : r.paymentMethod === 'BANK_TRANSFER' ? 'transfer' : r.paymentType === 'PARTIAL' ? 'partial' : 'total';
  }

  /** A changed amount or proof is a new intention, with a new key; a retry of the same one reuses it (AC-PY.11). */
  protected edit(change: { amount?: string; proof?: File | null }): void {
    if (change.amount !== undefined) this.amount.set(change.amount);
    if (change.proof !== undefined) this.proof = change.proof;
    this.key = this.keys.generate();
  }

  protected send(r: Reservation): void {
    const kind = this.kindOf(r);
    if (this.pending() || !kind) return;
    const parsed = parseMoney(this.amount()), amountCents = parsed.kind === 'valid' ? parsed.minorUnits : 0;
    const errors = {
      amount: amountCents > 0 ? undefined : this.text.amountRequired,
      proof: kind !== 'transfer' ? undefined : this.proof ? proofProblem(this.proof) ?? undefined : this.text.proofRequired,
    };
    this.errors.set(errors);
    if (errors.amount || errors.proof) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    this.pending.set(true); this.refused.set(''); this.done.set(false);
    this.writer.register({ reservationId: r.id, amountCents, proof: kind === 'transfer' ? this.proof : null }, this.key).subscribe({
      next: (saved) => { this.saved.set(saved); this.done.set(true); this.pending.set(false); },
      error: (e: { userMessage?: string }) => { this.refused.set(e?.userMessage || this.text.failed); this.pending.set(false); },
    });
  }

  /** "Volver a la reserva": Reservas opens the detail (10A) of this reservation. */
  protected back(r: Reservation): void { this.navigation?.open('reservations', { reservation: r.id }); }
}

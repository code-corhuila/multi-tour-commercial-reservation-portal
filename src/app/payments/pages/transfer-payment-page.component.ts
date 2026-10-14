import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { FINANCIAL_LABEL } from '../../reservations/data/reservations-source';
import { MyReservationsSource } from '../../self-service-reservation/data/my-reservations-source';
import { BankAccount, CustomerReservation, PaymentMethodsSource, reservationState } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { TRANSFER_PAYMENT_LINES, PortalSlotOutlet } from '../../shared/portal-slots';
import { PaymentsWriter } from '../data/payments-writer';
import { proofProblem } from '../model/payment';
import { CUSTOMER_PAYMENT_TEXT, PAYMENTS_TEXT } from '../payments-copy';

type State = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; reservation: CustomerReservation; bank: BankAccount };

/** Screen 24 (pago-transferencia.html), opened by Continuar al pago of 21 with { reservation, type, amount }; only the customer's own reservation. */
@Component({
  selector: 'app-transfer-payment-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <form class="crp-transfer" novalidate (submit)="$event.preventDefault(); send()">
      <header class="crp-booking-topbar"><span></span><h1>{{ text.title }}</h1><span></span></header>
      <div class="crp-finish-content">
        @let s = state();
        @switch (s.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error">{{ common.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ common.retry }}</button></div> }
          @case ('empty') { <div role="status" data-state="empty"><p>{{ text.none }}</p><button type="button" class="crp-outline" (click)="reload()">{{ common.retry }}</button></div> }
          @case ('data') {
            @let r = s.reservation;
            <div class="crp-transfer-content" data-state="data">
              <article class="crp-booking-card crp-transfer-alert"><strong>{{ text.reservation }} {{ badge(r.reservationStatus) }}</strong><p>{{ text.alert }}</p></article>
              <article class="crp-booking-card"><h2>{{ text.bankTitle }}</h2>
                <dl class="crp-transfer-bank"><div><dt>{{ text.bank }}</dt><dd>{{ s.bank.bank }}</dd></div><div><dt>{{ text.accountType }}</dt><dd>{{ s.bank.accountType }}</dd></div>
                  <div><dt>{{ text.accountNumber }}</dt><dd>{{ s.bank.accountNumber }}</dd></div><div><dt>{{ text.holder }}</dt><dd>{{ s.bank.holder }}</dd></div></dl></article>
              <article class="crp-booking-card crp-transfer-proof"><h2>{{ text.proofTitle }}</h2>
                <p>{{ text.reference }} <strong>#{{ r.reservationId }}</strong></p>
                <label for="crp-transfer-proof">{{ text.proof }}</label>
                <input id="crp-transfer-proof" name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="choose($any($event.target).files?.[0] ?? null)"
                  [attr.aria-invalid]="invalid() ? 'true' : null" aria-describedby="crp-transfer-proof-feedback" />
                <p><strong>{{ text.proofState }}</strong> {{ common.proofStatus[r.proofStatus ?? ''] ?? common.noProof }}<br />
                  <strong>{{ text.financial }}</strong> {{ financial[r.paymentStatus] }}</p>
                <p id="crp-transfer-proof-feedback" aria-live="polite">{{ feedback() }}</p>
                @if (refused()) { <p role="alert">{{ refused() }}</p> }
                <ng-container *crpSlot="lines; inputs: { reservationId: r.reservationId }" />
              </article>
              <div class="crp-form-actions"><button type="submit" class="crp-primary" [disabled]="pending()">{{ text.send }}</button>
                <button type="button" class="crp-outline" (click)="navigation?.open(panel)">{{ text.panel }}</button></div>
            </div>
          }
        }
      </div>
    </form>
  `,
})
export class TransferPaymentPageComponent {
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly params = this.navigation?.params() ?? {};
  private readonly mine = inject(MyReservationsSource); private readonly methods = inject(PaymentMethodsSource);
  private readonly writer = inject(PaymentsWriter); private readonly keys = inject(IdempotencyKeys);
  protected readonly text = CUSTOMER_PAYMENT_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly financial: Readonly<Record<string, string>> = FINANCIAL_LABEL;
  protected readonly lines = TRANSFER_PAYMENT_LINES; protected readonly panel = CLIENT_AREA.panel;
  protected readonly feedback = signal(''); protected readonly invalid = signal(false);
  protected readonly pending = signal(false); protected readonly refused = signal('');
  private proof: File | null = null; private key = this.keys.generate();
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(switchMap(() => defer(() => forkJoin({ all: this.mine.listMine(), bank: this.methods.bankAccount() })).pipe(
    map(({ all, bank }): State => { const reservation = all.find((r) => r.reservationId === this.params['reservation']); return reservation ? { kind: 'data', reservation, bank } : { kind: 'empty' }; }),
    catchError(() => of<State>({ kind: 'error' })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  constructor() { this.reload(); }
  protected reload(): void { this.requests.next(); }
  protected badge(code: string): string { return reservationState(code)[0]; }

  /** RN-PY3: checked when chosen, with the messages of the mockup; a new file is a new intention (AC-PY.11). */
  protected choose(file: File | null): boolean {
    if (file !== this.proof) { this.proof = file; this.key = this.keys.generate(); }
    const problem = file ? proofProblem(file) : this.text.chooseProof;
    this.feedback.set(problem ?? this.text.validProof); this.invalid.set(!!problem);
    return !problem;
  }

  protected send(): void {
    const s = this.state();
    if (this.pending() || s.kind !== 'data' || !this.choose(this.proof)) return;
    this.pending.set(true); this.refused.set('');
    const command = { reservationId: s.reservation.reservationId, amountCents: Number(this.params['amount']), proof: this.proof, paymentType: this.params['type'] };
    this.writer.register(command, this.key).subscribe({
      next: () => { this.pending.set(false); this.navigation?.open(CLIENT_AREA.panel); },
      error: (e: { userMessage?: string }) => { this.refused.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
}

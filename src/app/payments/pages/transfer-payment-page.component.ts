import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { departureLine, formatCop } from '../../shared/format';
import { FINANCIAL_LABEL } from '../../reservations/data/reservations-source';
import { MyReservationsSource } from '../../self-service-reservation/data/my-reservations-source';
import { BankAccount, CustomerReservation, PaymentMethodsSource, reservationState } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { TRANSFER_PAYMENT_LINES, PortalSlotOutlet } from '../../shared/portal-slots';
import { PaymentsWriter } from '../data/payments-writer';
import { proofProblem } from '../model/payment';
import { PAYMENT_RESULT_AREA } from '../payment-result-copy';
import { CUSTOMER_PAYMENT_TEXT, PAYMENTS_TEXT, viajeros } from '../payments-copy';

type State = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; reservation: CustomerReservation; bank: BankAccount };

/** Screen 24 (pago-transferencia.html), opened by Continuar al pago of 21 with { reservation, type, amount }; only the customer's own reservation. */
@Component({
  selector: 'app-transfer-payment-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, PortalSlotOutlet],
  template: `
    <form class="crp-transfer" novalidate (submit)="$event.preventDefault(); send()">
      <header class="crp-booking-topbar"><button type="button" class="crp-booking-back" (click)="navigation?.open(reservations)"><span aria-hidden="true">←</span>&ngsp;<span>{{ text.panel }}</span></button><h1>{{ text.title }}</h1><span></span></header>
      <div class="crp-finish-content">
        @let s = state();
        @switch (s.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="common.failed" />&ngsp;<button type="button" class="crp-outline" (click)="reload()">{{ common.retry }}</button></div> }
          @case ('empty') { <div role="status" data-state="empty"><p>{{ text.none }}</p><button type="button" class="crp-outline" (click)="reload()">{{ common.retry }}</button></div> }
          @case ('data') {
            @let r = s.reservation;
            <div class="crp-transfer-content" data-state="data">
              <article class="crp-booking-card crp-transfer-alert"><strong>{{ text.reservation }} {{ badge(r.reservationStatus) }}</strong><p>{{ text.alert }}</p></article>
              <article class="crp-booking-card"><h2>{{ text.yourReservation }}</h2>
                <div class="crp-transfer-summary"><div><span>{{ text.reservation }}</span>&ngsp;<strong>#{{ r.reservationId }}</strong></div><div><span>{{ text.tour }}</span>&ngsp;<strong>{{ r.tourName }}</strong></div>
                  <div><span>{{ text.departure }}</span>&ngsp;<strong>{{ departure(r.departureAt) }}</strong></div><div><span>{{ text.travelers }}</span>&ngsp;<strong>{{ travelers(r.people) }}</strong></div>
                  <div><span>{{ text.typeAndMethod }}</span>&ngsp;<strong>{{ typeName }}{{ text.transferMethod }}</strong></div><div><span>{{ text.toTransfer }}</span>&ngsp;<strong>{{ cop(amount) }}</strong></div></div></article>
              <article class="crp-booking-card"><h2>{{ text.bankTitle }}</h2>
                <dl class="crp-transfer-bank"><div><dt>{{ text.bank }}</dt><dd>{{ s.bank.bank }}</dd></div><div><dt>{{ text.accountType }}</dt><dd>{{ s.bank.accountType }}</dd></div>
                  <div><dt>{{ text.accountNumber }}</dt><dd>{{ s.bank.accountNumber }}</dd></div><div><dt>{{ text.holder }}</dt><dd>{{ s.bank.holder }}</dd></div></dl></article>
              <article class="crp-booking-card crp-transfer-proof"><h2>{{ text.proofTitle }}</h2>
                <label for="crp-transfer-proof">{{ text.proof }}</label>
                <input id="crp-transfer-proof" name="proof" type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="choose($any($event.target).files?.[0] ?? null)"
                  [attr.aria-invalid]="invalid() ? 'true' : null" aria-describedby="crp-transfer-proof-feedback" />
                <ng-container *crpSlot="lines; inputs: { reservationId: r.reservationId }" />
                <p><strong>{{ text.proofState }}</strong> {{ common.proofStatus[r.proofStatus ?? ''] ?? common.noProof }}<br />
                  <strong>{{ text.financial }}</strong> {{ financial[r.paymentStatus] }}</p>
                <p id="crp-transfer-proof-feedback" aria-live="polite">{{ feedback() }}</p>
                <p class="self-service-note">{{ text.seatNote }}</p>
                @if (refused()) { <p role="alert">{{ refused() }}</p> }
              </article>
              <div class="crp-form-actions"><button type="submit" class="crp-primary" [disabled]="pending()">{{ text.send }}</button>
                <button type="button" class="crp-outline" (click)="navigation?.open(reservations)">{{ text.panel }}</button></div>
            </div>
          }
        }
      </div>
    </form>
  `,
})
export class TransferPaymentPageComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  private focusFirstErrorOnRender(): void { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); }
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly params = this.navigation?.params() ?? {};
  private readonly mine = inject(MyReservationsSource); private readonly methods = inject(PaymentMethodsSource);
  private readonly writer = inject(PaymentsWriter); private readonly keys = inject(IdempotencyKeys);
  protected readonly text = CUSTOMER_PAYMENT_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly financial: Readonly<Record<string, string>> = FINANCIAL_LABEL;
  protected readonly lines = TRANSFER_PAYMENT_LINES; protected readonly reservations = CLIENT_AREA.reservations;
  protected readonly cop = formatCop; protected readonly departure = departureLine; protected readonly travelers = viajeros;
  protected readonly typeName = CUSTOMER_PAYMENT_TEXT.typeName[this.params['type']] ?? ''; protected readonly amount = Number(this.params['amount']);
  protected readonly feedback = signal(''); protected readonly invalid = signal(false);
  protected readonly pending = signal(false); protected readonly refused = signal('');
  private proof: File | null = null; private key = this.keys.generate();
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(switchMap(() => defer(() => forkJoin({ all: this.mine.listMine(), bank: this.methods.bankAccount() })).pipe(
    map(({ all, bank }): State => { const reservation = all.find((r) => r.reservationId === this.params['reservation']); return reservation ? { kind: 'data', reservation, bank } : { kind: 'empty' }; }),
    catchError((error) => of<State>({ kind: 'error', ...readFailure(error) })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

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
    if (this.pending() || s.kind !== 'data') return;
    if (!this.choose(this.proof)) { this.focusFirstErrorOnRender(); return; }
    if (this.amount === null) { this.refused.set(this.common.amountRequired); return; }
    this.pending.set(true); this.refused.set('');
    const command = { reservationId: s.reservation.reservationId, amountCents: this.amount, proof: this.proof, paymentType: this.params['type'] };
    this.writer.register(command, this.key).subscribe({
      next: () => { this.pending.set(false); if (!this.navigation?.open(PAYMENT_RESULT_AREA.received, { reservation: command.reservationId })) this.navigation?.open(CLIENT_AREA.panel); },
      error: (e: { userMessage?: string }) => { this.refused.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
}

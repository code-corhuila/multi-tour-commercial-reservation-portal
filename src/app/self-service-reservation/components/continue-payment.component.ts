import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, startWith, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { focusFirstError } from '../../shared/focus';
import { CONTINUE_PAYMENT_BLOCKS, PortalSlotOutlet } from '../../shared/portal-slots';
import { departureLine, formatCop } from '../../shared/format';
import { amountWithinBalance, minorUnitsToField } from '../../shared/money';
import { CustomerPaymentSummary, MyPaymentsSource, TRANSFER_PAYMENT_AREA } from '../../my-payments/data/my-payments-source';
import { MY_PAYMENTS_TEXT, labelOf } from '../../my-payments/my-payments-copy';
import { CONTINUE_PAYMENT_TEXT as T, travelers } from '../self-service-copy';

type State = { kind: 'loading' | 'error' } | { kind: 'empty'; why: string } | { kind: 'data'; r: CustomerPaymentSummary };

/** The mockup closes the flow with the reason: not the customer's, Cancelada, or nothing left to pay. */
function stateOf(r: CustomerPaymentSummary | undefined): State {
  if (!r) return { kind: 'empty', why: T.notFound };
  if (r.reservationStatus === 'CANCELLED') return { kind: 'empty', why: T.closed(r.reservationId) };
  return r.balanceCents > 0 ? { kind: 'data', r } : { kind: 'empty', why: T.noBalance(r.reservationId) };
}

/**
 * Screen 21 (finalizar-reserva.html) in its second mode, "completar el pago de una reserva existente" (AC-RS.13, DP-RS9):
 * the validated values and the balance come from the port of Mis pagos; no amount is computed here (pillar 2).
 * Continuar opens screen 24 with the amount typed, in cents.
 */
@Component({
  selector: 'crp-continue-payment', imports: [ReadErrorComponent, PortalSlotOutlet], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    <form class="crp-self-service-confirm" aria-labelledby="crp-continue-title" (submit)="$event.preventDefault(); next()" novalidate>
      <header class="crp-booking-topbar">
        @if (back) { <button type="button" class="crp-booking-back" (click)="back.open(area.reservations)"><span aria-hidden="true">←</span>&ngsp;<span>{{ t.back }}</span></button> } @else { <span></span> }
        <h1 id="crp-continue-title">{{ t.title }}</h1><span></span>
      </header>
      <div class="crp-finish-content">
        @switch (s.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="s" [fallback]="common.failed" /></div> }
          @case ('empty') { <p role="status" data-state="empty">{{ s.why }}</p> }
          @case ('data') {
            @let r = s.r;
            <p class="crp-finish-pill">{{ t.pill }}</p>
            <div class="crp-finish-layout" data-state="data">
              <div class="crp-finish-main">
                <article class="crp-booking-card"><h2>{{ t.paymentCard }}</h2>
                  <p class="crp-self-service-note">{{ t.existingType(label('type', r.paymentType), cop(r.balanceCents)) }}</p>
                  <label for="crp-continue-amount">{{ t.amount }}</label>
                  <input id="crp-continue-amount" name="amount" type="number" min="1" [value]="typed() ?? field(r.balanceCents)" (input)="typed.set($any($event.target).value)"
                    [attr.aria-invalid]="problem() ? 'true' : null" aria-describedby="crp-continue-feedback" />
                  <p class="crp-self-service-note">{{ t.hint(cop(r.balanceCents)) }}</p>
                  <p id="crp-continue-feedback" class="crp-self-service-field-error" aria-live="polite">{{ problem() ? t.invalidAmount(cop(r.balanceCents)) : '' }}</p>
                </article>
                <ng-container *crpSlot="blocks; inputs: { existing: true, reservation: { reservationId: r.reservationId } }" />
              </div>
              <aside class="crp-finish-aside">
                <article class="crp-booking-card crp-self-service-summary"><h2>{{ t.summary }}</h2>
                  <p class="crp-self-service-summary-copy"><strong>{{ r.tourName }}</strong>&ngsp;<span>{{ departure(r.departureAt) }}</span>@if (r.people) { &ngsp;<span>{{ travelers(r.people) }}</span> }</p>
                  <dl class="crp-self-service-pricing">
                    <dt>{{ common.validated }}</dt>&ngsp;<dd>{{ cop(r.validatedCents) }}</dd>
                    <dt>{{ common.balance }}</dt>&ngsp;<dd>{{ cop(r.balanceCents) }}</dd>
                    @if (r.finalValueCents !== undefined) { <dt>{{ common.final }}</dt>&ngsp;<dd class="crp-self-service-total">{{ cop(r.finalValueCents) }}</dd> }
                  </dl>
                </article>
              </aside>
            </div>
          }
        }
      </div>
      @if (s.kind === 'data') {
        <aside class="crp-booking-bar">
          <div class="crp-booking-bar-pricing">
            <div><span>{{ t.barReservation }}</span>&ngsp;<strong>#{{ s.r.reservationId }}</strong></div>
            @if (s.r.finalValueCents !== undefined) { <div><span>{{ t.barTotal }}</span>&ngsp;<strong>{{ cop(s.r.finalValueCents) }}</strong></div> }
          </div>
          <button type="submit" class="crp-primary crp-booking-continue">{{ t.next }}</button>
        </aside>
      }
    </form>
  `,
})
export class ContinuePaymentComponent {
  readonly reservationId = input.required<string>();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  private focusFirstErrorOnRender(): void { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); }
  protected readonly blocks = CONTINUE_PAYMENT_BLOCKS; protected readonly t = T; protected readonly common = MY_PAYMENTS_TEXT; protected readonly label = labelOf;
  protected readonly cop = formatCop; protected readonly departure = departureLine; protected readonly travelers = travelers;
  protected readonly field = minorUnitsToField;
  protected readonly area = CLIENT_AREA;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly back = this.navigation?.has(CLIENT_AREA.reservations) ? this.navigation : null;
  protected readonly typed = signal<string | null>(null);
  protected readonly problem = signal(false);
  private readonly source = inject(MyPaymentsSource);
  protected readonly state = toSignal(toObservable(this.reservationId).pipe(filter(Boolean), switchMap((id) => this.source.listMine().pipe(
    map((all) => stateOf(all.find((x) => x.reservationId === id))),
    catchError((error) => of<State>({ kind: 'error', ...readFailure(error) })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });

  protected next(): void {
    const s = this.state();
    if (s.kind !== 'data') return;
    const amount = amountWithinBalance(this.typed() ?? minorUnitsToField(s.r.balanceCents), s.r.balanceCents);
    this.problem.set(amount === null);
    if (amount === null) { this.focusFirstErrorOnRender(); return; }
    this.navigation?.open(TRANSFER_PAYMENT_AREA, { reservation: s.r.reservationId, ...(s.r.paymentType && { type: s.r.paymentType }), amount: String(amount) });
  }
}

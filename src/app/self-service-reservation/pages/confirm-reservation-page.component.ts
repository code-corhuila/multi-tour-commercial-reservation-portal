import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { formatCop, formatDate } from '../../shared/format';
import { ApiError } from '../../shell-contract';
import { CustomerContext } from '../data/customer-context';
import { PaymentMethodsSource, ReservationRequester, ReservationSelectionSource, SelectionQuoteSource } from '../data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, SELF_SERVICE_TEXT, SelectionQuote, reservationState, travelers } from '../model/self-service-reservation';

type ConfirmState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; methods: readonly PaymentMethod[]; quote: SelectionQuote };

/** HU-COM-008 as finalizar-reserva.html, without the payment terms: the customer confirms the selection made in the offer. */
@Component({
  selector: 'app-confirm-reservation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="self-service-confirm" aria-labelledby="self-service-confirm-title">
      <header class="crp-page-header"><div class="crp-page-header-main">
        <h1 id="self-service-confirm-title" class="crp-page-header-title">{{ text.confirmTitle }}</h1>
      </div></header>
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ selection ? text.noMethods : text.noSelection }}</p> }
        @case ('data') {
          <div class="self-service-checkout" data-state="data">
            <form class="crp-operator-panel" (submit)="$event.preventDefault(); confirm()" novalidate>
              <h2>{{ text.conditionsTitle }}</h2>
              <p class="self-service-note">{{ text.conditionsCopy }}</p>
              @for (consent of consents; track consent.key) {
                <label class="self-service-consent"><input type="checkbox" [name]="consent.key" [checked]="accepted()[consent.key]"
                  (change)="accept(consent.key, $event)" [attr.aria-invalid]="unaccepted() && !accepted()[consent.key] ? 'true' : null"
                  aria-describedby="self-service-consent-error" /> {{ consent.label }}</label>
              }
              <p id="self-service-consent-error" class="self-service-field-error">{{ unaccepted() ? text.mustAccept : '' }}</p>
              <label for="self-service-method">{{ text.method }}</label>
              <select id="self-service-method" name="paymentMethod" [value]="method()" (change)="choose($event)"
                [attr.aria-invalid]="missing() ? 'true' : null" aria-describedby="self-service-method-error">
                <option value="">{{ text.chooseMethod }}</option>
                @for (m of current.methods; track m.code) { <option [value]="m.code">{{ m.label }}</option> }
              </select>
              <p id="self-service-method-error" class="self-service-field-error">{{ missing() ? text.methodMissing : '' }}</p>
              @if (standing === 'OTHER') { <p role="status">{{ text.notCustomer }}</p> }
              @else { <button type="submit" class="crp-operator-primary" [disabled]="pending()">{{ text.confirm }}</button> }
            </form>
            <aside class="crp-operator-panel self-service-summary" aria-labelledby="self-service-summary-title">
              <h2 id="self-service-summary-title">{{ text.summaryTitle }}</h2>
              <p class="self-service-summary-copy"><strong>{{ current.quote.tourName }}</strong>
                <span>{{ date(current.quote.departureAt) }}</span><span>{{ travelers(selection!.people) }}</span></p>
              <dl class="self-service-pricing">
                <dt>{{ text.basePrice }}</dt><dd>{{ cop(current.quote.baseValueCents) }}</dd>
                @if (current.quote.discountCents) { <dt>{{ text.discounts }}</dt><dd>{{ cop(-current.quote.discountCents) }}</dd> }
                <dt>{{ text.final }}</dt><dd class="self-service-total">{{ cop(current.quote.finalValueCents) }}</dd>
              </dl>
            </aside>
          </div>
        }
      }
      @if (asked()) { <p role="status">{{ text.signIn }}</p> }
      @if (refusal()) { <p role="alert">{{ refusal() }}</p> }
      @if (created(); as r) {
        <p role="status" class="self-service-created">{{ text.created }}: <strong>{{ r.reservationId }}</strong> · {{ text.final }}
          {{ cop(r.finalValueCents) }} <span class="crp-operator-status {{ badge(r)[1] }}">{{ badge(r)[0] }}</span></p>
      }
    </section>
  `,
})
export class ConfirmReservationPageComponent {
  protected readonly text = SELF_SERVICE_TEXT;
  protected readonly cop = formatCop;
  protected readonly date = formatDate;
  protected readonly travelers = travelers;
  protected readonly consents = [
    { key: 'conditions', label: SELF_SERVICE_TEXT.acceptConditions },
    { key: 'terms', label: SELF_SERVICE_TEXT.acceptTerms },
  ] as const;
  private readonly customer = inject(CustomerContext);
  protected readonly standing = this.customer.standing;
  protected readonly selection = inject(ReservationSelectionSource).current();
  private readonly methods = inject(PaymentMethodsSource);
  private readonly quotes = inject(SelectionQuoteSource);
  private readonly requester = inject(ReservationRequester);
  private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef);
  /** Plan D-05: one key per intention, made when the confirmation opens and kept across retries. */
  private key = this.keys.generate();
  protected readonly method = signal('');
  protected readonly accepted = signal({ conditions: false, terms: false });
  protected readonly missing = signal(false);
  protected readonly unaccepted = signal(false);
  protected readonly pending = signal(false);
  protected readonly asked = signal(false);
  protected readonly refusal = signal('');
  protected readonly created = signal<CustomerReservation | null>(null);
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => forkJoin({
    methods: this.methods.listEnabled(), quote: this.quotes.quote(this.selection!),
  }).pipe(
    map(({ methods, quote }): ConfirmState => (methods.length ? { kind: 'data', methods, quote } : { kind: 'empty' })),
    catchError(() => of<ConfirmState>({ kind: 'error' })),
    startWith<ConfirmState>({ kind: 'loading' }),
  ))), { initialValue: (this.selection ? { kind: 'loading' } : { kind: 'empty' }) as ConfirmState });

  constructor() { this.reload(); }

  reload(): void { if (this.selection) this.requests.next(); }

  protected badge(reservation: CustomerReservation) { return reservationState(reservation.reservationStatus); }

  protected choose(event: Event): void {
    this.method.set((event.target as HTMLSelectElement).value);
    this.missing.set(false);
  }

  protected accept(key: 'conditions' | 'terms', event: Event): void {
    this.accepted.update((current) => ({ ...current, [key]: (event.target as HTMLInputElement).checked }));
    this.unaccepted.set(false);
  }

  protected confirm(): void {
    const selection = this.selection;
    if (!selection || this.standing === 'OTHER' || this.pending()) return;
    const { conditions, terms } = this.accepted();
    this.missing.set(!this.method());
    this.unaccepted.set(!conditions || !terms);
    if (this.missing() || this.unaccepted()) return;
    if (this.standing === 'NO_SESSION') { this.asked.set(true); this.customer.requestSignIn(); return; }
    this.pending.set(true);
    this.refusal.set('');
    defer(() => this.requester.request(selection, this.method(), this.key)).pipe(
      takeUntilDestroyed(this.lifetime),
      finalize(() => this.pending.set(false)),
    ).subscribe({
      next: (reservation) => { this.created.set(reservation); this.key = this.keys.generate(); },
      error: (error: Partial<ApiError> | null) => this.refusal.set(
        error?.userMessage || (error?.status === 409 ? this.text.noCapacity : this.text.refused)),
    });
  }
}

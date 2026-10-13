import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { formatCop, formatDate } from '../../shared/format';
import { ApiError } from '../../shell-contract';
import { CustomerContext } from '../data/customer-context';
import { PaymentMethodsSource, ReservationRequester, SelectionQuoteSource, injectSelection } from '../data/reservation-confirmation-ports';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { CustomerReservation, PaymentMethod, RESERVATION_FLOW, SELF_SERVICE_TEXT, SelectionQuote, companions, reservationState, travelers } from '../model/self-service-reservation';
import { tourPhoto } from '../../shared/tour-photo';
import { IdempotencyKeys } from '../../shared/idempotency-keys';

type ConfirmState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; methods: readonly PaymentMethod[]; quote: SelectionQuote };

/**
 * HU-COM-008 as finalizar-reserva.html (screen 21), without Método y plazo de pago (payments story): the customer
 * confirms the selection Reservar tour opened it with. The holder fields are drawn but not sent (DP-RS3 open).
 */
@Component({
  selector: 'app-confirm-reservation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = state();
    <form class="self-service-confirm" aria-labelledby="self-service-confirm-title" (submit)="$event.preventDefault(); confirm()" novalidate>
      <header class="crp-booking-topbar">
        @if (back && selection) {
          <button type="button" class="crp-booking-back" (click)="back.open(flow.reserve, { tour: selection.serviceIds[0] })"><span aria-hidden="true">←</span>&ngsp;<span>{{ text.backToReserve }}</span></button>
        } @else { <span></span> }
        <h1 id="self-service-confirm-title">{{ text.confirmTitle }}</h1><span></span>
      </header>
      <div class="crp-finish-content">
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ selection ? text.noMethods : text.noSelection }}</p> }
        @case ('data') {
          <p class="crp-finish-pill">{{ text.pill }}</p>
          <div class="crp-finish-layout" data-state="data">
            <div class="crp-finish-main">
              <article class="crp-booking-card crp-finish-holder"><h2>{{ text.holderTitle }}</h2>
                <div class="crp-finish-grid">@for (field of holder; track field.id) {
                  <div><label [for]="field.id">{{ field.label }}</label><input [id]="field.id" [name]="field.id" [type]="field.type" [placeholder]="field.placeholder" /></div>
                }</div>
              </article>
              <article class="crp-booking-card crp-finish-travelers"><h2>{{ text.travelersTitle }}</h2>&ngsp;<span>{{ companions(selection!.people) }}</span>
                <p class="self-service-note">{{ text.travelersCopy }}</p></article>
              <article class="crp-booking-card crp-finish-conditions"><h2>{{ text.conditionsTitle }}</h2>
                <p class="self-service-note">{{ text.conditionsCopy }}</p>
                <ul>@for (line of text.conditionLines; track line) { <li>{{ line }}</li> }</ul>
                @for (consent of consents; track consent.key) {
                  <label class="self-service-consent"><input type="checkbox" [name]="consent.key" [checked]="accepted()[consent.key]"
                    (change)="accept(consent.key, $event)" [attr.aria-invalid]="unaccepted() && !accepted()[consent.key] ? 'true' : null"
                    aria-describedby="self-service-consent-error" /> {{ consent.label }}</label>
                }
                <p id="self-service-consent-error" class="self-service-field-error">{{ unaccepted() ? text.mustAccept : '' }}</p>
              </article>
              <article class="crp-booking-card"><h2><label for="self-service-method">{{ text.method }}</label></h2>
                <select id="self-service-method" name="paymentMethod" [value]="method()" (change)="choose($event)"
                  [attr.aria-invalid]="missing() ? 'true' : null" aria-describedby="self-service-method-error">
                  <option value="">{{ text.chooseMethod }}</option>
                  @for (m of current.methods; track m.code) { <option [value]="m.code">{{ m.label }}</option> }
                </select>
                <p id="self-service-method-error" class="self-service-field-error">{{ missing() ? text.methodMissing : '' }}</p>
              </article>
              @if (standing === 'OTHER') { <p role="status">{{ text.notCustomer }}</p> }
              @if (asked()) { <p role="status">{{ text.signIn }}</p> }
              @if (refusal()) { <p role="alert">{{ refusal() }}</p> }
              @if (created(); as r) {
                <p role="status" class="self-service-created">{{ text.created }}: <strong>{{ r.reservationId }}</strong> · {{ text.final }}
                  {{ cop(r.finalValueCents) }} <span class="crp-status {{ badge(r)[1] }}">{{ badge(r)[0] }}</span></p>
              }
            </div>
            <aside class="crp-finish-aside">
              <article class="crp-booking-card self-service-summary" aria-labelledby="self-service-summary-title">
                <h2 id="self-service-summary-title">{{ text.summaryTitle }}</h2>
                <div class="crp-finish-summary"><div class="crp-finish-media" aria-hidden="true">@if (photo(selection!.serviceIds[0]); as src) { <img [src]="src" alt="" /> }</div>
                  <p class="self-service-summary-copy"><strong>{{ current.quote.tourName }}</strong>&ngsp;<span>{{ date(current.quote.departureAt) }}</span>&ngsp;<span>{{ travelers(selection!.people) }}</span></p></div>
                <dl class="self-service-pricing">
                  <dt>{{ text.basePrice }}</dt><dd>{{ cop(current.quote.baseValueCents) }}</dd>
                  @if (current.quote.discountCents) { <dt>{{ text.discounts }}</dt><dd>{{ cop(-current.quote.discountCents) }}</dd> }
                  <dt>{{ text.final }}</dt><dd class="self-service-total">{{ cop(current.quote.finalValueCents) }}</dd>
                </dl>
              </article>
              <article class="crp-booking-card crp-finish-help"><h2>{{ text.helpTitle }}</h2>&ngsp;<strong>{{ text.helpLead }}</strong>&ngsp;<span>{{ text.helpCopy }}</span></article>
            </aside>
          </div>
        }
      }
      </div>
      @if (current.kind === 'data') {
        <aside class="crp-booking-bar">
          <div class="crp-booking-bar-pricing">
            <div><span>{{ text.barReservation }}</span>&ngsp;<strong>{{ created()?.reservationId ?? text.draft }}</strong></div>
            <div><span>{{ text.barTotal }}</span>&ngsp;<strong>{{ cop(current.quote.finalValueCents) }}</strong></div>
          </div>
          <div class="crp-booking-bar-selection"><span>{{ text.barSelected }}</span>&ngsp;<strong>{{ date(current.quote.departureAt) }} - {{ travelers(selection!.people) }}</strong></div>
          @if (created()) {
            @if (mine) { <button type="button" class="crp-primary crp-booking-continue" (click)="mine.open(area.reservations)">{{ text.seeMine }}</button> }
          } @else if (standing !== 'OTHER') { <button type="submit" class="crp-primary crp-booking-continue" [disabled]="pending()">{{ text.confirm }}</button> }
        </aside>
      }
    </form>
  `,
})
export class ConfirmReservationPageComponent {
  protected readonly text = SELF_SERVICE_TEXT;
  protected readonly cop = formatCop;
  protected readonly date = formatDate;
  protected readonly travelers = travelers;
  protected readonly companions = companions;
  protected readonly photo = tourPhoto;
  protected readonly flow = RESERVATION_FLOW;
  protected readonly holder = [
    { id: 'crp-holder-name', label: 'Nombre completo', type: 'text', placeholder: 'Nombre completo' },
    { id: 'crp-holder-document', label: 'Documento de identidad', type: 'text', placeholder: 'Documento' },
    { id: 'crp-holder-phone', label: 'Teléfono', type: 'tel', placeholder: 'Teléfono' },
    { id: 'crp-holder-email', label: 'Correo electrónico', type: 'email', placeholder: 'correo@ejemplo.com' },
    { id: 'crp-holder-birthdate', label: 'Fecha de nacimiento', type: 'date', placeholder: '' },
  ] as const;
  /** Volver a fecha y viajeros: only when the shell can open Reservar tour. */
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly back = this.navigation?.has(RESERVATION_FLOW.reserve) ? this.navigation : null;
  /** Ver mis reservas after success: only when the shell can open Mis reservas. */
  protected readonly mine = this.navigation?.has(CLIENT_AREA.reservations) ? this.navigation : null;
  protected readonly area = CLIENT_AREA;
  protected readonly consents = [
    { key: 'conditions', label: SELF_SERVICE_TEXT.acceptConditions },
    { key: 'terms', label: SELF_SERVICE_TEXT.acceptTerms },
  ] as const;
  private readonly customer = inject(CustomerContext);
  protected readonly standing = this.customer.standing;
  protected readonly selection = injectSelection();
  private readonly methods = inject(PaymentMethodsSource);
  private readonly quotes = inject(SelectionQuoteSource);
  private readonly requester = inject(ReservationRequester);
  private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef);
  /** Plan D-05: one key per intention, made when the confirmation opens and kept across retries. */
  private readonly key = this.keys.generate();
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
    if (!selection || this.standing === 'OTHER' || this.pending() || this.created()) return;
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
      // AC-RS.6: the intention is fulfilled; the key is kept and the screen offers no second confirmation.
      next: (reservation) => this.created.set(reservation),
      error: (error: Partial<ApiError> | null) => this.refusal.set(
        error?.userMessage || (error?.status === 409 ? this.text.noCapacity : this.text.refused)),
    });
  }
}

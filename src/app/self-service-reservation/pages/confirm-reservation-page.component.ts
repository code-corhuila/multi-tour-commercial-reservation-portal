import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, map, of, startWith, switchMap } from 'rxjs';
import { IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { formatMoney } from '../../catalog/model/money';
import { ApiError } from '../../shell-contract';
import { CustomerContext } from '../data/customer-context';
import { PaymentMethodsSource, ReservationRequester, ReservationSelectionSource } from '../data/reservation-confirmation-ports';
import { CustomerReservation, PaymentMethod, SELF_SERVICE_TEXT } from '../model/self-service-reservation';

type ConfirmState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; methods: readonly PaymentMethod[] };

/** HU-COM-008: the customer confirms the selection made in the offer. The service creates and checks capacity. */
@Component({
  selector: 'app-confirm-reservation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="self-service-confirm" aria-labelledby="self-service-confirm-title">
      <h2 id="self-service-confirm-title">{{ text.confirmTitle }}</h2>
      @if (selection; as s) {
        <dl class="self-service-selection">
          <dt>{{ text.departure }}</dt><dd>{{ s.departureId }}</dd>
          <dt>{{ text.services }}</dt><dd>{{ s.serviceIds.join(', ') }}</dd>
          <dt>{{ text.people }}</dt><dd>{{ s.people }}</dd>
        </dl>
      }
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ selection ? text.noMethods : text.noSelection }}</p> }
        @case ('data') {
          <form data-state="data" (submit)="$event.preventDefault(); confirm()" novalidate>
            <label for="self-service-method">{{ text.method }}</label>
            <select id="self-service-method" name="paymentMethod" [value]="method()" (change)="choose($event)"
              [attr.aria-invalid]="missing() ? 'true' : null" aria-describedby="self-service-method-error">
              <option value="">{{ text.chooseMethod }}</option>
              @for (m of current.methods; track m.code) { <option [value]="m.code">{{ m.label }}</option> }
            </select>
            <p id="self-service-method-error" class="self-service-field-error">{{ missing() ? text.methodMissing : '' }}</p>
            @if (standing === 'OTHER') { <p role="status">{{ text.notCustomer }}</p> }
            @else { <button type="submit" [disabled]="pending()">{{ text.confirm }}</button> }
          </form>
        }
      }
      @if (asked()) { <p role="status">{{ text.signIn }}</p> }
      @if (refusal()) { <p role="alert">{{ refusal() }}</p> }
      @if (created(); as r) {
        <p role="status" class="self-service-created">{{ text.created }}: <strong>{{ r.reservationId }}</strong>
          · {{ text.projected }} {{ money(r.projectedValueCents) }} · {{ text.final }} {{ money(r.finalValueCents) }}
          · {{ text.status }} {{ r.reservationStatus }} · {{ text.payment }} {{ r.paymentStatus }}</p>
      }
    </section>
  `,
})
export class ConfirmReservationPageComponent {
  protected readonly text = SELF_SERVICE_TEXT;
  protected readonly money = formatMoney;
  private readonly customer = inject(CustomerContext);
  protected readonly standing = this.customer.standing;
  protected readonly selection = inject(ReservationSelectionSource).current();
  private readonly methods = inject(PaymentMethodsSource);
  private readonly requester = inject(ReservationRequester);
  private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef);
  /** Plan D-05: one key per intention, made when the confirmation opens and kept across retries. */
  private key = this.keys.generate();
  protected readonly method = signal('');
  protected readonly missing = signal(false);
  protected readonly pending = signal(false);
  protected readonly asked = signal(false);
  protected readonly refusal = signal('');
  protected readonly created = signal<CustomerReservation | null>(null);
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => this.methods.listEnabled().pipe(
    map((methods): ConfirmState => (methods.length ? { kind: 'data', methods } : { kind: 'empty' })),
    catchError(() => of<ConfirmState>({ kind: 'error' })),
    startWith<ConfirmState>({ kind: 'loading' }),
  ))), { initialValue: (this.selection ? { kind: 'loading' } : { kind: 'empty' }) as ConfirmState });

  constructor() { this.reload(); }

  reload(): void { if (this.selection) this.requests.next(); }

  protected choose(event: Event): void {
    this.method.set((event.target as HTMLSelectElement).value);
    this.missing.set(false);
  }

  protected confirm(): void {
    const selection = this.selection;
    if (!selection || this.standing === 'OTHER' || this.pending()) return;
    if (!this.method()) { this.missing.set(true); return; }
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

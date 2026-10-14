import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, forkJoin, map, of, startWith, switchMap, take } from 'rxjs';
import { CatalogItemsSource, IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { ApiError } from '../../shell-contract';
import { DeparturesSource } from '../data/departures-source';
import { LeadCustomersSource, ReservationDiscounts } from '../data/reservation-integrations';
import { ReservationsWriter } from '../data/reservations-writer';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import {
  Departure, LeadCustomer, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, RESERVATION_TEXT, Reservation, ReservationDraft, ServiceOption,
  capacityMessage, money, openDepartures, peopleOf, seats, validateReservation,
} from '../model/reservation';

type Options = { departures: readonly Departure[]; customers: readonly LeadCustomer[]; services: readonly ServiceOption[] };
type OptionsState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; options: Options };

@Component({
  selector: 'app-reservation-form', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationBreakdownComponent],
  styles: [`.crp-reservation-form { display: block; }
    .crp-reservation-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .crp-reservation-field { display: grid; align-content: start; gap: 4px; } .crp-reservation-field label { margin: 0; }
    fieldset { grid-column: 1 / -1; margin: 0; border: 1px solid #dce8e1; border-radius: 10px; } fieldset label { font-weight: 500; }
    .reservation-error { margin: 0; color: var(--crp-error); font-size: 0.82rem; } .crp-reservation-conditions p { margin: 6px 0 0; }
    .crp-reservation-values { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
    .crp-reservation-values span { display: block; color: #667579; font-size: 0.72rem; font-weight: 800; text-transform: uppercase; }
    .crp-reservation-values strong { font-size: 1.2rem; } .crp-form-actions { margin-top: 22px; }
    .crp-reservation-hero-card { margin: 0 0 16px; } .crp-reservation-hero-card h2 { margin: 4px 0; } .crp-reservation-hint { grid-column: 1 / -1; margin: 0; }
    @media (max-width: 720px) { .crp-reservation-grid, .crp-reservation-values { grid-template-columns: 1fr; } }`],
  template: `
    @let current = state();
    @switch (current.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ text.noDepartures }}</p> }
      @case ('data') { @let o = current.options; @let e = errors(); @let q = preview();         <form class="crp-reservation-form" data-state="data" novalidate (submit)="submit($event, o)">
          <section class="crp-reservation-hero-card"><p class="crp-operator-eyebrow">{{ text.heroEyebrow }}</p><h2>{{ text.heroTitle }}</h2><p>{{ text.heroNote }}</p></section>
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.offerEyebrow02 }}</p><h2>{{ text.offerTitle }}</h2>
            <div class="crp-reservation-grid">
              <div class="crp-reservation-field">
                <label for="reservation-customer">{{ text.customer }}</label>
                <select id="reservation-customer" name="leadCustomerId" (change)="set('leadCustomerId', $event)" [attr.aria-invalid]="e.leadCustomerId ? true : null" [attr.aria-describedby]="e.leadCustomerId ? 'reservation-customer-error' : null">
                  <option value="">{{ text.choose }}</option>
                  @for (c of o.customers; track c.id) { <option [value]="c.id" [selected]="c.id === draft().leadCustomerId">{{ c.fullName }}</option> }
                </select>
                @if (e.leadCustomerId) { <p id="reservation-customer-error" class="reservation-error">{{ e.leadCustomerId }}</p> }
              </div>
              <div class="crp-reservation-field">
                <label for="reservation-service">{{ text.tour }}</label>
                <select id="reservation-service" name="serviceId" (change)="set('serviceId', $event)" [attr.aria-invalid]="e.serviceId ? true : null" [attr.aria-describedby]="e.serviceId ? 'reservation-service-error' : null">
                  <option value="">{{ text.choose }}</option>
                  @for (s of o.services; track s.id) { <option [value]="s.id" [selected]="s.id === draft().serviceId">{{ s.name }} · {{ money(s.rateCents) }} {{ text.perPerson }}</option> }
                </select>
                @if (e.serviceId) { <p id="reservation-service-error" class="reservation-error">{{ e.serviceId }}</p> }
              </div>
              <div class="crp-reservation-field">
                <label for="reservation-departure">{{ text.scheduled }}</label>
                <select id="reservation-departure" name="departureId" [disabled]="!draft().serviceId" (change)="set('departureId', $event)" [attr.aria-invalid]="e.departureId ? true : null" [attr.aria-describedby]="e.departureId ? 'reservation-departure-error' : null">
                  <option value="">{{ text.choose }}</option>
                  @for (d of o.departures; track d.id) { <option [value]="d.id" [selected]="d.id === draft().departureId">{{ d.tourName }} · {{ date(d.date) }} · {{ seatsOf(d) }}</option> }
                </select>
                @if (e.departureId) { <p id="reservation-departure-error" class="reservation-error">{{ e.departureId }}</p> }
              </div>
              <div class="crp-reservation-field">
                <label for="reservation-people">{{ text.people }}</label>
                <input id="reservation-people" name="people" inputmode="numeric" [value]="draft().people" (input)="set('people', $event)" [attr.aria-invalid]="e.people ? true : null" [attr.aria-describedby]="e.people ? 'reservation-people-error' : null">
                @if (e.people) { <p id="reservation-people-error" class="reservation-error">{{ e.people }}</p> }
              </div>
              <div class="crp-reservation-field"><label for="reservation-vehicles">{{ text.vehicles }}</label><input id="reservation-vehicles" readonly [value]="text.vehiclesValue"></div>
              @if (chosen; as dep) { <p class="crp-reservation-hint" aria-live="polite">{{ seatsNote(dep) }}</p> }
            </div>
          </section>
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.payEyebrow }}</p><h2>{{ text.conditionsTitle }}</h2>
            <div class="crp-reservation-grid">
              <div class="crp-reservation-field">
                <label for="reservation-pay-type">{{ text.payType }}</label>
                <select id="reservation-pay-type" name="paymentType" [disabled]="!draft().serviceId" (change)="set('paymentType', $event)" [attr.aria-invalid]="e.paymentType ? true : null" [attr.aria-describedby]="e.paymentType ? 'reservation-pay-type-error' : null">
                  <option value="">{{ text.chooseType }}</option>
                  @for (t of paymentTypes; track t[0]) { <option [value]="t[0]" [selected]="t[0] === draft().paymentType">{{ t[1] }}</option> }
                </select>
                @if (e.paymentType) { <p id="reservation-pay-type-error" class="reservation-error">{{ e.paymentType }}</p> }
              </div>
              <div class="crp-reservation-field">
                <label for="reservation-pay-method">{{ text.payMethod }}</label>
                <select id="reservation-pay-method" name="paymentMethod" [disabled]="!draft().serviceId" (change)="set('paymentMethod', $event)" [attr.aria-invalid]="e.paymentMethod ? true : null" [attr.aria-describedby]="e.paymentMethod ? 'reservation-pay-method-error' : null">
                  <option value="">{{ text.chooseMethod }}</option>
                  @for (m of paymentMethods; track m[0]) { <option [value]="m[0]" [selected]="m[0] === draft().paymentMethod">{{ m[1] }}</option> }
                </select>
                @if (e.paymentMethod) { <p id="reservation-pay-method-error" class="reservation-error">{{ e.paymentMethod }}</p> }
              </div>
            </div>
            <p class="crp-operator-copy" data-payment-note>{{ paymentNote() }}</p>
            <div class="crp-reservation-conditions" data-conditions><strong>{{ text.conditions }}</strong><p>{{ chosen?.conditions ?? text.chooseDeparture }}</p><p>{{ text.noSeat }}</p></div>
            <label><input type="checkbox" name="accepted" [checked]="draft().accepted" (change)="toggleAccepted()"> {{ text.accept }}</label>
            @if (e.accepted) { <p class="reservation-error">{{ e.accepted }}</p> }
          </section>
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.valuesEyebrow }}</p><h2>{{ text.valuesTitle }}</h2><p>{{ text.valuesNote }}</p>
            <div class="crp-reservation-values">
              <div><span>{{ text.projected }}</span><strong>{{ money(q?.projectedCents ?? 0) }}</strong></div>
              <div><span>{{ text.applicable }}</span><strong>{{ money(q ? -q.discountCents : 0) }}</strong></div>
              <div><span>{{ text.final }}</span><strong>{{ money(q?.finalCents ?? 0) }}</strong></div>
            </div>
            @if (q) { <app-reservation-breakdown [quote]="q" /> }
          </section>
          @if (!complete()) { <p class="crp-operator-form-feedback" aria-live="polite">{{ text.feedback }}</p> }
          @if (failure()) { <p role="alert">{{ failure() }}</p> }
          <div class="crp-form-actions">
            <button type="button" class="crp-operator-outline" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
            <button type="submit" class="crp-operator-primary" [disabled]="pending() || !complete()">{{ text.save }}</button>
          </div>
        </form>
      }
    }
  `,
})
export class ReservationFormComponent {
  readonly created = output<Reservation>();
  readonly cancelled = output<void>();
  private readonly departures = inject(DeparturesSource); private readonly customers = inject(LeadCustomersSource);
  private readonly catalog = inject(CatalogItemsSource); private readonly discounts = inject(ReservationDiscounts);
  private readonly writer = inject(ReservationsWriter); private readonly lifetime = inject(DestroyRef);
  /** One key per opening of the form, reused by every retry of this intention (AC-RC.8). */
  private readonly key = inject(IdempotencyKeys).generate();
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly paymentTypes = Object.entries(PAYMENT_TYPE_LABEL);
  protected readonly paymentMethods = Object.entries(PAYMENT_METHOD_LABEL);
  protected readonly seatsOf = (d: Departure) => seats(d.effectiveCapacity);
  protected readonly draft = signal<ReservationDraft>({ leadCustomerId: '', departureId: '', serviceId: '', people: '', paymentType: '', paymentMethod: '', accepted: false });
  protected readonly pending = signal(false); protected readonly failure = signal('');
  private readonly tried = signal(false); private readonly refusedForCapacity = signal('');
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => forkJoin({
    departures: this.departures.list().pipe(take(1)), customers: this.customers.list().pipe(take(1)), items: this.catalog.list().pipe(take(1)),
  }).pipe(
    map(({ departures, customers, items }): OptionsState => {
      const open = openDepartures(departures);
      const services = items.filter((i) => i.catalogStatus === 'ACTIVE').map((i) => ({ id: i.serviceId, name: i.commercialName, rateCents: i.baseRateCents }));
      return open.length ? { kind: 'data', options: { departures: open, customers, services } } : { kind: 'empty' };
    }),
    catchError(() => of<OptionsState>({ kind: 'error' })), startWith<OptionsState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as OptionsState });
  protected readonly errors = computed(() => {
    const current = this.state();
    if (!this.tried() || current.kind !== 'data') return {};
    const errors = validateReservation(this.draft(), current.options.departures.find((d) => d.id === this.draft().departureId));
    return this.refusedForCapacity() && !errors.people ? { ...errors, people: this.refusedForCapacity() } : errors;
  });
  constructor() { this.reload(); }
  reload(): void { this.requests.next(); }
  protected set(field: 'leadCustomerId' | 'serviceId' | 'departureId' | 'people' | 'paymentType' | 'paymentMethod', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.draft.update((d) => ({ ...d, [field]: value }));
  }
  protected toggleAccepted(): void { this.draft.update((d) => ({ ...d, accepted: !d.accepted })); }
  /** The departure on offer the draft points at. */
  protected get chosen(): Departure | undefined {
    const current = this.state();
    return current.kind === 'data' ? current.options.departures.find((x) => x.id === this.draft().departureId) : undefined;
  }
  /** Mockup data-departure-capacity-info: the seats of the departure, or the shortage for the people typed. */
  protected seatsNote(d: Departure): string {
    const people = peopleOf(this.draft().people);
    return people !== null && people > d.effectiveCapacity ? capacityMessage(d) : `Hay ${seats(d.effectiveCapacity)} en la salida seleccionada. El cupo no se garantiza hasta el primer pago.`;
  }
  /** Mockup data-payment-deadline-note: the hours are tenant parameters that no port hands to the portal yet. */
  protected readonly paymentNote = computed(() => {
    const type = this.draft().paymentType;
    return type ? `Plazo inicial de pago (${PAYMENT_TYPE_LABEL[type]}): horas corridas desde la creación de la reserva, con una única ampliación registrada; nunca supera la hora programada de inicio de la salida. La promesa de pago en efectivo no confirma la reserva: se confirma al validar ${type === 'PARTIAL' ? 'el abono mínimo' : 'el 100 % del valor final'}.` : this.text.payNote;
  });
  /** The submit button enables when nothing mandatory is missing (mockup data-register-reservation). */
  protected readonly complete = computed(() => {
    const current = this.state();
    return current.kind === 'data' && !Object.keys(validateReservation(this.draft(), current.options.departures.find((d) => d.id === this.draft().departureId))).length;
  });
  /** What is quoted: a departure on offer, at least one service and a valid number of people; else nothing. */
  private readonly request = computed((): QuoteRequest | null => {
    const current = this.state(), d = this.draft(), people = peopleOf(d.people);
    const departure = current.kind === 'data' ? current.options.departures.find((x) => x.id === d.departureId) : undefined;
    return departure && people !== null && d.serviceId ? { departureId: departure.id, serviceIds: [d.serviceId], people } : null;
  });
  /** 007- H-D7: the quote the source returned for the newest selection; the form adds nothing up. */
  protected readonly preview = toSignal(toObservable(this.request).pipe(
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    switchMap((r) => (r ? this.quotes.quote(r).pipe(catchError(() => of(null))) : of(null))),
  ), { initialValue: null });
  protected submit(event: Event, o: Options): void {
    event.preventDefault();
    if (this.pending()) return;
    this.tried.set(true); this.refusedForCapacity.set(''); this.failure.set('');
    const d = this.draft(), departure = o.departures.find((x) => x.id === d.departureId), q = this.preview(o);
    if (Object.keys(validateReservation(d, departure)).length || !departure || !q) return;
    // 007- H-D8: the command carries no value; the service quotes again and is the authority.
    const command = { leadCustomerId: d.leadCustomerId, departureId: departure.id, serviceIds: [d.serviceId], people: peopleOf(d.people)!, paymentType: d.paymentType, paymentMethod: d.paymentMethod };
    this.pending.set(true);
    defer(() => this.writer.create(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false))).subscribe({
      next: (reservation) => this.created.emit(reservation),
      error: (error: Partial<ApiError> | null) => error?.code === 'insufficient-capacity'
        ? this.refusedForCapacity.set(capacityMessage(departure)) : this.failure.set(error?.userMessage ?? this.text.failed),
    });
  }
}

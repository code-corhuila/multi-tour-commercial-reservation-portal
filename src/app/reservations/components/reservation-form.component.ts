import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, output, signal, ElementRef, Injector, afterNextRender } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { focusFirstError } from '../../shared/focus';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, distinctUntilChanged, finalize, forkJoin, map, of, startWith, switchMap, take } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { formatDate } from '../../shared/format';
import { ApiError, COMMERCIAL_NAME } from '../../shell-contract';
import { ReservationParty } from '../../customers/data/reservation-party';
import { PortalSlotOutlet, RESERVATION_FORM_AFTER_OFFER, RESERVATION_FORM_SECTIONS } from '../../shared/portal-slots';
import { DeparturesSource } from '../data/departures-source';
import { QuoteRequest, ReservationQuoteSource } from '../data/reservation-quote-source';
import { DepartureCapacity } from '../data/departure-capacity';
import { ReservationsWriter } from '../data/reservations-writer';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import {
  Departure, PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL, RESERVATION_TEXT, Reservation, ReservationDraft, ServiceOption,
  money, openDepartures, peopleOf, seats, validateReservation,
} from '../model/reservation';
import { RESERVATION_FORM_TEXT } from '../reservations-copy';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';

type Options = { departures: readonly Departure[]; services: readonly ServiceOption[] };
type OptionsState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; options: Options };

/** Screen 10B: sections 02 and 04 and the calculated values are drawn here; 01 and 03 are contributed by HU-COM-005 through RESERVATION_FORM_SECTIONS. */
@Component({
  selector: 'app-reservation-form', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, ReservationBreakdownComponent, PortalSlotOutlet], providers: [ReservationParty],
  template: `
    @if (commercialName) { <section class="crp-reservations-tenant-context"><span>{{ text.tenantLabel }}</span><strong>{{ commercialName }}</strong><p>{{ text.tenantNote }}</p></section> }
    @let current = state();
    @switch (current.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="current" [fallback]="text.failed" /><button type="button" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ text.noDepartures }}</p> }
      @case ('data') { @let o = current.options; @let e = errors(); @let q = preview();         <form class="crp-reservations-form" data-state="data" novalidate (submit)="submit($event, o)">
          <section class="crp-reservations-intro"><div><p class="crp-operator-eyebrow">{{ text.heroEyebrow }}</p><h2>{{ text.heroTitle }}</h2></div><p>{{ text.heroNote }}</p></section>
          <ng-container *crpSlot="sections; until: afterOffer" />
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.offerEyebrow02 }}</p><h2>{{ text.offerTitle }}</h2>
            <div class="crp-reservations-grid">
              <div class="crp-reservations-field">
                <label for="reservation-service">{{ text.tour }}</label>
                <select id="reservation-service" name="serviceId" (change)="set('serviceId', $event)" [attr.aria-invalid]="e.serviceId ? true : null" [attr.aria-describedby]="e.serviceId ? 'reservation-service-error' : null">
                  <option value="">{{ text.chooseTour }}</option>
                  @for (s of o.services; track s.id) { <option [value]="s.id" [selected]="s.id === draft().serviceId">{{ s.name }}</option> }
                </select>
                @if (e.serviceId) { <p id="reservation-service-error" class="crp-reservations-error">{{ e.serviceId }}</p> }
              </div>
              <div class="crp-reservations-field">
                <label for="reservation-departure">{{ text.scheduled }}</label>
                <select id="reservation-departure" name="departureId" [disabled]="!draft().serviceId" (change)="set('departureId', $event)" [attr.aria-invalid]="e.departureId ? true : null" [attr.aria-describedby]="e.departureId ? 'reservation-departure-error' : null">
                  <option value="">{{ draft().serviceId ? text.chooseScheduled : text.chooseTourFirst }}</option>
                  @for (d of o.departures; track d.id) { <option [value]="d.id" [selected]="d.id === draft().departureId">{{ d.tourName }} · {{ date(d.date) }} · {{ seatsOf(d) }}</option> }
                </select>
                <small data-departure-hint>{{ draft().serviceId ? text.departureHint : text.chooseTourFirst }}</small>
                @if (e.departureId) { <p id="reservation-departure-error" class="crp-reservations-error">{{ e.departureId }}</p> }
              </div>
              <div class="crp-reservations-field">
                <label for="reservation-people">{{ text.people }}</label>
                <input id="reservation-people" name="people" inputmode="numeric" [value]="draft().people" (input)="set('people', $event)" [attr.aria-invalid]="e.people ? true : null" [attr.aria-describedby]="e.people ? 'reservation-people-error' : null">
                @if (e.people) { <p id="reservation-people-error" class="crp-reservations-error">{{ e.people }}</p> }
              </div>
              <div class="crp-reservations-field"><label for="reservation-vehicles">{{ text.vehicles }}</label><input id="reservation-vehicles" readonly [value]="text.vehiclesValue"></div>
              @if (chosen; as dep) { <p class="crp-reservations-hint" aria-live="polite">{{ seatsNote(dep) }}</p> }
            </div>
          </section>
          <ng-container *crpSlot="sections; from: afterOffer" />
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.payEyebrow }}</p><h2>{{ text.conditionsTitle }}</h2>
            <p class="crp-operator-copy">{{ text.payIntro }}</p>
            <div class="crp-reservations-grid">
              <div class="crp-reservations-field">
                <label for="reservation-pay-type">{{ text.payType }}</label>
                <select id="reservation-pay-type" name="paymentType" [disabled]="!draft().serviceId" (change)="set('paymentType', $event)" [attr.aria-invalid]="e.paymentType ? true : null" [attr.aria-describedby]="e.paymentType ? 'reservation-pay-type-error' : null">
                  <option value="">{{ text.chooseType }}</option>
                  @if (draft().serviceId) { @for (t of paymentTypes; track t[0]) { <option [value]="t[0]" [selected]="t[0] === draft().paymentType">{{ t[1] }}</option> } }
                </select>
                @if (e.paymentType) { <p id="reservation-pay-type-error" class="crp-reservations-error">{{ e.paymentType }}</p> }
              </div>
              <div class="crp-reservations-field">
                <label for="reservation-pay-method">{{ text.payMethod }}</label>
                <select id="reservation-pay-method" name="paymentMethod" [disabled]="!draft().serviceId" (change)="set('paymentMethod', $event)" [attr.aria-invalid]="e.paymentMethod ? true : null" [attr.aria-describedby]="e.paymentMethod ? 'reservation-pay-method-error' : null">
                  <option value="">{{ text.chooseMethod }}</option>
                  @if (draft().serviceId) { @for (m of paymentMethods; track m[0]) { <option [value]="m[0]" [selected]="m[0] === draft().paymentMethod">{{ m[1] }}</option> } }
                </select>
                @if (e.paymentMethod) { <p id="reservation-pay-method-error" class="crp-reservations-error">{{ e.paymentMethod }}</p> }
              </div>
            </div>
            <p class="crp-operator-copy" data-payment-note>{{ paymentNote() }}</p>
            <div class="crp-reservations-conditions" data-conditions><strong>{{ text.conditions }}</strong><p>{{ chosen?.conditions ?? (draft().serviceId ? text.chooseDeparture : text.chooseTourConditions) }}</p><p>{{ text.noSeat }}</p></div>
            <label class="crp-reservations-check"><input type="checkbox" name="accepted" [checked]="draft().accepted" (change)="toggleAccepted()"> {{ text.accept }}</label>
            @if (e.accepted) { <p class="crp-reservations-error">{{ e.accepted }}</p> }
          </section>
          <section class="crp-operator-panel crp-reservations-summary">
            <div><p class="crp-operator-eyebrow">{{ text.valuesEyebrow }}</p><h2>{{ text.valuesTitle }}</h2><p>{{ text.valuesNote }}</p></div>
            <div class="crp-reservations-values">
              <div><span>{{ text.projected }}</span><strong>{{ money(q?.projectedCents ?? 0) }}</strong></div>
              <div><span>{{ text.applicable }}</span><strong>{{ money(q ? -q.discountCents : 0) }}</strong></div>
              <div><span>{{ text.final }}</span><strong>{{ money(q?.finalCents ?? 0) }}</strong></div>
            </div>
            @if (q) { <app-reservation-breakdown [quote]="q" /> }
          </section>
          <p class="crp-operator-form-feedback" data-feedback [class.crp-is-valid]="complete()" aria-live="polite">{{ feedback() }}</p>
          @if (failure()) { <p role="alert">{{ failure() }}</p> }
          <div class="crp-form-actions crp-reservations-actions">
            <button type="button" class="crp-operator-outline" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
            <button type="submit" class="crp-operator-primary" [disabled]="pending() || !complete()">{{ text.save }}</button>
          </div>
        </form>
      }
    }
  `,
})
export class ReservationFormComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  private focusFirstErrorOnRender(): void { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); }
  readonly created = output<Reservation>();
  readonly cancelled = output<void>();
  private readonly departures = inject(DeparturesSource); private readonly party = inject(ReservationParty);
  private readonly catalog = inject(CatalogItemsSource); private readonly quotes = inject(ReservationQuoteSource);
  private readonly seatRule = inject(DepartureCapacity);
  private readonly writer = inject(ReservationsWriter); private readonly lifetime = inject(DestroyRef);
  /** The key follows the body: reused by every retry of the same data, new when the person corrects it (AC-RC.8). */
  private readonly intention = new IntentionKey(inject(IdempotencyKeys));
  protected readonly text = RESERVATION_TEXT;
  protected readonly commercialName = inject(COMMERCIAL_NAME);
  protected readonly sections = RESERVATION_FORM_SECTIONS; protected readonly afterOffer = RESERVATION_FORM_AFTER_OFFER;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly paymentTypes = Object.entries(PAYMENT_TYPE_LABEL);
  protected readonly paymentMethods = Object.entries(PAYMENT_METHOD_LABEL);
  protected readonly seatsOf = (d: Departure) => seats(d.effectiveCapacity);
  protected readonly draft = signal<ReservationDraft>({ departureId: '', serviceId: '', people: '4', paymentType: '', paymentMethod: '', accepted: false });
  protected readonly pending = signal(false); protected readonly failure = signal('');
  private readonly tried = signal(false); private readonly refusedForCapacity = signal('');
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => forkJoin({
    departures: this.departures.list().pipe(take(1)), items: this.catalog.list().pipe(take(1)),
  }).pipe(
    map(({ departures, items }): OptionsState => {
      const open = openDepartures(departures);
      const services = items.filter((i) => i.serviceType === 'TOUR' && i.catalogStatus === 'ACTIVE').map((i) => ({ id: i.serviceId, name: i.commercialName, rateCents: i.baseRateCents, highRisk: i.highRisk }));
      return open.length ? { kind: 'data', options: { departures: open, services } } : { kind: 'empty' };
    }),
    catchError((error) => of<OptionsState>({ kind: 'error', ...readFailure(error) })), startWith<OptionsState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as OptionsState });
  protected readonly errors = computed(() => {
    const current = this.state();
    if (!this.tried() || current.kind !== 'data') return {};
    const errors = validateReservation(this.draft(), current.options.departures.find((d) => d.id === this.draft().departureId), this.seatRule);
    return this.refusedForCapacity() && !errors.people ? { ...errors, people: this.refusedForCapacity() } : errors;
  });
  constructor() {
    // The number of travelers decides how many companions section 03 asks for (HU-COM-005); the form only tells it.
    effect(() => this.party.travelers.set(peopleOf(this.draft().people) ?? 0));
    // Whether the chosen tour is high risk decides if block "Requisitos de actividad de riesgo" is asked (HU-COM-005, T-V19-1b); the form only tells it.
    effect(() => { const s = this.state(); this.party.highRisk.set(s.kind === 'data' && !!s.options.services.find((o) => o.id === this.draft().serviceId)?.highRisk); });
    this.reload();
  }
  reload(): void { this.requests.next(); }
  protected set(field: 'serviceId' | 'departureId' | 'people' | 'paymentType' | 'paymentMethod', event: Event): void {
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
    return people !== null && !this.seatRule.fits(d, people) ? this.seatRule.refusal(d) : RESERVATION_FORM_TEXT.seatsNote(seats(d.effectiveCapacity));
  }
  /** Mockup data-payment-deadline-note: the hours are tenant parameters that no port hands to the portal yet. */
  protected readonly paymentNote = computed(() => {
    const type = this.draft().paymentType;
    return type ? RESERVATION_FORM_TEXT.paymentNote(PAYMENT_TYPE_LABEL[type], type === 'PARTIAL') : this.text.payNote;
  });
  /** The submit button enables when nothing mandatory is missing (mockup data-register-reservation). */
  protected readonly complete = computed(() => {
    const current = this.state();
    return current.kind === 'data' && !Object.keys(validateReservation(this.draft(), current.options.departures.find((d) => d.id === this.draft().departureId), this.seatRule)).length && this.party.valid();
  });
  /** Mockup data-reservation-feedback: what is missing first, then that the reservation is ready. */
  protected readonly feedback = computed(() => (!this.draft().serviceId ? this.text.feedbackNoTour : !this.draft().departureId ? this.text.feedbackNoDeparture
    : this.complete() ? this.text.feedbackReady : this.text.feedback));
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
    this.tried.set(true); this.party.attempted.set(true); this.refusedForCapacity.set(''); this.failure.set('');
    const d = this.draft(), departure = o.departures.find((x) => x.id === d.departureId), q = this.preview();
    if (Object.keys(validateReservation(d, departure, this.seatRule)).length || !this.party.valid() || !departure || !q) { this.party.rejected.update((n) => n + 1); this.focusFirstErrorOnRender(); return; }
    // 007- H-D8: the command carries no value; the service quotes again and is the authority.
    const command = { ...this.party.command(), departureId: departure.id, serviceIds: [d.serviceId], people: peopleOf(d.people)!, paymentType: d.paymentType, paymentMethod: d.paymentMethod };
    this.pending.set(true);
    defer(() => this.writer.create(command, this.intention.keyFor(command))).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false))).subscribe({
      next: (reservation) => this.created.emit(reservation),
      error: (error: Partial<ApiError> | null) => error?.code === 'insufficient-capacity'
        ? this.refusedForCapacity.set(this.seatRule.refusal(departure)) : this.failure.set(error?.userMessage ?? this.text.failed),
    });
  }
}

import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, distinctUntilChanged, finalize, forkJoin, map, of, startWith, switchMap, take } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { formatDate } from '../../shared/format';
import { ApiError } from '../../shell-contract';
import { DeparturesSource } from '../data/departures-source';
import { LeadCustomersSource } from '../data/reservation-integrations';
import { QuoteRequest, ReservationQuoteSource } from '../data/reservation-quote-source';
import { ReservationsWriter } from '../data/reservations-writer';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import {
  Departure, LeadCustomer, RESERVATION_TEXT, Reservation, ReservationDraft, ServiceOption,
  capacityMessage, money, openDepartures, peopleOf, validateReservation,
} from '../model/reservation';
import { IdempotencyKeys } from '../../shared/idempotency-keys';

type Options = { departures: readonly Departure[]; customers: readonly LeadCustomer[]; services: readonly ServiceOption[] };
type OptionsState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; options: Options };

/** Screen 10B, sections 02 and 04 and the calculated values; sections 01 and 03 belong to HU-COM-005. */
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
    @media (max-width: 720px) { .crp-reservation-grid, .crp-reservation-values { grid-template-columns: 1fr; } }`],
  template: `
    @let current = state();
    @switch (current.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ text.noDepartures }}</p> }
      @case ('data') { @let o = current.options; @let e = errors(); @let q = preview(); @let chosen = chosenDeparture(o);
        <form class="crp-reservation-form" data-state="data" novalidate (submit)="submit($event, o)">
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.offerEyebrow }}</p><h2>{{ text.offerTitle }}</h2>
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
                <label for="reservation-departure">{{ text.departure }}</label>
                <select id="reservation-departure" name="departureId" (change)="set('departureId', $event)" [attr.aria-invalid]="e.departureId ? true : null" [attr.aria-describedby]="e.departureId ? 'reservation-departure-error' : null">
                  <option value="">{{ text.choose }}</option>
                  @for (d of o.departures; track d.id) { <option [value]="d.id" [selected]="d.id === draft().departureId">{{ d.tourName }} · {{ date(d.date) }}</option> }
                </select>
                @if (e.departureId) { <p id="reservation-departure-error" class="reservation-error">{{ e.departureId }}</p> }
              </div>
              <div class="crp-reservation-field">
                <label for="reservation-people">{{ text.people }}</label>
                <input id="reservation-people" name="people" inputmode="numeric" [value]="draft().people" (input)="set('people', $event)" [attr.aria-invalid]="e.people ? true : null" [attr.aria-describedby]="e.people ? 'reservation-people-error' : null">
                @if (e.people) { <p id="reservation-people-error" class="reservation-error">{{ e.people }}</p> }
              </div>
              <fieldset><legend>{{ text.services }}</legend>
                @for (s of o.services; track s.id) {
                  <label><input type="checkbox" name="serviceIds" [value]="s.id" [checked]="draft().serviceIds.includes(s.id)" (change)="toggle(s.id)"> {{ s.name }} · {{ money(s.rateCents) }} {{ text.perPerson }}</label>
                }
                @if (e.serviceIds) { <p class="reservation-error">{{ e.serviceIds }}</p> }
              </fieldset>
            </div>
          </section>
          <section class="crp-operator-panel">
            <p class="crp-operator-eyebrow">{{ text.conditionsEyebrow }}</p><h2>{{ text.conditionsTitle }}</h2>
            <div class="crp-reservation-conditions" data-conditions><strong>{{ text.conditions }}</strong><p>{{ chosen?.conditions ?? text.chooseDeparture }}</p><p>{{ text.noSeat }}</p></div>
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
          @if (failure()) { <p role="alert">{{ failure() }}</p> }
          <div class="crp-form-actions">
            <button type="button" class="crp-operator-outline" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
            <button type="submit" class="crp-operator-primary" [disabled]="pending()">{{ text.save }}</button>
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
  private readonly catalog = inject(CatalogItemsSource); private readonly quotes = inject(ReservationQuoteSource);
  private readonly writer = inject(ReservationsWriter); private readonly lifetime = inject(DestroyRef);
  /** One key per opening of the form, reused by every retry of this intention (AC-RC.8). */
  private readonly key = inject(IdempotencyKeys).generate();
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly draft = signal<ReservationDraft>({ leadCustomerId: '', departureId: '', serviceIds: [], people: '' });
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
  protected set(field: 'leadCustomerId' | 'departureId' | 'people', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.draft.update((d) => ({ ...d, [field]: value }));
  }
  protected toggle(id: string): void {
    this.draft.update((d) => ({ ...d, serviceIds: d.serviceIds.includes(id) ? d.serviceIds.filter((s) => s !== id) : [...d.serviceIds, id] }));
  }
  protected chosenDeparture(o: Options) { return o.departures.find((x) => x.id === this.draft().departureId); }
  /** What is quoted: a departure on offer, at least one service and a valid number of people; else nothing. */
  private readonly request = computed((): QuoteRequest | null => {
    const current = this.state(), d = this.draft(), people = peopleOf(d.people);
    const departure = current.kind === 'data' ? current.options.departures.find((x) => x.id === d.departureId) : undefined;
    return departure && people !== null && d.serviceIds.length ? { departureId: departure.id, serviceIds: d.serviceIds, people } : null;
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
    const d = this.draft(), departure = o.departures.find((x) => x.id === d.departureId), q = this.preview();
    if (Object.keys(validateReservation(d, departure)).length || !departure || !q) return;
    // 007- H-D8: the command carries no value; the service quotes again and is the authority.
    const command = { leadCustomerId: d.leadCustomerId, departureId: departure.id, serviceIds: d.serviceIds, people: peopleOf(d.people)! };
    this.pending.set(true);
    defer(() => this.writer.create(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false))).subscribe({
      next: (reservation) => this.created.emit(reservation),
      error: (error: Partial<ApiError> | null) => error?.code === 'insufficient-capacity'
        ? this.refusedForCapacity.set(capacityMessage(departure)) : this.failure.set(error?.userMessage ?? this.text.failed),
    });
  }
}

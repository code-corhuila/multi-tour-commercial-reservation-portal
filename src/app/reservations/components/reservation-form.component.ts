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
  Departure, LeadCustomer, RESERVATION_TEXT, Reservation, ReservationDraft, ServiceOption,
  capacityMessage, money, openDepartures, peopleOf, quote, validateReservation,
} from '../model/reservation';

type Options = { departures: readonly Departure[]; customers: readonly LeadCustomer[]; services: readonly ServiceOption[] };
type OptionsState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; options: Options };

@Component({
  selector: 'app-reservation-form', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationBreakdownComponent],
  template: `
    @let current = state();
    @switch (current.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ text.noDepartures }}</p> }
      @case ('data') { @let o = current.options; @let e = errors();
        <form class="reservation-form" data-state="data" novalidate (submit)="submit($event, o)">
          <label for="reservation-customer">{{ text.customer }}</label>
          <select id="reservation-customer" name="leadCustomerId" (change)="set('leadCustomerId', $event)" [attr.aria-describedby]="e.leadCustomerId ? 'reservation-customer-error' : null">
            <option value="">{{ text.choose }}</option>
            @for (c of o.customers; track c.id) { <option [value]="c.id" [selected]="c.id === draft().leadCustomerId">{{ c.fullName }}</option> }
          </select>
          @if (e.leadCustomerId) { <p id="reservation-customer-error" class="reservation-error">{{ e.leadCustomerId }}</p> }
          <label for="reservation-departure">{{ text.departure }}</label>
          <select id="reservation-departure" name="departureId" (change)="set('departureId', $event)" [attr.aria-describedby]="e.departureId ? 'reservation-departure-error' : null">
            <option value="">{{ text.choose }}</option>
            @for (d of o.departures; track d.id) { <option [value]="d.id" [selected]="d.id === draft().departureId">{{ d.tourName }} · {{ d.date }}</option> }
          </select>
          @if (e.departureId) { <p id="reservation-departure-error" class="reservation-error">{{ e.departureId }}</p> }
          <fieldset><legend>{{ text.services }}</legend>
            @for (s of o.services; track s.id) {
              <label><input type="checkbox" name="serviceIds" [value]="s.id" [checked]="draft().serviceIds.includes(s.id)" (change)="toggle(s.id)"> {{ s.name }} · {{ money(s.rateCents) }}</label>
            }
            @if (e.serviceIds) { <p class="reservation-error">{{ e.serviceIds }}</p> }
          </fieldset>
          <label for="reservation-people">{{ text.people }}</label>
          <input id="reservation-people" name="people" inputmode="numeric" [value]="draft().people" (input)="set('people', $event)" [attr.aria-describedby]="e.people ? 'reservation-people-error' : null">
          @if (e.people) { <p id="reservation-people-error" class="reservation-error">{{ e.people }}</p> }
          @if (preview(o); as q) { <app-reservation-breakdown [quote]="q" /> }
          @if (failure()) { <p role="alert">{{ failure() }}</p> }
          <button type="submit" [disabled]="pending()">{{ text.save }}</button>
          <button type="button" [disabled]="pending()" (click)="cancelled.emit()">{{ text.cancel }}</button>
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
  protected preview(o: Options) {
    const d = this.draft(), departure = o.departures.find((x) => x.id === d.departureId), people = peopleOf(d.people);
    const services = o.services.filter((s) => d.serviceIds.includes(s.id));
    return departure && people !== null && services.length ? quote(services, people, departure, (v) => this.discounts.apply(v)) : null;
  }
  protected submit(event: Event, o: Options): void {
    event.preventDefault();
    if (this.pending()) return;
    this.tried.set(true); this.refusedForCapacity.set(''); this.failure.set('');
    const d = this.draft(), departure = o.departures.find((x) => x.id === d.departureId), q = this.preview(o);
    if (Object.keys(validateReservation(d, departure)).length || !departure || !q) return;
    const command = { leadCustomerId: d.leadCustomerId, departureId: departure.id, serviceIds: d.serviceIds, people: peopleOf(d.people)!, quote: q };
    this.pending.set(true);
    defer(() => this.writer.create(command, this.key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false))).subscribe({
      next: (reservation) => this.created.emit(reservation),
      error: (error: Partial<ApiError> | null) => error?.code === 'insufficient-capacity'
        ? this.refusedForCapacity.set(capacityMessage(departure)) : this.failure.set(error?.userMessage ?? this.text.failed),
    });
  }
}

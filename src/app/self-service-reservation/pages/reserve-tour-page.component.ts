import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { CatalogItem } from '../../catalog/data/catalog-api.service';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { DeparturesSource } from '../../reservations/data/departures-source';
import { Departure, hasCapacity, openDepartures } from '../../reservations/data/departures-source';
import { formatCop, formatDate } from '../../shared/format';
import { SelectionQuoteSource } from '../data/reservation-confirmation-ports';
import { RESERVATION_FLOW, RESERVE_TEXT, SELF_SERVICE_TEXT, ReservationSelection, monthLabel, overCapacity, sameTour, travelers } from '../model/self-service-reservation';

type Loaded = { kind: 'loading' | 'error' } | { kind: 'empty'; noTour: boolean }
  | { kind: 'data'; tour: CatalogItem; departures: readonly Departure[]; months: readonly string[] };

/**
 * HU-COM-008 as reservar-tour.html (screen 20): the open departures of the tour, from the DeparturesSource of
 * HU-COM-007, and the number of travelers. The values come from the quote port; the view adds nothing up.
 */
@Component({
  selector: 'app-reserve-tour-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-booking-topbar">
      <button type="button" class="crp-booking-back" (click)="back()"><span aria-hidden="true">←</span>&ngsp;<span>{{ t.back }}</span></button>
      <h1>{{ t.title }}</h1><span></span>
    </header>
    <section class="crp-booking-content">
      @let s = loaded();
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') {
          @if (s.noTour) { <div class="crp-booking-card" data-state="empty"><strong>{{ t.noTour }}</strong><p>{{ t.noTourCopy }}</p></div> }
          @else { <p class="crp-booking-card" data-state="empty">{{ t.noDepartures }}</p> }
        }
        @case ('data') {
          <article class="crp-booking-card" data-state="data">
            <div class="crp-booking-card-head"><h2>{{ s.tour.commercialName }}</h2><span class="crp-booking-price-tag">{{ t.from }} {{ cop(s.tour.baseRateCents) }}</span></div>
            @if (calendar(); as c) {
              <div class="crp-booking-calendar-head">
                <div><strong>{{ c.label }}</strong><span>{{ t.departures }}</span></div>
                <div class="crp-booking-calendar-nav">
                  <button type="button" [attr.aria-label]="t.previous" [disabled]="month() === 0" (click)="month.set(month() - 1)">‹</button>
                  <button type="button" [attr.aria-label]="t.next" [disabled]="month() >= s.months.length - 1" (click)="month.set(month() + 1)">›</button>
                </div>
              </div>
              <div class="crp-booking-weekdays" aria-hidden="true">@for (w of t.weekdays; track $index) { <span>{{ w }}</span> }</div>
              <div class="crp-booking-days">
                @for (x of c.spacers; track $index) { <span class="crp-booking-day-spacer"></span> }
                @for (d of c.days; track d.day) {
                  <button type="button" class="crp-booking-day" [class.crp-is-active]="!!d.departure && d.departure === departure()" [disabled]="!d.departure"
                    [attr.aria-pressed]="d.departure ? d.departure === departure() : null" (click)="chosen.set(d.departure!.id)">{{ d.day }}</button>
                }
              </div>
            }
          </article>
          <article class="crp-booking-note">
            <strong>{{ t.conditionsTitle }}</strong><p>{{ t.conditionsCopy }}</p>
            <details class="crp-booking-conditions"><summary>{{ t.seeConditions }}</summary>
              @if (departure()?.conditions; as conditions) { <ul><li>{{ conditions }}</li></ul> } @else { <p>{{ t.noConditions }}</p> }
            </details>
          </article>
          <article class="crp-booking-card">
            <h2 class="crp-booking-card-title">{{ t.travelersTitle }}</h2>
            <div class="crp-booking-guest-row">
              <p><strong>{{ t.travelers }}</strong>&ngsp;<span>{{ t.travelersCopy }}</span></p>
              <div class="crp-booking-counter">
                <button type="button" [attr.aria-label]="t.fewer" (click)="people.set(Math.max(1, people() - 1))">-</button>
                <strong>{{ people() }}</strong>
                <button type="button" [attr.aria-label]="t.more" (click)="people.set(people() + 1)">+</button>
              </div>
            </div>
            <p class="crp-booking-capacity" [class.crp-is-error]="!fits()" aria-live="polite">{{ capacity() }}</p>
            @if (departure(); as d) { <p class="crp-booking-reference"><strong>{{ t.selected }}</strong> {{ date(d.date) }}. {{ t.singleDeparture }}</p> }
          </article>
        }
      }
    </section>
    <aside class="crp-booking-bar">
      <div class="crp-booking-bar-pricing">
        @let q = quote();
        <div><span>{{ t.projected }}</span>&ngsp;<strong>{{ q ? cop(q.baseValueCents) : '—' }}</strong></div>
        @if (q?.discountCents) { <div><span>{{ t.discount }}</span>&ngsp;<strong>{{ cop(-q!.discountCents) }}</strong></div> }
        <div><span>{{ t.final }}</span>&ngsp;<strong>{{ q ? cop(q.finalValueCents) : '—' }}</strong></div>
      </div>
      <div class="crp-booking-bar-selection"><span>{{ t.selection }}</span>&ngsp;<strong>{{ departure() ? date(departure()!.date) : t.noDate }} - {{ travelers(people()) }}</strong></div>
      <button type="button" class="crp-primary crp-booking-continue" [disabled]="!selection()" (click)="continue()">{{ t.continue }}</button>
    </aside>
  `,
})
export class ReserveTourPageComponent {
  protected readonly t = RESERVE_TEXT;
  protected readonly text = SELF_SERVICE_TEXT;
  protected readonly cop = formatCop;
  protected readonly date = formatDate;
  protected readonly travelers = travelers;
  protected readonly Math = Math;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  /** DP-RS1, 008- H-D10: the tour "Reservar tour" opened this area with; the portal reads no address. */
  private readonly tourId = this.navigation?.params()['tour'] ?? '';
  private readonly catalog = inject(CatalogItemsSource);
  private readonly departures = inject(DeparturesSource);
  private readonly requests = new Subject<void>();
  protected readonly chosen = signal('');
  protected readonly people = signal(1);
  protected readonly month = signal(0);

  readonly loaded = toSignal(this.requests.pipe(switchMap(() => forkJoin({ items: this.catalog.list(), all: this.departures.list() }).pipe(
    map(({ items, all }): Loaded => {
      const tour = items.find((item) => item.serviceId === this.tourId && item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE');
      const departures = tour ? openDepartures(all).filter((d) => sameTour(d.tourName, tour.commercialName)).sort((a, b) => a.date.localeCompare(b.date)) : [];
      if (!tour || !departures.length) return { kind: 'empty', noTour: !tour };
      return { kind: 'data', tour, departures, months: [...new Set(departures.map((d) => d.date.slice(0, 7)))] };
    }),
    catchError(() => of<Loaded>({ kind: 'error' })),
    startWith<Loaded>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as Loaded });

  /** The chosen departure, the first one until the customer picks another. */
  protected readonly departure = computed(() => {
    const s = this.loaded();
    return s.kind === 'data' ? s.departures.find((d) => d.id === this.chosen()) ?? s.departures[0] : undefined;
  });
  protected readonly fits = computed(() => { const d = this.departure(); return !!d && hasCapacity(d, this.people()); });
  protected readonly capacity = computed(() => {
    const d = this.departure();
    return !d ? this.t.chooseDeparture : this.fits() ? this.t.capacityOk : overCapacity(d.effectiveCapacity);
  });
  private readonly current = computed((): ReservationSelection | null => {
    const d = this.departure();
    return d ? { departureId: d.id, serviceIds: [this.tourId], people: this.people() } : null;
  });
  /** What Continuar reserva carries: only a departure with room for the travelers (RN-RES-007, the service checks again). */
  protected readonly selection = computed(() => (this.fits() ? this.current() : null));
  private readonly quotes = inject(SelectionQuoteSource);
  protected readonly quote = toSignal(toObservable(this.current).pipe(switchMap((s) => (s ? this.quotes.quote(s).pipe(catchError(() => of(null))) : of(null)))), { initialValue: null });

  protected readonly calendar = computed(() => {
    const s = this.loaded();
    if (s.kind !== 'data') return null;
    const yearMonth = s.months[Math.min(this.month(), s.months.length - 1)];
    const [year, month] = yearMonth.split('-').map(Number);
    const byDay = new Map(s.departures.filter((d) => d.date.startsWith(yearMonth)).map((d) => [Number(d.date.slice(8, 10)), d]));
    return {
      label: monthLabel(yearMonth),
      spacers: Array.from({ length: new Date(year, month - 1, 1).getDay() }),
      days: Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => ({ day: i + 1, departure: byDay.get(i + 1) })),
    };
  });

  constructor() { this.reload(); }

  reload(): void { this.requests.next(); }

  protected back(): void { this.navigation?.open(CLIENT_AREA.tours, { tour: this.tourId }); }

  protected continue(): void {
    const s = this.selection();
    if (s) this.navigation?.open(RESERVATION_FLOW.finish, { departure: s.departureId, services: s.serviceIds.join(','), people: String(s.people) });
  }
}

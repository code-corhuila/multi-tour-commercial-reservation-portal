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
import { RESERVATION_FLOW, RESERVE_TEXT, SELF_SERVICE_TEXT, ReservationSelection, sameTour, travelers } from '../model/self-service-reservation';

type Loaded = { kind: 'loading' | 'error' } | { kind: 'empty'; noTour: boolean }
  | { kind: 'data'; tour: CatalogItem; departures: readonly Departure[] };

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
            <div class="crp-booking-card-head"><div><h2>{{ s.tour.commercialName }}</h2><p>{{ t.category }}</p></div><span class="crp-booking-price-tag">{{ t.from }} {{ cop(s.tour.baseRateCents) }}</span></div>
            <h3 class="crp-booking-list-title">{{ t.listTitle }}</h3>
            <p class="crp-booking-reference">{{ t.listCopy }}</p>
            <div class="crp-departure-list" role="radiogroup" [attr.aria-label]="t.listTitle">
              @for (d of s.departures; track d.id) {
                <label class="crp-departure-option" [class.crp-is-active]="d === departure()" [class.crp-is-full]="d.effectiveCapacity < 1">
                  <input type="radio" name="departure" [value]="d.id" [checked]="d === departure()" (change)="chosen.set(d.id)" />
                  <strong>{{ date(d.date) }}</strong>&ngsp;<span>{{ d.effectiveCapacity < 1 ? t.full : t.seats(d.effectiveCapacity) }}</span>
                </label>
              }
            </div>
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
            <p class="crp-booking-reference"><strong>{{ t.packageLead }}</strong> {{ t.package }}</p>
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

  readonly loaded = toSignal(this.requests.pipe(switchMap(() => forkJoin({ items: this.catalog.list(), all: this.departures.list() }).pipe(
    map(({ items, all }): Loaded => {
      const tour = items.find((item) => item.serviceId === this.tourId && item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE');
      const departures = tour ? openDepartures(all).filter((d) => sameTour(d.tourName, tour.commercialName)).sort((a, b) => a.date.localeCompare(b.date)) : [];
      if (!tour || !departures.length) return { kind: 'empty', noTour: !tour };
      return { kind: 'data', tour, departures };
    }),
    catchError(() => of<Loaded>({ kind: 'error' })),
    startWith<Loaded>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as Loaded });

  /** The chosen departure, the first one with room until the customer picks another. */
  protected readonly departure = computed(() => {
    const s = this.loaded();
    return s.kind === 'data' ? s.departures.find((d) => d.id === this.chosen()) ?? s.departures.find((d) => d.effectiveCapacity > 0) ?? s.departures[0] : undefined;
  });
  protected readonly fits = computed(() => { const d = this.departure(); return !!d && hasCapacity(d, this.people()); });
  protected readonly capacity = computed(() => {
    const d = this.departure();
    return !d ? '' : d.effectiveCapacity < 1 ? this.t.capacityFull : this.fits() ? this.t.capacityOk(d.effectiveCapacity) : this.t.capacityShort(d.effectiveCapacity, this.people());
  });
  private readonly current = computed((): ReservationSelection | null => {
    const d = this.departure();
    return d ? { departureId: d.id, serviceIds: [this.tourId], people: this.people() } : null;
  });
  /** What Continuar reserva carries: only a departure with room for the travelers (RN-RES-007, the service checks again). */
  protected readonly selection = computed(() => (this.fits() ? this.current() : null));
  private readonly quotes = inject(SelectionQuoteSource);
  protected readonly quote = toSignal(toObservable(this.current).pipe(switchMap((s) => (s ? this.quotes.quote(s).pipe(catchError(() => of(null))) : of(null)))), { initialValue: null });

  constructor() { this.reload(); }

  reload(): void { this.requests.next(); }

  protected back(): void { this.navigation?.open(CLIENT_AREA.tours, { tour: this.tourId }); }

  protected continue(): void {
    const s = this.selection();
    if (s) this.navigation?.open(RESERVATION_FLOW.finish, { departure: s.departureId, services: s.serviceIds.join(','), people: String(s.people) });
  }
}

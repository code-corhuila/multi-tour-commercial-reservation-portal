import { Clock, tenantDay } from '../../shared/clock';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap, throwError } from 'rxjs';
import { DeparturesSource, Departure, openDepartures } from '../../reservations/data/departures-source';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { formatCop, formatDate, formatDateRange, pctOff } from '../../shared/format';
import { PublicOfferSource, TourValueSource } from '../data/public-offer-sources';
import { PublicTour, TourValue } from '../model/public-offer';
import { PUBLIC_OFFER_COPY, matchesSearch, sameName } from '../public-offer-copy';
import { tourPhoto } from '../../shared/tour-photo';

/** The four states of one part of the page (Annex H). */
export type PartState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'data'; readonly items: readonly T[] };

interface PricedTour { readonly tour: PublicTour; readonly value: TourValue; readonly photo: string }

/** Each request replaces the previous one (newest wins); a missing port is a failure, never a crash. */
export function partOf<A, T>(requests: Subject<A>, read: (arg: A) => Observable<readonly T[]>, retry: () => void) {
  return toSignal(requests.pipe(switchMap((arg) => read(arg).pipe(
    map((items): PartState<T> => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
    catchError(() => of<PartState<T>>({ kind: 'error', retry })),
    startWith<PartState<T>>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PartState<T> });
}

/** The open departures a port lists, or null without a port or when it fails: the page then draws no departures. */
function openDeparturesOf(port: DeparturesSource | null): Observable<readonly Departure[] | null> {
  const read: Observable<readonly Departure[] | null> = port ? port.list() : of(null);
  return read.pipe(map((all) => (all ? openDepartures(all) : null)), catchError(() => of(null)));
}

export const unavailable = () => throwError(() => new Error('The container provides no public offer port'));

/** Opens a client area through the shell, or null when the shell cannot show it. */
export function openerOf(key: string): (() => void) | null {
  const navigation = inject(PortalNavigation, { optional: true });
  return navigation?.has(key) ? () => navigation.open(key) : null;
}

/** The key under which HU-COM-008 registers Reservar tour (reservar-tour.html); it reads { tour } from PortalNavigation. */
export const RESERVE_TOUR_AREA = 'reserve';

/** Opens Reservar tour on a tour, or null when the shell cannot show it. */
export function reserverOf(): ((tourId: string) => void) | null {
  const navigation = inject(PortalNavigation, { optional: true });
  return navigation?.has(RESERVE_TOUR_AREA) ? (tourId) => { navigation.open(RESERVE_TOUR_AREA, { tour: tourId }); } : null;
}

/** "Volver al panel cliente", drawn only when the shell can open the panel (HU-COM-008). */
export function backToPanel(): (() => void) | null { return openerOf(CLIENT_AREA.panel); }

/** tours.html and detalle-tour.html. Read-only for everyone (plan D-07): it reads no actor and offers no reservation. */
@Component({
  selector: 'app-public-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chosen(); as priced) {
      <article class="crp-offer-detail" data-part="detail">
        <button type="button" class="crp-offer-back" (click)="chosen.set(null)"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.backToTours }}</span></button>
        <p class="crp-page-header-eyebrow">{{ copy.detailEyebrow }}</p>
        <div class="crp-offer-detail-grid">
          <div>
            <h1 class="crp-page-header-title crp-h1">{{ priced.tour.commercialName }}</h1>
            <h2>{{ copy.validityTitle }}</h2>
            <dl class="crp-offer-facts">
              <div><dt>{{ copy.validity }}</dt>&ngsp;<dd>{{ validity(priced) }}</dd></div>
              @if (priced.tour.transportIncluded) { &ngsp;<div><dt>{{ copy.transport }}</dt>&ngsp;<dd>{{ copy.transportIncluded }}</dd></div> }
            </dl>
            <section class="crp-offer-conditions"><h2>{{ copy.conditionsTitle }}</h2>
              <ul>@for (condition of copy.conditions; track condition) { <li>{{ condition }}</li> }</ul>
            </section>
            @if (departuresOf(priced); as departures) {
              <section class="crp-offer-departures"><h2>{{ copy.departuresTitle }}</h2>
                <p>{{ copy.departuresNote }}</p>
                @if (departures.length) {
                  <ul>@for (departure of departures; track departure.id) { <li><strong>{{ day(departure.date) }}</strong>&ngsp;<span>{{ seats(departure) }}</span></li> }</ul>
                } @else { <p>{{ copy.noDepartures }}</p> }
              </section>
            }
          </div>
          <aside class="crp-offer-summary">
            <p class="crp-offer-summary-eyebrow">{{ copy.summary }}</p>
            <div class="crp-offer-summary-price">
              @if (discounted(priced)) {
                &ngsp;<span class="crp-tour-discount-tag">{{ tag(priced) }}</span>&ngsp;<small>{{ copy.before }} {{ money(priced.value.baseRateCents) }}</small>&ngsp;
              }
              <p class="crp-offer-from">{{ copy.from }}: <span data-value="current">{{ money(priced.value.currentValueCents) }}</span></p>
            </div>&ngsp;
            <dl class="crp-offer-facts"><div><dt>{{ copy.validity }}</dt>&ngsp;<dd>{{ validity(priced) }}</dd></div></dl>
            @if (priced.tour.validity; as range) { <p class="crp-offer-validity">{{ copy.validFrom }} {{ day(range.from) }} {{ copy.validTo }} {{ day(range.to) }}.</p> }
            @if (reserve) { <button type="button" class="crp-primary crp-offer-reserve" [disabled]="!hasSeats(priced)" (click)="reserve(priced.tour.serviceId)">{{ copy.reserve }}</button> }
          </aside>
        </div>
      </article>
    } @else {
      @if (back) { <button type="button" class="crp-offer-back" (click)="back()"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.back }}</span></button> }
      <header class="crp-page-header crp-offer-head">
        <div class="crp-page-header-main">
          <p class="crp-page-header-eyebrow">{{ copy.eyebrow }}</p>
          <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
        </div>
        <div class="crp-page-header-action crp-offer-search">
          <input type="search" [attr.aria-label]="copy.searchTours" [placeholder]="copy.searchToursHint" #query (keydown.enter)="search.set(query.value)" />
          <button type="button" class="crp-primary" (click)="search.set(query.value)">{{ copy.search }}</button>
          <label class="crp-offer-date"><span>{{ copy.date }}</span><input type="date" [value]="date()" (change)="choose($event)" /></label>
        </div>
      </header>
      <section class="crp-offer-section" data-part="tours" [attr.aria-label]="copy.toursList">
        @let tours = toursState();
        @switch (tours.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ copy.loadingTours }}</p> }
          @case ('error') { <div role="alert" data-state="error"><p>{{ copy.requestFailed }}</p><button class="crp-outline" type="button" (click)="tours.retry()">{{ copy.retry }}</button></div> }
          @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
          @case ('data') {
            @let shown = found(tours.items);
            @if (shown.length) {
              <ul class="crp-offer-grid" data-state="data">
              @for (priced of shown; track priced.tour.serviceId) {
                <li class="crp-tour-card">
                  <div class="crp-tour-media">
                    <img [src]="priced.photo" [alt]="priced.tour.commercialName" loading="lazy" />
                    @if (discounted(priced)) { <span class="crp-tour-discount-tag">{{ tag(priced) }}</span> }
                  </div>
                  <div class="crp-tour-body">
                    <strong [title]="priced.tour.commercialName">{{ priced.tour.commercialName }}</strong>
                    <div class="crp-tour-meta">
                      <div class="crp-tour-price">
                        @if (discounted(priced)) { <small>{{ copy.before }} <del data-value="base">{{ money(priced.value.baseRateCents) }}</del></small>&ngsp; }
                        <small>{{ copy.from }}</small>&ngsp;<em data-value="current">{{ money(priced.value.currentValueCents) }}</em>
                      </div>
                      <button type="button" class="crp-outline" (click)="chosen.set(priced)">{{ copy.detail }}</button>
                    </div>
                  </div>
                </li>
              }
              </ul>
            } @else { <p role="status" data-state="empty">{{ copy.empty }}</p> }
          }
        }
      </section>
    }
  `,
})
export class PublicOfferPageComponent {
  protected readonly copy = PUBLIC_OFFER_COPY;
  protected readonly back = backToPanel();
  /** "Reservar tour" opens Reservar tour of HU-COM-008 on the tour, drawn only when the shell has it (AC-PO.7: no form here). */
  protected readonly reserve = reserverOf();
  private readonly offer = inject(PublicOfferSource, { optional: true });
  // TODO(HU-COM-004): provided by current-discounts; without it the base value is the current value.
  private readonly value = inject(TourValueSource, { optional: true });
  protected readonly date = signal(tenantDay(inject(Clock).now()));
  protected readonly search = signal('');
  protected readonly chosen = signal<PricedTour | null>(null);
  private readonly dates = new Subject<string>();
  /** The open departures of HU-COM-007/008, or null where the container has no departures port or it fails (then no section is drawn). */
  private readonly departures = toSignal(openDeparturesOf(inject(DeparturesSource, { optional: true })), { initialValue: null });

  protected readonly toursState = partOf(this.dates, (date) => (this.offer?.listAvailable(date) ?? unavailable()).pipe(
    // RN-PO2: whatever the port answers, what is not available for the date is not listed.
    map((tours) => tours.filter((tour) => tour.available)
      .map((tour): PricedTour => ({ tour, value: this.valueOf(tour, date), photo: tourPhoto(tour.serviceId) ?? '' }))),
  ), () => this.dates.next(this.date()));

  constructor() { this.dates.next(this.date()); }

  protected choose(event: Event): void {
    const chosen = (event.target as HTMLInputElement).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) { return; }
    this.date.set(chosen);
    this.dates.next(chosen);
  }

  protected found(items: readonly PricedTour[]): readonly PricedTour[] {
    return items.filter((priced) => matchesSearch(priced.tour.commercialName, this.search()));
  }

  protected discounted(priced: PricedTour): boolean { return priced.value.currentValueCents !== priced.value.baseRateCents; }

  /** The label of HU-COM-004's value port; without one, N% de descuento from the base and current values, as tours.html writes it. */
  protected tag(priced: PricedTour): string {
    return priced.value.discountLabel ?? this.copy.discountTag(pctOff(priced.value.baseRateCents, priced.value.currentValueCents));
  }

  /** The departures of a tour (the port has no tour id yet, so the name links them), or null when none can be read. */
  protected departuresOf(priced: PricedTour): readonly Departure[] | null {
    return this.departures()?.filter((departure) => sameName(departure.tourName, priced.tour.commercialName)) ?? null;
  }

  /** Without a departures port nothing is known, so the button stays enabled; with one, it needs a departure with seats. */
  protected hasSeats(priced: PricedTour): boolean { return this.departuresOf(priced)?.some((d) => d.effectiveCapacity > 0) ?? true; }

  protected seats(departure: Departure): string {
    return departure.effectiveCapacity > 0 ? this.copy.seatsLeft(departure.effectiveCapacity) : this.copy.departureFull;
  }

  protected money(cents: number): string { return formatCop(cents); }

  protected day(isoDate: string): string { return formatDate(isoDate); }

  /** The validity the offer port declares, or the consulted date when it declares none. */
  protected validity(priced: PricedTour): string {
    const range = priced.tour.validity;
    return range ? formatDateRange(range.from, range.to) : `${this.copy.availableOnDay} ${formatDate(this.date())}`;
  }

  private valueOf(tour: PublicTour, date: string): TourValue {
    return this.value?.valueOf(tour, date) ?? { baseRateCents: tour.baseRateCents, currentValueCents: tour.baseRateCents };
  }
}

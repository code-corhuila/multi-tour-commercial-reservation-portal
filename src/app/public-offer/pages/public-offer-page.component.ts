import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap, throwError } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { formatCop, formatDate } from '../../shared/format';
import { PublicOfferSource, TourValueSource } from '../data/public-offer-sources';
import { PublicTour, TourValue } from '../model/public-offer';
import { PUBLIC_OFFER_COPY, matchesSearch, photoAt } from '../public-offer-copy';

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

export const unavailable = () => throwError(() => new Error('The container provides no public offer port'));

/** "Volver al panel cliente", drawn only when the shell can open the panel (HU-COM-008). */
export function backToPanel(): (() => void) | null {
  const navigation = inject(PortalNavigation, { optional: true });
  return navigation?.has(CLIENT_AREA.panel) ? () => navigation.open(CLIENT_AREA.panel) : null;
}

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
              <div><dt>{{ copy.validity }}</dt>&ngsp;<dd>{{ copy.availableOnDay }} {{ day(date()) }}</dd></div>
              @if (priced.tour.transportIncluded) { &ngsp;<div><dt>{{ copy.transport }}</dt>&ngsp;<dd>{{ copy.transportIncluded }}</dd></div> }
            </dl>
            <section class="crp-offer-conditions"><h2>{{ copy.conditionsTitle }}</h2>
              <ul>@for (condition of copy.conditions; track condition) { <li>{{ condition }}</li> }</ul>
            </section>
          </div>
          <aside class="crp-offer-summary">
            <p class="crp-offer-summary-eyebrow">{{ copy.summary }}</p>
            @if (discounted(priced)) {
              &ngsp;<span class="crp-tour-discount-tag">{{ tag(priced) }}</span>&ngsp;<p>{{ copy.before }} {{ money(priced.value.baseRateCents) }}</p>&ngsp;
            }
            <p class="crp-offer-from">{{ copy.from }}: <span data-value="current">{{ money(priced.value.currentValueCents) }}</span></p>
          </aside>
        </div>
      </article>
    } @else {
      @if (back) { <button type="button" class="crp-offer-back" (click)="back()"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.back }}</span></button> }
      <header class="crp-page-header">
        <div class="crp-page-header-main">
          <p class="crp-page-header-eyebrow">{{ copy.eyebrow }}</p>
          <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
          <p class="crp-page-header-desc">{{ copy.description }}</p>
        </div>
        <div class="crp-page-header-action crp-offer-search">
          <input type="search" [attr.aria-label]="copy.searchTours" [placeholder]="copy.searchTours" #query (keydown.enter)="search.set(query.value)" />
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
                    <strong>{{ priced.tour.commercialName }}</strong>
                    @if (priced.tour.transportIncluded) { <p class="crp-tour-transport">{{ copy.transportIncluded }}</p> }
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
  private readonly offer = inject(PublicOfferSource, { optional: true });
  // TODO(HU-COM-004): provided by current-discounts; without it the base value is the current value.
  private readonly value = inject(TourValueSource, { optional: true });
  protected readonly date = signal(new Date().toLocaleDateString('en-CA'));
  protected readonly search = signal('');
  protected readonly chosen = signal<PricedTour | null>(null);
  private readonly dates = new Subject<string>();

  protected readonly toursState = partOf(this.dates, (date) => (this.offer?.listAvailable(date) ?? unavailable()).pipe(
    // RN-PO2: whatever the port answers, what is not available for the date is not listed.
    map((tours) => tours.filter((tour) => tour.available)
      .map((tour, position): PricedTour => ({ tour, value: this.valueOf(tour, date), photo: photoAt(position) }))),
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

  /** The label of HU-COM-004's value port; without one, a generic tag (RN-PO4: no percentage is derived here). */
  protected tag(priced: PricedTour): string { return priced.value.discountLabel ?? this.copy.discountTag; }

  protected money(cents: number): string { return formatCop(cents); }

  protected day(isoDate: string): string { return formatDate(isoDate); }

  private valueOf(tour: PublicTour, date: string): TourValue {
    return this.value?.valueOf(tour, date) ?? { baseRateCents: tour.baseRateCents, currentValueCents: tour.baseRateCents };
  }
}

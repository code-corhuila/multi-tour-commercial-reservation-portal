import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap, throwError } from 'rxjs';
import { formatMoney } from '../../catalog/model/money';
import { PublicEstablishmentsSource, PublicOfferSource, TourValueSource } from '../data/public-offer-sources';
import { PublicEstablishment, PublicTour, TourValue } from '../model/public-offer';
import { PUBLIC_OFFER_COPY } from '../public-offer-copy';

/** The four states of one part of the page (Annex H). */
export type PartState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'data'; readonly items: readonly T[] };

interface PricedTour { readonly tour: PublicTour; readonly value: TourValue }

/** Each request replaces the previous one (newest wins); a missing port is a failure, never a crash. */
function partOf<A, T>(requests: Subject<A>, read: (arg: A) => Observable<readonly T[]>, retry: () => void) {
  return toSignal(requests.pipe(switchMap((arg) => read(arg).pipe(
    map((items): PartState<T> => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
    catchError(() => of<PartState<T>>({ kind: 'error', retry })),
    startWith<PartState<T>>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PartState<T> });
}

const unavailable = () => throwError(() => new Error('The container provides no public offer port'));

/** Read-only for everyone (plan D-07): it reads no actor and offers no action, so every viewer sees the same. */
@Component({
  selector: 'app-public-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ copy.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
        <p class="crp-page-header-desc">{{ copy.description }}</p>
      </div>
    </header>
    <div class="crp-filters">
      <div>
        <label for="public-offer-date">{{ copy.date }}</label>
        <input id="public-offer-date" type="date" [value]="date()" (change)="choose($event)" />
      </div>
    </div>
    <section class="crp-operator-panel" data-part="tours" [attr.aria-label]="copy.tours">
      <div class="crp-operator-panel-head"><h2>{{ copy.tours }}</h2></div>
      @let tours = toursState();
      @switch (tours.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><p>{{ copy.requestFailed }}</p><button class="crp-outline" type="button" (click)="tours.retry()">{{ copy.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        @case ('data') {
          <ul class="public-offer-cards" data-state="data">
          @for (priced of tours.items; track priced.tour.serviceId) {
            <li class="public-offer-card">
              <h3>{{ priced.tour.commercialName }}</h3>
              <p class="public-offer-value"><strong data-value="current">{{ money(priced.value.currentValueCents) }}</strong>
              @if (priced.value.currentValueCents !== priced.value.baseRateCents) {
                <s data-value="base" [attr.aria-label]="copy.baseValue">{{ money(priced.value.baseRateCents) }}</s>
              }</p>
              @if (priced.tour.transportIncluded) { <p class="public-offer-transport">{{ copy.transportIncluded }}</p> }
            </li>
          }
          </ul>
        }
      }
    </section>
    <section class="crp-operator-panel" data-part="establishments" [attr.aria-label]="copy.establishments">
      <div class="crp-operator-panel-head"><h2>{{ copy.establishments }}</h2></div>
      @let places = placesState();
      @switch (places.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><p>{{ copy.requestFailed }}</p><button class="crp-outline" type="button" (click)="places.retry()">{{ copy.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        @case ('data') {
          <ul class="public-offer-cards" data-state="data">
          @for (place of places.items; track place.establishmentId) {
            <li class="public-offer-card">
              <h3>{{ place.commercialName }}</h3>
              <p class="public-offer-type">{{ copy.types[place.establishmentType] }}</p>
              <p>{{ place.commercialInformation }}</p>
            </li>
          }
          </ul>
        }
      }
    </section>
  `,
})
export class PublicOfferPageComponent {
  protected readonly copy = PUBLIC_OFFER_COPY;
  private readonly offer = inject(PublicOfferSource, { optional: true });
  private readonly establishments = inject(PublicEstablishmentsSource, { optional: true });
  // TODO(HU-COM-004): provided by current-discounts; without it the base value is the current value.
  private readonly value = inject(TourValueSource, { optional: true });
  protected readonly date = signal(new Date().toISOString().slice(0, 10));
  private readonly dates = new Subject<string>();
  private readonly placeRequests = new Subject<void>();

  protected readonly toursState = partOf(this.dates, (date) => (this.offer?.listAvailable(date) ?? unavailable()).pipe(
    // RN-PO2: whatever the port answers, what is not available for the date is not listed.
    map((tours) => tours.filter((tour) => tour.available).map((tour): PricedTour => ({ tour, value: this.valueOf(tour, date) }))),
  ), () => this.dates.next(this.date()));

  protected readonly placesState = partOf(this.placeRequests, () => (this.establishments?.listActive() ?? unavailable()).pipe(
    // RN-PO5: an inactive association never reaches the screen, even if the port returns it.
    map((places) => places.filter((place: PublicEstablishment) => place.active)),
  ), () => this.placeRequests.next());

  constructor() {
    this.dates.next(this.date());
    this.placeRequests.next();
  }

  protected choose(event: Event): void {
    const chosen = (event.target as HTMLInputElement).value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) { return; }
    this.date.set(chosen);
    this.dates.next(chosen);
  }

  protected money(cents: number): string { return formatMoney(cents); }

  private valueOf(tour: PublicTour, date: string): TourValue {
    return this.value?.valueOf(tour, date) ?? { baseRateCents: tour.baseRateCents, currentValueCents: tour.baseRateCents };
  }
}

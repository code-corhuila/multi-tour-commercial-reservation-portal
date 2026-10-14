import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Subject, map } from 'rxjs';
import { PublicEstablishmentsSource } from '../data/public-offer-sources';
import { PublicEstablishment } from '../model/public-offer';
import { establishmentPhoto } from '../../shared/tour-photo';
import { PUBLIC_OFFER_COPY } from '../public-offer-copy';
import { backToPanel, partOf, unavailable } from './public-offer-page.component';

type Shown = PublicEstablishment & { readonly photo: string };

/** alojamiento.html (hotels) or gastronomia.html with the restaurants of restaurantes.html: information and contact only (GAP-04). */
@Component({
  selector: 'app-establishments-offer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let page = copy.pages[kind()];
    @if (back) { <button type="button" class="crp-offer-back" (click)="back()"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.back }}</span></button> }
    <header class="crp-page-header">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ page.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ page.title }}</h1>
        <p class="crp-page-header-desc">{{ page.description }}</p>
      </div>
      @if (page.search) {
        <div class="crp-page-header-action crp-offer-search">
          <input type="search" [attr.aria-label]="page.search" [placeholder]="page.search" #query (keydown.enter)="search.set(query.value)" />
          <button type="button" class="crp-primary" (click)="search.set(query.value)">{{ copy.search }}</button>
        </div>
      }
    </header>
    <section class="crp-offer-agreement">
      <p class="crp-offer-agreement-eyebrow">{{ copy.agreementEyebrow }}</p>&ngsp;<h2>{{ copy.agreementTitle }}</h2>&ngsp;<p>{{ page.agreement }}</p>
    </section>
    <section class="crp-offer-section" data-part="establishments" [attr.aria-label]="page.title">
      @let places = placesState();
      @switch (places.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loadingEstablishments }}</p> }
        @case ('error') { <div role="alert" data-state="error"><p>{{ copy.requestFailed }}</p><button class="crp-outline" type="button" (click)="places.retry()">{{ copy.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        @case ('data') {
          @let shown = found(places.items);
          @if (shown.length) {
            <ul class="crp-offer-grid" data-state="data">
            @for (place of shown; track place.establishmentId) {
              <li class="crp-tour-card">
                <div class="crp-tour-media"><img [src]="place.photo" [alt]="place.commercialName" loading="lazy" /></div>
                <div class="crp-tour-body">
                  <strong>{{ place.commercialName }}</strong>
                  <span class="crp-establishment-type">{{ copy.types[place.establishmentType] }}</span>
                  @if (place.commercialInformation.trim()) { <p class="crp-establishment-contact">{{ copy.contact }} {{ place.commercialInformation }}</p> }
                </div>
              </li>
            }
            </ul>
          } @else { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        }
      }
    </section>
  `,
})
export class EstablishmentsOfferComponent implements OnInit {
  readonly kind = input.required<PublicEstablishment['establishmentType']>();
  protected readonly copy = PUBLIC_OFFER_COPY;
  protected readonly back = backToPanel();
  protected readonly search = signal('');
  private readonly establishments = inject(PublicEstablishmentsSource, { optional: true });
  private readonly requests = new Subject<void>();

  protected readonly placesState = partOf(this.requests, () => (this.establishments?.listActive() ?? unavailable()).pipe(
    // RN-PO5: an inactive association never reaches the screen, even if the port returns it.
    map((places) => places.filter((place) => place.active && place.establishmentType === this.kind())
      .map((place): Shown => ({ ...place, photo: establishmentPhoto(place.establishmentType), lines: contactLines(place) }))),
  ), () => this.requests.next());

  ngOnInit(): void { this.requests.next(); }

  protected found(items: readonly Shown[]): readonly Shown[] {
    return items.filter((place) => matchesSearch(place.commercialName, this.search()));
  }
}

/** The client area Alojamiento (alojamiento.html). */
@Component({
  selector: 'app-lodging-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstablishmentsOfferComponent],
  template: `<app-establishments-offer kind="HOTEL" />`,
})
export class LodgingOfferPageComponent {}

/** The client area Gastronomía (gastronomia.html header, restaurantes.html cards). */
@Component({
  selector: 'app-gastronomy-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstablishmentsOfferComponent],
  template: `<app-establishments-offer kind="RESTAURANT" />`,
})
export class GastronomyOfferPageComponent {}

import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { Subject, map } from 'rxjs';
import { PublicEstablishmentsSource } from '../data/public-offer-sources';
import { PublicEstablishment } from '../model/public-offer';
import { establishmentPhoto } from '../../shared/tour-photo';
import { PUBLIC_OFFER_COPY } from '../public-offer-copy';
import { backToPanel, partOf, unavailable } from './public-offer-page.component';

type Shown = PublicEstablishment & { readonly photo: string; readonly lines: readonly string[] };

/** The contact fields the data has, in the order of the screens: email, phone, address. */
function contactLines({ contact }: PublicEstablishment): readonly string[] {
  return [contact?.email, contact?.phone, contact?.address].filter((line): line is string => !!line?.trim());
}

/** alojamiento.html (hotels) or gastronomia.html (restaurants): associated establishments with their contact, information only (GAP-04). restaurantes.html is orphaned in the mockup and has no entry here. */
@Component({
  selector: 'app-establishments-offer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chosen(); as place) {
      <article class="crp-venue" data-part="venue">
        <div class="crp-venue-top">
          <button type="button" class="crp-offer-back" (click)="chosen.set(null)"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.pages[kind()].back }}</span></button>
          <p class="crp-page-header-eyebrow">{{ copy.types[place.establishmentType] }}</p>
        </div>
        <img class="crp-venue-hero" [src]="place.photo" [alt]="place.commercialName" />
        <h1 class="crp-h1">{{ place.commercialName }}</h1>
        <p class="crp-venue-category">{{ copy.types[place.establishmentType] }}</p>
        <div class="crp-venue-box">
          <p class="crp-venue-info">{{ place.commercialInformation.trim() || copy.venueNoInfo }}</p>
          @if (place.lines.length) {
            <p class="crp-establishment-contact">{{ copy.contact }}&ngsp;@for (line of place.lines; track $index) { <span>{{ line }}</span>&ngsp; }</p>
          }
          <div class="crp-venue-contact"><h2>{{ copy.venueTitle }}</h2>&ngsp;<p>{{ copy.venueCoordinate }}</p>&ngsp;<p>{{ copy.venueNoBooking }}</p></div>
        </div>
      </article>
    } @else {
    @let page = copy.pages[kind()];
    @if (back) { <button type="button" class="crp-offer-back" (click)="back()"><span aria-hidden="true">←</span>&ngsp;<span>{{ copy.back }}</span></button> }
    <header class="crp-page-header crp-offer-head">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow">{{ copy.placesEyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ page.title }}</h1>
        <p class="crp-page-header-desc">{{ page.description }}</p>
      </div>
    </header>
    <section class="crp-offer-agreement">
      <p class="crp-offer-agreement-eyebrow">{{ copy.agreementEyebrow }}</p>&ngsp;<h2>{{ copy.agreementTitle }}</h2>&ngsp;<p>{{ page.agreement }}</p>
    </section>
    <section class="crp-offer-section" data-part="establishments" [attr.aria-label]="page.list">
      @let places = placesState();
      @switch (places.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loadingEstablishments }}</p> }
        @case ('error') { <div role="alert" data-state="error"><p>{{ copy.requestFailed }}</p><button class="crp-outline" type="button" (click)="places.retry()">{{ copy.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ page.noPlaces }}</p> }
        @case ('data') {
          <ul class="crp-offer-grid" data-state="data">
            @for (place of places.items; track place.establishmentId) {
              <li class="crp-tour-card">
                <div class="crp-tour-media"><img [src]="place.photo" [alt]="place.commercialName" loading="lazy" /></div>
                <div class="crp-tour-body">
                  <strong>{{ place.commercialName }}</strong>
                  <span class="crp-establishment-type">{{ copy.types[place.establishmentType] }}@if (place.region) { &ngsp;· {{ place.region }} }</span>
                  @if (place.commercialInformation.trim()) { <p class="crp-establishment-info">{{ place.commercialInformation }}</p> }
                  @if (place.lines.length) {
                    <p class="crp-establishment-contact">{{ copy.contact }}&ngsp;@for (line of place.lines; track $index) { <span>{{ line }}</span>&ngsp; }</p>
                  }
                  <button type="button" class="crp-offer-link" (click)="chosen.set(place)">{{ copy.seeContact }}</button>
                </div>
              </li>
            }
            </ul>
        }
      }
    </section>
    }
  `,
})
export class EstablishmentsOfferComponent implements OnInit {
  readonly kind = input.required<PublicEstablishment['establishmentType']>();
  protected readonly copy = PUBLIC_OFFER_COPY;
  protected readonly back = backToPanel();
  /** The establishment of detalle-gastronomia.html, opened by Ver contacto. */
  protected readonly chosen = signal<Shown | null>(null);
  private readonly establishments = inject(PublicEstablishmentsSource, { optional: true });
  private readonly requests = new Subject<void>();

  protected readonly placesState = partOf(this.requests, () => (this.establishments?.listActive() ?? unavailable()).pipe(
    // RN-PO5: an inactive association never reaches the screen, even if the port returns it.
    map((places) => places.filter((place) => place.active && place.establishmentType === this.kind())
      .map((place): Shown => ({ ...place, photo: establishmentPhoto(place.establishmentType), lines: contactLines(place) }))),
  ), () => this.requests.next());

  ngOnInit(): void { this.requests.next(); }
}

/** The client area Alojamiento (alojamiento.html). */
@Component({
  selector: 'app-lodging-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstablishmentsOfferComponent],
  template: `<app-establishments-offer kind="HOTEL" />`,
})
export class LodgingOfferPageComponent {}

/** The client area Gastronomía (gastronomia.html). */
@Component({
  selector: 'app-gastronomy-offer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstablishmentsOfferComponent],
  template: `<app-establishments-offer kind="RESTAURANT" />`,
})
export class GastronomyOfferPageComponent {}

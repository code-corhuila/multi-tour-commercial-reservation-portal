import { ChangeDetectionStrategy, Component, InjectionToken, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext, CatalogItemsSource } from '../catalog/data/catalog-api.service';
import { CatalogServiceType, capabilitiesOf } from '../catalog/model/catalog-item';
import { AssociatedEstablishmentsSource, canReadEstablishments } from '../establishments/data/associated-establishments-source';
import { EstablishmentType } from '../establishments/model/associated-establishment';
import { DASHBOARD_AREA, DASHBOARD_AVAILABLE, HUB_COPY, activeCount, areaPath, recordCount } from './hub-copy';

/** The tenant the container mounted the portal for (props.identifier); absent on the platform. */
export const PORTAL_IDENTIFIER = new InjectionToken<string | undefined>('PORTAL_IDENTIFIER');

/** Where a card leads: the list of one kind, already filtered. */
export type HubTarget =
  | { readonly screen: 'catalog'; readonly serviceType: CatalogServiceType }
  | { readonly screen: 'establishments'; readonly establishmentType: EstablishmentType };

interface HubCounts {
  readonly tours: number;
  readonly transport: number;
  readonly lodging: number;
  readonly food: number;
}

type HubState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'data'; readonly counts: HubCounts };

@Component({
  selector: 'app-catalogs-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (caps.isDenied) {
      <p role="alert" data-state="denied">{{ copy.denied }}</p>
    } @else {
      <header class="crp-page-header">
        <div class="crp-page-header-main">
          <p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ copy.eyebrow }}</p>
          <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
        </div>
        @if (dashboardAvailable()) {
          <a class="crp-outline crp-page-header-action" role="link" [attr.href]="summaryHref()">{{ copy.summary }}</a>
        } @else {
          <a class="crp-outline crp-page-header-action crp-is-disabled" role="link" aria-disabled="true" tabindex="-1" [attr.title]="copy.summaryUnavailable">{{ copy.summary }}</a>
        }
      </header>
      <p class="crp-access-note">{{ copy.accessNote }}</p>
      @let current = state();
      @if (current.kind === 'loading') {
        <p role="status" data-state="loading">{{ copy.loading }}</p>
      } @else if (current.kind === 'error') {
        <div role="alert" data-state="error">
          <p>{{ copy.requestFailed }}</p>
          <button class="crp-outline" type="button" (click)="current.retry()">{{ copy.retry }}</button>
        </div>
      } @else {
        @if (isEmpty(current.counts)) {
          <p role="status" data-state="empty">{{ copy.empty }}</p>
        }
        <section class="crp-catalog-grid" data-state="data" [attr.aria-label]="copy.cardsLabel">
          <article>
            <span>{{ copy.cards.tours.label }}</span>
            <strong>{{ active(current.counts.tours) }}</strong>
            <p>{{ copy.cards.tours.description }}</p>
            <button type="button" (click)="open({ screen: 'catalog', serviceType: 'TOUR' })">{{ copy.cards.tours.action }}</button>
          </article>
          <article class="crp-card-disabled" aria-disabled="true">
            <span>{{ copy.cards.departures.label }}</span>
            <strong>{{ copy.cards.departures.value }}</strong>
            <p>{{ copy.cards.departures.description }}</p>
          </article>
          @if (showEstablishments) {
            <article>
              <span>{{ copy.cards.lodging.label }}</span>
              <strong>{{ records(current.counts.lodging) }}</strong>
              <p>{{ copy.cards.lodging.description }}</p>
              <button type="button" (click)="open({ screen: 'establishments', establishmentType: 'HOTEL' })">{{ copy.cards.lodging.action }}</button>
            </article>
            <article>
              <span>{{ copy.cards.food.label }}</span>
              <strong>{{ records(current.counts.food) }}</strong>
              <p>{{ copy.cards.food.description }}</p>
              <button type="button" (click)="open({ screen: 'establishments', establishmentType: 'RESTAURANT' })">{{ copy.cards.food.action }}</button>
            </article>
          }
          <article>
            <span>{{ copy.cards.transport.label }}</span>
            <strong>{{ active(current.counts.transport) }}</strong>
            <p>{{ copy.cards.transport.description }}</p>
            <button type="button" (click)="open({ screen: 'catalog', serviceType: 'TRANSPORTATION' })">{{ copy.cards.transport.action }}</button>
          </article>
        </section>
      }
    }
  `,
})
export class CatalogsHubComponent {
  private readonly catalog = inject(CatalogItemsSource);
  private readonly establishments = inject(AssociatedEstablishmentsSource);
  private readonly actor = inject(ActorContext);
  private readonly requests = new Subject<void>();

  protected readonly copy = HUB_COPY;
  protected readonly active = activeCount;
  protected readonly records = recordCount;
  protected readonly caps = capabilitiesOf(this.actor.role, this.actor.collaboratorMayEditDescription);
  /** The Collaborator does not read associated establishments (RF-018): their cards are not offered. */
  protected readonly showEstablishments = canReadEstablishments(this.actor);

  /** Whether the dashboard area can be opened; a plain link to another area of the container, not a view of this portal. */
  readonly dashboardAvailable = input<boolean>(DASHBOARD_AVAILABLE);
  protected readonly summaryHref = computed(() => areaPath(this.identifier, DASHBOARD_AREA));
  private readonly identifier = inject(PORTAL_IDENTIFIER, { optional: true }) ?? undefined;

  readonly opened = output<HubTarget>();
  readonly state = signal<HubState>({ kind: 'loading' });

  constructor() {
    this.requests
      .pipe(
        // The counts come from the same lists the screens use; only the latest request may set the state.
        switchMap(() =>
          forkJoin({
            items: this.catalog.list(),
            places: this.showEstablishments ? this.establishments.list({}) : of([]),
          }).pipe(
            map(({ items, places }): HubState => ({
              kind: 'data',
              counts: {
                tours: items.filter((item) => item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE').length,
                transport: items.filter((item) => item.serviceType === 'TRANSPORTATION' && item.catalogStatus === 'ACTIVE').length,
                lodging: places.filter((place) => place.establishmentType === 'HOTEL').length,
                food: places.filter((place) => place.establishmentType === 'RESTAURANT').length,
              },
            })),
            catchError(() => of<HubState>({ kind: 'error', retry: () => this.reload() })),
            startWith<HubState>({ kind: 'loading' }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((next) => this.state.set(next));
    this.reload();
  }

  reload(): void {
    if (!this.caps.isDenied) {
      this.requests.next();
    }
  }

  protected isEmpty(counts: HubCounts): boolean {
    return counts.tours + counts.transport + counts.lodging + counts.food === 0;
  }

  protected open(target: HubTarget): void {
    this.opened.emit(target);
  }
}

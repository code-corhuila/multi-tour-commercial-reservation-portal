import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { AssociatedEstablishmentsSource } from '../../establishments/data/associated-establishments-source';
import { PortalNavigation } from '../../portal-navigation';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CATALOG_HUB_COPY } from '../catalog-hub-copy';
import { CatalogItemsSource } from '../data/catalog-api.service';

/** One card of admin-catalogos.html; `area` is the area it opens, drawn only when the container or a story registers it. */
interface HubCard {
  readonly label: string;
  readonly headline: string;
  readonly text: string;
  readonly action: string;
  readonly area: string;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * The Catálogos hub (screen 11, AC-P1.13). It learns of the other areas through the area registry
 * (PortalNavigation.has), never by importing their pages (pillar 10); "Salidas" and "Transporte" belong
 * to operations-cost, so their cards appear only once that area registers (DP-001-V19-1).
 */
@Component({ imports: [ReadErrorComponent],
  selector: 'app-catalog-hub-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = state();
    @if (denied) {
      <p role="alert" data-state="denied">{{ copy.denied }}</p>
    } @else {
      <header class="crp-page-header">
        <div class="crp-page-header-main">
          <p class="crp-page-header-eyebrow">{{ copy.eyebrow }}</p>
          <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
        </div>
        @if (canRegister) {
          <button class="crp-operator-primary crp-page-header-action" type="button" (click)="open('catalog-new-service', {})">{{ copy.newService }}</button>
        }
      </header>
      <p class="crp-access-note">{{ copy.accessNote }}</p>
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ copy.loading }}</p> }
        @case ('error') {
          <div role="alert" data-state="error"><p><crp-read-error [state]="current" [fallback]="copy.requestFailed" /></p><button class="crp-operator-outline" type="button" (click)="current.retry()">{{ copy.retry }}</button></div>
        }
        @case ('empty') { <p role="status" data-state="empty">{{ copy.empty }}</p> }
        @case ('data') {
          <section class="crp-catalog-grid" data-state="data">
            @for (card of current.items; track card.label) {
              <article>
                <span>{{ card.label }}</span><strong>{{ card.headline }}</strong><p>{{ card.text }}</p>
                <button class="crp-catalog-link" type="button" (click)="open(card.area, card.params)">{{ card.action }}</button>
              </article>
            }
          </section>
        }
      }
    }
  `,
})
export class CatalogHubPageComponent {
  protected readonly copy = CATALOG_HUB_COPY;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly catalog = inject(CatalogItemsSource);
  private readonly establishments = inject(AssociatedEstablishmentsSource, { optional: true });
  private readonly capabilities = inject(PortalCapabilities);
  private readonly canSeeEstablishments = this.capabilities.canRegisterEstablishments();
  protected readonly denied = this.capabilities.catalog().isDenied;
  protected readonly canRegister = this.capabilities.catalog().canRegister;
  protected readonly state = signal<PageState<HubCard>>({ kind: 'loading' });
  private readonly requests = new Subject<void>();

  constructor() {
    this.requests.pipe(
      switchMap(() => forkJoin([this.catalog.list(), this.canSeeEstablishments && this.establishments ? this.establishments.list({}) : of([])]).pipe(
        map(([items, places]): PageState<HubCard> => {
          const tours = (type: 'TOUR' | 'TRANSPORTATION') => items.filter((it) => it.serviceType === type && it.catalogStatus === 'ACTIVE').length;
          const spots = (type: 'HOTEL' | 'RESTAURANT') => places.filter((it) => it.establishmentType === type && it.associationStatus === 'ACTIVE').length;
          const c = this.copy;
          const cards: ReadonlyArray<HubCard & { readonly admin?: true }> = [
            card(c.tours, c.activeTours(tours('TOUR')), 'catalog-tours'),
            card(c.departures, c.departures.headline, 'departures'),
            card(c.transport, c.activeResources(tours('TRANSPORTATION')), 'transport'),
            { ...card(c.lodging, c.activeEstablishments(spots('HOTEL')), 'establishments', { type: 'HOTEL' }), admin: true },
            { ...card(c.restaurants, c.activeEstablishments(spots('RESTAURANT')), 'establishments', { type: 'RESTAURANT' }), admin: true },
          ];
          const shown = cards.filter((each) => (!each.admin || this.canSeeEstablishments) && (this.navigation?.has(each.area) ?? false));
          return shown.length === 0 ? { kind: 'empty' } : { kind: 'data', items: shown };
        }),
        catchError((error) => of<PageState<HubCard>>({ kind: 'error', ...readFailure(error), retry: () => this.requests.next() })),
        startWith<PageState<HubCard>>({ kind: 'loading' }),
      )),
      takeUntilDestroyed(),
    ).subscribe((next) => this.state.set(next));
    if (!this.denied) {
      this.requests.next();
    }
  }

  protected open(area: string, params: Readonly<Record<string, string>>): void {
    this.navigation?.open(area, params);
  }
}

function card(text: { readonly label: string; readonly text: string; readonly action: string }, headline: string, area: string, params: Readonly<Record<string, string>> = {}): HubCard {
  return { label: text.label, headline, text: text.text, action: text.action, area, params };
}

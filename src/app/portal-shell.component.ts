import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { PublicOfferPageComponent } from './public-offer/pages/public-offer-page.component';

/** Internal view state instead of a router: the container owns the URL. */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPageComponent, EstablishmentsPageComponent, PublicOfferPageComponent],
  template: `
    <div class="crp-operator-shell">
    <main class="crp-operator-content">
    <header class="crp-header">
      <span class="crp-brand">Multi<span>Tour</span> · Reservas</span>
      <nav class="crp-nav" aria-label="Commercial reservation">
        <button type="button" [attr.aria-current]="view() === 'catalog' ? 'page' : null" (click)="view.set('catalog')">Catalog</button>
        <button type="button" [attr.aria-current]="view() === 'establishments' ? 'page' : null" (click)="view.set('establishments')">Establishments</button>
        <button type="button" [attr.aria-current]="view() === 'offer' ? 'page' : null" (click)="view.set('offer')">Offer</button>
      </nav>
    </header>
    @if (view() === 'catalog') { <app-catalog-page /> } @else if (view() === 'establishments') { <app-establishments-page /> } @else { <app-public-offer-page /> }
    </main>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly view = signal<'catalog' | 'establishments' | 'offer'>('catalog');
}

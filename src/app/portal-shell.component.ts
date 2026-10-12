import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { ReservationsPageComponent } from './reservations/pages/reservations-page.component';

/**
 * Shell of the authorized screens, drawn from PORTAL_AREAS: the operator sidebar for an operator, the client
 * header and footer of tours.html for a final customer or a visitor. Internal view state, no router: the container owns the URL.
 */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPageComponent, EstablishmentsPageComponent, ReservationsPageComponent],
  template: `
    <div class="crp-operator-shell">
    <main class="crp-operator-content">
    <header class="crp-header">
      <span class="crp-brand">Multi<span>Tour</span> · Reservas</span>
      <nav class="crp-nav" aria-label="Commercial reservation">
        <button type="button" [attr.aria-current]="view() === 'catalog' ? 'page' : null" (click)="view.set('catalog')">Catalog</button>
        <button type="button" [attr.aria-current]="view() === 'establishments' ? 'page' : null" (click)="view.set('establishments')">Establishments</button>
        <button type="button" [attr.aria-current]="view() === 'reservations' ? 'page' : null" (click)="view.set('reservations')">Reservations</button>
      </nav>
    </header>
    @if (view() === 'catalog') { <app-catalog-page /> } @else if (view() === 'reservations') { <app-reservations-page /> } @else { <app-establishments-page /> }
    </main>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly view = signal<'catalog' | 'establishments' | 'reservations'>('catalog');
}

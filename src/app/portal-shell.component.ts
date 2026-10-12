import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { SELF_SERVICE_TEXT } from './self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from './self-service-reservation/pages/confirm-reservation-page.component';
import { MyReservationsPageComponent } from './self-service-reservation/pages/my-reservations-page.component';

/**
 * Shell of the authorized screens, drawn from PORTAL_AREAS: the operator sidebar for an operator, the client
 * header and footer of tours.html for a final customer or a visitor. Internal view state, no router: the container owns the URL.
 */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPageComponent, EstablishmentsPageComponent, ConfirmReservationPageComponent, MyReservationsPageComponent],
  template: `
    <div class="crp-operator-shell">
    <main class="crp-operator-content">
    <header class="crp-header">
      <span class="crp-brand">Multi<span>Tour</span> · Reservas</span>
      <nav class="crp-nav" aria-label="Commercial reservation">
        <button type="button" [attr.aria-current]="view() === 'catalog' ? 'page' : null" (click)="view.set('catalog')">Catalog</button>
        <button type="button" [attr.aria-current]="view() === 'establishments' ? 'page' : null" (click)="view.set('establishments')">Establishments</button>
        <button type="button" [attr.aria-current]="view() === 'self-service' ? 'page' : null" (click)="view.set('self-service')">{{ selfServiceNav }}</button>
      </nav>
    </header>
    @if (view() === 'catalog') { <app-catalog-page /> } @else if (view() === 'establishments') { <app-establishments-page /> }
    @if (view() === 'self-service') { <app-confirm-reservation-page /><app-my-reservations-page /> }
    </main>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly view = signal<'catalog' | 'establishments' | 'self-service'>('catalog');
  protected readonly selfServiceNav = SELF_SERVICE_TEXT.nav;
}

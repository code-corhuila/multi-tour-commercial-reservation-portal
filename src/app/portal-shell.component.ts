import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';

/** Internal view state instead of a router: the container owns the URL. */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPageComponent, EstablishmentsPageComponent],
  template: `
    <header class="crp-header">
      <span class="crp-brand">Multi<span>Tour</span> · Reservas</span>
      <nav class="crp-nav" aria-label="Commercial reservation">
        <button type="button" [attr.aria-current]="view() === 'catalog' ? 'page' : null" (click)="view.set('catalog')">Catalog</button>
        <button type="button" [attr.aria-current]="view() === 'establishments' ? 'page' : null" (click)="view.set('establishments')">Establishments</button>
      </nav>
    </header>
    <main class="crp-panel">
      @if (view() === 'catalog') { <app-catalog-page /> } @else { <app-establishments-page /> }
    </main>
  `,
})
export class PortalShellComponent {
  protected readonly view = signal<'catalog' | 'establishments'>('catalog');
}

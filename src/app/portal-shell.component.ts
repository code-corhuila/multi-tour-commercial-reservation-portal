import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { inject } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';
import { customersCapabilitiesOf } from './customers/model/customer-group';
import { CustomersPageComponent } from './customers/pages/customers-page.component';

/** Internal view state instead of a router: the container owns the URL. */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPageComponent, EstablishmentsPageComponent, CustomersPageComponent],
  template: `
    <div class="crp-operator-shell">
    <main class="crp-operator-content">
    <header class="crp-header">
      <span class="crp-brand">Multi<span>Tour</span> · Reservas</span>
      <nav class="crp-nav" aria-label="Commercial reservation">
        <button type="button" [attr.aria-current]="view() === 'catalog' ? 'page' : null" (click)="view.set('catalog')">Catalog</button>
        <button type="button" [attr.aria-current]="view() === 'establishments' ? 'page' : null" (click)="view.set('establishments')">Establishments</button>
        @if (people) { <button type="button" [attr.aria-current]="view() === 'customers' ? 'page' : null" (click)="view.set('customers')">People</button> }
      </nav>
    </header>
    @if (view() === 'catalog') { <app-catalog-page /> } @else if (view() === 'customers') { <app-customers-page /> } @else { <app-establishments-page /> }
    </main>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly view = signal<'catalog' | 'establishments' | 'customers'>('catalog');
  protected readonly people = customersCapabilitiesOf(inject(ActorContext).role).canRead;
}

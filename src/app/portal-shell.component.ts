import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';
import { CatalogsHubComponent, HubTarget } from './hub/catalogs-hub.component';
import { HUB_COPY } from './hub/hub-copy';

/** The hub, or the list a hub card opened. */
type PortalView = { readonly screen: 'hub' } | HubTarget;

/** Internal view state instead of a router: the container owns the URL. */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogsHubComponent, CatalogPageComponent, EstablishmentsPageComponent],
  template: `
    <div class="crp-operator-shell">
    <main class="crp-operator-content">
      @let current = view();
      @if (current.screen === 'hub') {
        <app-catalogs-hub (opened)="view.set($event)" />
      } @else {
        <div class="crp-back">
          <button class="crp-outline" type="button" (click)="view.set({ screen: 'hub' })">{{ backLabel }}</button>
        </div>
        @if (current.screen === 'catalog') {
          <app-catalog-page [serviceType]="current.serviceType" />
        } @else {
          <app-establishments-page [establishmentType]="current.establishmentType" />
        }
      }
    </main>
    </div>
  `,
})
export class PortalShellComponent {
  protected readonly backLabel = HUB_COPY.back;
  protected readonly view = signal<PortalView>({ screen: 'hub' });
}

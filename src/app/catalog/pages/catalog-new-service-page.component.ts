import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { NEW_SERVICE_COPY } from '../catalog-new-service-copy';
import { CatalogNewServiceFormComponent } from '../components/catalog-new-service-form.component';

/** admin-nuevo-servicio.html (HU-COM-001, owner decision 2026-10-15): opened by "Nuevo servicio" of the hub and "Crear tour" of the tour list. */
@Component({
  selector: 'app-catalog-new-service-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogNewServiceFormComponent],
  template: `
    @if (!canRegister) {
      <p role="alert" data-state="denied">{{ copy.denied }}</p>
    } @else {
      <header class="crp-page-header">
        <div class="crp-page-header-main">
          <p class="crp-page-header-eyebrow">{{ copy.eyebrow }}</p>
          <h1 class="crp-page-header-title crp-h1">{{ copy.title }}</h1>
        </div>
        <button class="crp-operator-outline crp-page-header-action" type="button" (click)="toCatalogs()">{{ copy.back }}</button>
      </header>
      <app-catalog-new-service-form [establishmentsAvailable]="navigation?.has('establishments') ?? false"
        (saved)="navigation?.open('catalog-tours')" (cancelled)="toCatalogs()" (establishmentChosen)="navigation?.open('establishments', { type: 'HOTEL' })" />
    }
  `,
})
export class CatalogNewServicePageComponent {
  protected readonly copy = NEW_SERVICE_COPY;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  /** Only the Tenant Administrator registers (RN-P8); the service refuses anyway. */
  protected readonly canRegister = inject(PortalCapabilities).catalog().canRegister;

  protected toCatalogs(): void { this.navigation?.open('catalog'); }
}

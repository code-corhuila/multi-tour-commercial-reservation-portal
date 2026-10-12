import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';
import { PORTAL_AREA_LIST, ROLE_LABELS } from './portal-areas';
import { PortalAudience } from './portal-audience';

/**
 * Shell of the authorized screens, drawn from PORTAL_AREAS: the operator sidebar for an operator, the client
 * header of the client screens for a final customer or a visitor. Internal view state, no router: the container owns the URL.
 */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (audience === 'customer') {
      <div class="crp-client-shell">
        <header class="crp-client-header">
          <p class="crp-client-brand">MULTI<span>TOUR</span></p>
          <nav class="crp-client-nav" aria-label="Navegación principal del cliente">
            @for (area of areas; track area.key) {
              <button type="button" [class.crp-is-active]="area === current()" [attr.aria-current]="area === current() ? 'page' : null"
                (click)="selected.set(area.key)">{{ area.label }}</button>
            }
          </nav>
        </header>
        <section class="crp-client-hero">
          <p class="crp-client-eyebrow">Portal cliente</p>
          <p class="crp-client-greeting">Hola, te damos la bienvenida</p>
          <p>Consulta la oferta disponible, revisa tus reservas y continúa la gestión de tus próximos viajes desde un solo lugar.</p>
        </section>
        <main class="crp-client-content">
          @if (current(); as area) { <ng-container *ngComponentOutlet="area.component" /> }
        </main>
      </div>
    } @else {
      <div class="crp-operator-shell">
        <aside class="crp-operator-sidebar">
          <p class="crp-operator-brand">MULTITOUR</p>
          <p class="crp-operator-role">{{ roleLabel }}</p>
          <nav class="crp-operator-nav" aria-label="Administración comercial">
            @for (area of areas; track area.key) {
              <button type="button" [class.crp-is-active]="area === current()" [attr.aria-current]="area === current() ? 'page' : null"
                (click)="selected.set(area.key)">{{ area.label }}</button>
            }
          </nav>
        </aside>
        <main class="crp-operator-content">
          @if (current(); as area) { <ng-container *ngComponentOutlet="area.component" /> }
        </main>
      </div>
    }
  `,
})
export class PortalShellComponent {
  private readonly injector = inject(Injector);
  protected readonly audience = inject(PortalAudience).audience;
  protected readonly areas = inject(PORTAL_AREA_LIST)
    .filter((area) => (area.audience ?? 'operator') === this.audience && (area.isAvailable?.(this.injector) ?? true));
  protected readonly selected = signal(this.areas[0]?.key);
  protected readonly current = computed(() => this.areas.find((area) => area.key === this.selected()) ?? this.areas[0]);
  protected readonly roleLabel = ROLE_LABELS[inject(ActorContext).role] ?? ROLE_LABELS.READ_ONLY;
}

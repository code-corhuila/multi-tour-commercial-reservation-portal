import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';
import { PORTAL_AREAS, ROLE_LABELS } from './portal-areas';

/** Operator shell of the authorized screens, drawn from PORTAL_AREAS. Internal view state, no router: the container owns the URL. */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
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
  `,
})
export class PortalShellComponent {
  private readonly injector = inject(Injector);
  protected readonly areas = PORTAL_AREAS.filter((area) => area.isAvailable?.(this.injector) ?? true);
  protected readonly selected = signal(this.areas[0]?.key);
  protected readonly current = computed(() => this.areas.find((area) => area.key === this.selected()) ?? this.areas[0]);
  protected readonly roleLabel = ROLE_LABELS[inject(ActorContext).role] ?? ROLE_LABELS.READ_ONLY;
}

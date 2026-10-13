import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject } from '@angular/core';
import { CLIENT_AREA, CLIENT_LINKS, ClientLink, PORTAL_AREA_LIST } from './portal-areas';
import { PortalAudience } from './portal-audience';
import { PortalNavigation } from './portal-navigation';
import { focusHeading } from './shared/focus';
import { PortalCapabilities } from './shared/portal-capabilities';

/**
 * Shell of the authorized screens, drawn from PORTAL_AREAS: the operator sidebar for an operator, the client
 * header and footer of tours.html for a final customer or a visitor. Internal view state, no router: the container owns the URL.
 */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  providers: [PortalNavigation],
  template: `
    @if (audience === 'customer') {
      <div class="crp-client-shell">
        @if (chrome() === 'site') {
        <header class="crp-client-header">
          <button type="button" class="crp-client-brand" (click)="open(landing?.key)">MULTI<span>TOUR</span></button>
          <nav class="crp-client-nav" aria-label="Navegación principal del cliente">
            @for (link of headerNav; track link.key) { <button type="button" [class.crp-is-active]="link.key === current()?.key" [attr.aria-current]="link.key === current()?.key ? 'page' : null"
                (click)="open(link.key)">{{ link.label }}</button> }
          </nav>
          <div class="crp-client-actions">
            @for (link of headerAccount; track link.key) { <button type="button" [class.crp-is-active]="link.key === current()?.key" [attr.aria-current]="link.key === current()?.key ? 'page' : null"
                (click)="open(link.key)">{{ link.label }}</button> }
          </div>
        </header>
        }
        <main class="crp-client-content">
          @if (chrome() === 'panel') {
            <header class="crp-client-panel-header">
              <button type="button" class="crp-client-panel-brand" (click)="open(landing?.key)">Multi Tour</button>
              @if (panelLink(); as link) { <button type="button" (click)="open(link.key)">{{ link.label }}</button> }
            </header>
          }
          @if (current(); as area) { <ng-container *ngComponentOutlet="area.component" /> }
        </main>
        @if (chrome() === 'site') {
        <footer class="crp-client-footer">
          <div class="crp-client-footer-grid">
            <div>
              <span class="crp-client-footer-brand">MULTI<span>TOUR</span></span>
              <p>Plataforma para descubrir, reservar y gestionar experiencias de turismo con operadores locales.</p>
            </div>
            <nav class="crp-client-footer-col" aria-label="Explorar">
              <strong>Explorar</strong>
              @for (link of footerLinks; track link.key) {
                @if (navigation.has(link.key)) { <button type="button" (click)="open(link.key)">{{ link.label }}</button> } @else { <span>{{ link.label }}</span> }
              }
            </nav>
            <div class="crp-client-footer-col" aria-label="Cuenta"><strong>Cuenta</strong><span>Ingresar</span><span>Crear cuenta</span></div>
          </div>
          <p class="crp-client-footer-bottom">© 2026 Multi Tour. Plataforma para operadores de turismo.</p>
        </footer>
        }
      </div>
    } @else {
      <div class="crp-operator-shell">
        <aside class="crp-operator-sidebar">
          <p class="crp-operator-brand">MULTITOUR</p>
          <p class="crp-operator-role">{{ roleLabel }}</p>
          <nav class="crp-operator-nav" aria-label="Administración comercial">
            @for (area of areas; track area.key) {
              <button type="button" [class.crp-is-active]="area === current()" [attr.aria-current]="area === current() ? 'page' : null"
                (click)="open(area.key)">{{ area.label }}</button>
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
  protected readonly navigation = inject(PortalNavigation);
  protected readonly audience = inject(PortalAudience).audience;
  protected readonly areas = inject(PORTAL_AREA_LIST)
    .filter((area) => (area.audience ?? 'operator') === this.audience && (area.isAvailable?.(this.injector) ?? true));
  /** The operator lands on the first area; the customer on the panel cliente when the build has it. */
  protected readonly landing = (this.audience === 'customer' && this.areas.find((area) => area.key === CLIENT_AREA.panel)) || this.areas[0];
  protected readonly current = computed(() => this.areas.find((area) => area.key === this.navigation.selected()) ?? this.landing);
  protected readonly roleLabel = inject(PortalCapabilities).roleLabel();
  private readonly drawn = (links: readonly ClientLink[]) => links.filter((link) => this.areas.some((area) => area.key === link.key));
  protected readonly headerNav = this.drawn(CLIENT_LINKS.nav);
  protected readonly headerAccount = this.drawn(CLIENT_LINKS.account);
  protected readonly footerLinks = CLIENT_LINKS.footer;
  protected readonly chrome = computed(() => this.current()?.clientChrome ?? 'site');
  /** 'Ver catálogo' on the panel cliente, 'Volver al panel' on the other panel areas; only when the build has the target. */
  protected readonly panelLink = computed(() =>
    this.drawn([CLIENT_LINKS.panel[this.current()?.key === CLIENT_AREA.panel ? 0 : 1]])[0]);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** HC-4: once an opened area renders, the focus goes to its heading; the first render leaves the focus alone. */
  constructor() {
    this.navigation.register(this.areas.map((area) => area.key), () =>
      afterNextRender(() => focusHeading(this.host.querySelector('main') ?? this.host), { injector: this.injector }));
  }

  protected open(key: string | undefined): void { if (key) { this.navigation.open(key); } }
}

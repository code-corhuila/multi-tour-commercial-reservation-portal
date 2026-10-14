import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { CLIENT_AREA, CLIENT_LINKS, ClientLink, PORTAL_AREA_LIST } from './portal-areas';
import { PortalAudience } from './portal-audience';
import { PortalNavigation } from './portal-navigation';
import { focusHeading } from './shared/focus';
import { CLIENT_NOTICES, PortalSlotOutlet, slotEntries } from './shared/portal-slots';
import { PortalCapabilities } from './shared/portal-capabilities';
import { CONTAINER_NAVIGATION, PROFILE_TARGET } from './shell-contract';
import { SESSION_TEXT } from './shared/session-copy';
import { SHELL_TEXT } from './shell-copy';
import { SESSION_IDENTITY } from './shared/session-identity';

/**
 * Shell of the authorized screens, drawn from PORTAL_AREAS: the operator sidebar for an operator, the client
 * header and footer of tours.html for a final customer or a visitor. Internal view state, no router: the container owns the URL.
 */
@Component({
  selector: 'crp-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, PortalSlotOutlet],
  host: { '(document:keydown.escape)': 'bell.set(false)', '(document:click)': 'closeBellOutside($event)' },
  providers: [PortalNavigation],
  template: `
    @if (audience === 'customer') {
      <div class="crp-client-shell">
        @if (chrome() === 'site') {
        <header class="crp-client-header">
          <button type="button" class="crp-client-brand" (click)="open(landing?.key)">{{ shell.brandStart }}<span>{{ shell.brandEnd }}</span></button>
          <nav class="crp-client-nav" [attr.aria-label]="shell.clientNavLabel">
            @for (link of headerNav; track link.key) { <button type="button" [class.crp-is-active]="link.key === current()?.key" [attr.aria-current]="link.key === current()?.key ? 'page' : null"
                (click)="open(link.key)">{{ link.label }}</button> }
          </nav>
          <div class="crp-client-actions">
            @for (link of headerAccount; track link.key) { <button type="button" [class.crp-is-active]="link.key === current()?.key" [attr.aria-current]="link.key === current()?.key ? 'page' : null"
                (click)="open(link.key)">{{ link.label }}</button> }
            @if (openProfile) { <button type="button" class="crp-client-profile" (click)="openProfile()">{{ profileLabel }}</button> }
          </div>
        </header>
        }
        <main class="crp-client-content">
          @if (chrome() === 'panel') {
            <header class="crp-client-panel-header">
              @if (!onPanel()) { <button type="button" class="crp-client-panel-brand" (click)="open(landing?.key)">{{ shell.brandPlain }}</button> }
              <div class="crp-client-panel-actions">
                @if (panelLink(); as link) { <button type="button" (click)="open(link.key)">{{ link.label }}</button> }
                @if (onPanel()) {
                  <div class="crp-client-bell">
                    <button type="button" class="crp-client-bell-button" [attr.aria-label]="shell.notifications" aria-haspopup="true" [attr.aria-expanded]="bell()"
                      (click)="bell.set(!bell())"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></button>
                    <div class="crp-client-bell-panel" role="region" [attr.aria-label]="shell.notifications" [hidden]="!bell()">
                      <h2>{{ shell.notifications }}</h2>
                      <div class="crp-client-bell-list">
                        <ng-container *crpSlot="notices" />
                        @if (!hasNotices) { <p>{{ shell.noNotifications }}</p> }
                      </div>
                    </div>
                  </div>
                }
                @if (openProfile) { <button type="button" class="crp-client-avatar" [attr.aria-label]="avatarLabel" (click)="openProfile()">{{ initials }}</button> }
                @else { <span class="crp-client-avatar" role="img" [attr.aria-label]="avatarLabel">{{ initials }}</span> }
              </div>
            </header>
          }
          @for (s of [screen()]; track s) { @if (s.area; as area) { <ng-container *ngComponentOutlet="area.component" /> } }
        </main>
        @if (chrome() === 'site') {
        <footer class="crp-client-footer">
          <div class="crp-client-footer-grid">
            <div>
              <span class="crp-client-footer-brand">{{ shell.brandStart }}<span>{{ shell.brandEnd }}</span></span>
              <p>{{ shell.footerAbout }}</p>
            </div>
            <nav class="crp-client-footer-col" [attr.aria-label]="shell.footerExplore">
              <strong>{{ shell.footerExplore }}</strong>
              @for (link of footerLinks; track link.key) {
                @if (navigation.has(link.key)) { <button type="button" (click)="open(link.key)">{{ link.label }}</button> } @else { <span>{{ link.label }}</span> }
              }
            </nav>
          </div>
          <p class="crp-client-footer-bottom">{{ shell.footerBottom }}</p>
        </footer>
        }
      </div>
    } @else {
      <div class="crp-operator-shell">
        <aside class="crp-operator-sidebar">
          <p class="crp-operator-brand">{{ shell.operatorBrand }}</p>
          <p class="crp-operator-role">{{ roleLabel }}</p>
          <nav class="crp-operator-nav" [attr.aria-label]="shell.operatorNavLabel">
            @for (area of menu; track area.key) {
              <button type="button" [class.crp-is-active]="area.key === active()" [attr.aria-current]="area.key === active() ? 'page' : null"
                (click)="open(area.key)">{{ area.label }}</button>
            }
          </nav>
        </aside>
        <main class="crp-operator-content">
          @for (s of [screen()]; track s) { @if (s.area; as area) { <ng-container *ngComponentOutlet="area.component" /> } }
        </main>
      </div>
    }
  `,
})
export class PortalShellComponent {
  private readonly injector = inject(Injector);
  protected readonly shell = SHELL_TEXT;
  protected readonly navigation = inject(PortalNavigation);
  protected readonly audience = inject(PortalAudience).audience;
  protected readonly areas = inject(PORTAL_AREA_LIST)
    .filter((area) => (area.audience ?? 'operator') === this.audience && (area.isAvailable?.(this.injector) ?? true));
  /** The sidebar items: every area but the sub-screens (menu: false), which open from another area. */
  protected readonly menu = this.areas.filter((area) => area.menu !== false);
  /** The operator lands on the first sidebar item; the customer on the panel cliente when the build has it. */
  protected readonly landing = (this.audience === 'customer' && this.areas.find((area) => area.key === CLIENT_AREA.panel)) || this.menu[0];
  protected readonly current = computed(() => this.areas.find((area) => area.key === this.navigation.selected()) ?? this.landing);
  /** A new value on every opening, so the outlet recreates the area (see PortalNavigation.visit). */
  protected readonly screen = computed(() => ({ area: this.current(), visit: this.navigation.visit() }));
  /** The sidebar item marked active: the parent of an open sub-screen, or the open area itself. */
  protected readonly active = computed(() => this.current()?.parent ?? this.current()?.key);
  protected readonly initials = inject(SESSION_IDENTITY).initials;
  protected readonly avatarLabel = SESSION_TEXT.avatarLabel;
  protected readonly profileLabel = SESSION_TEXT.profile;
  private readonly navigateTo = inject(CONTAINER_NAVIGATION);
  /** Perfil belongs to the identity-audit portal: drawn only when the container offers navigate. */
  protected readonly openProfile = this.navigateTo ? () => this.navigateTo?.(PROFILE_TARGET) : null;
  protected readonly roleLabel = inject(PortalCapabilities).roleLabel();
  private readonly drawn = (links: readonly ClientLink[]) => links.filter((link) => this.areas.some((area) => area.key === link.key));
  protected readonly headerNav = this.drawn(CLIENT_LINKS.nav);
  protected readonly headerAccount = this.drawn(CLIENT_LINKS.account);
  protected readonly footerLinks = CLIENT_LINKS.footer;
  protected readonly chrome = computed(() => this.current()?.clientChrome ?? 'site');
  /** 'Ver catálogo' on the panel cliente, 'Volver al panel' on the other panel areas; only when the build has the target. */
  protected readonly panelLink = computed(() =>
    this.drawn([CLIENT_LINKS.panel[this.current()?.key === CLIENT_AREA.panel ? 0 : 1]])[0]);

  protected readonly onPanel = computed(() => this.current()?.key === CLIENT_AREA.panel);
  /** The bell of Notificaciones in the header of panel-cliente.html: the notices other stories contribute, or none. */
  protected readonly bell = signal(false);
  protected readonly notices = CLIENT_NOTICES;
  protected readonly hasNotices = slotEntries(CLIENT_NOTICES, this.injector).length > 0;

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** HC-4: once an opened area renders, the focus goes to its heading; the first render leaves the focus alone. */
  constructor() {
    this.navigation.register(this.areas.map((area) => area.key), () =>
      afterNextRender(() => focusHeading(this.host.querySelector('main') ?? this.host), { injector: this.injector }));
  }

  protected closeBellOutside(event: Event): void { if (!(event.target as Element | null)?.closest('.crp-client-bell')) { this.bell.set(false); } }

  protected open(key: string | undefined): void { if (key) { this.navigation.open(key); } }
}

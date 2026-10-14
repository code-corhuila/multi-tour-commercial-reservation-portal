import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { SESSION_IDENTITY } from '../../shared/session-identity';
import { PROFILE_TEXT } from '../profile-copy';

/** profile.html: the person of the session as the contract delivers it (name and initials). Reads no port, so it has no loading, error or empty state. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="crp-profile" aria-labelledby="crp-profile-title">
      <header class="crp-profile-topbar">
        <button type="button" class="crp-profile-back" (click)="toPanel()"><span aria-hidden="true">←</span>&ngsp;<span>{{ text.back }}</span></button>
        <h1 id="crp-profile-title" class="crp-h1">{{ text.title }}</h1>
        <span></span>
      </header>
      <p class="crp-profile-intro">{{ text.intro }}</p>
      <article class="crp-profile-card">
        <aside class="crp-profile-identity">
          <span class="crp-profile-avatar" role="img" [attr.aria-label]="text.avatarLabel">{{ identity.initials }}</span>
          <strong>{{ identity.name ?? text.notRegistered }}</strong>
          <p>{{ text.notRegistered }}</p>
        </aside>
        <section aria-labelledby="crp-profile-account">
          <h2 id="crp-profile-account" class="crp-profile-section">{{ text.accountTitle }}</h2>
          <div class="crp-profile-grid">
            <label class="crp-profile-field"><span>{{ text.name }}</span><input type="text" readonly [value]="identity.name ?? text.notRegistered" /></label>
            <label class="crp-profile-field"><span>{{ text.email }}</span><input type="text" readonly [value]="text.notRegistered" /></label>
            <label class="crp-profile-field"><span>{{ text.role }}</span><input type="text" readonly [value]="text.roleValue" /></label>
          </div>
          <p class="crp-profile-blocked" data-part="blocked">{{ text.blocked }}</p>
        </section>
      </article>
      <div class="crp-profile-rows" role="group" [attr.aria-label]="text.rowsLabel">
        <button type="button" class="crp-profile-row" (click)="toPanel()">
          <span class="crp-profile-row-icon" aria-hidden="true">{{ text.backIcon }}</span>
          <span class="crp-profile-row-copy"><strong>{{ text.backTitle }}</strong><span>{{ text.backCopy }}</span></span>
          <span class="crp-profile-row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </main>
  `,
})
export class ProfilePageComponent {
  protected readonly text = PROFILE_TEXT;
  protected readonly identity = inject(SESSION_IDENTITY);
  private readonly navigation = inject(PortalNavigation, { optional: true });

  protected toPanel(): void { this.navigation?.open(CLIENT_AREA.panel); }
}

import { ChangeDetectionStrategy, Component, Injector } from '@angular/core';
import { OPERATOR_NOTIFICATIONS, PortalSlotOutlet, slotEntries } from '../../shared/portal-slots';
import { REFUNDS_COPY } from '../refunds-copy';

/** admin-notificaciones.html: the frame this story owns (DP-RF6); each alert comes from OPERATOR_NOTIFICATIONS, this story's from refund-alerts. */
@Component({
  selector: 'app-notifications-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.notificationsTrace }}</p>
      <h1 class="crp-page-header-title crp-h1">{{ t.notificationsTitle }}</h1></div></header>
    <section class="crp-operator-panel"><h2>{{ t.alertsTitle }}</h2><div class="crp-refunds-alerts"><ng-container *crpSlot="alerts" /></div></section>
  `,
})
export class NotificationsPageComponent {
  protected readonly t = REFUNDS_COPY;
  protected readonly alerts = OPERATOR_NOTIFICATIONS;
}

/** The area exists only while some story offers an alert to this actor. */
export const hasNotifications = (injector: Injector) => slotEntries(OPERATOR_NOTIFICATIONS, injector).length > 0;

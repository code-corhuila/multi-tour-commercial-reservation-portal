import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlot } from '../../shared/portal-slots';
import { REFUND_SCREENS, refundsAvailable } from '../data/refunds-ports';
import { REFUNDS_COPY } from '../refunds-copy';

/** 13 (admin-pagos.html), panel "Devoluciones monetarias": the Administrator's text, or the Collaborator's (app.js). */
@Component({
  selector: 'app-refunds-panel', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.panelEyebrow }}</p>
    <h2>{{ authorizes ? t.panelTitle : t.panelTitleExecutor }}</h2><p class="crp-operator-copy">{{ authorizes ? t.panelCopy : t.panelCopyExecutor }}</p>
    <button type="button" class="crp-operator-outline" (click)="navigation?.open(screens.requests)">{{ t.consult }}</button></section>`,
})
export class RefundsPanelComponent {
  protected readonly t = REFUNDS_COPY;
  protected readonly screens = REFUND_SCREENS;
  protected readonly authorizes = inject(PortalCapabilities).canAuthorizeRefund();
  protected readonly navigation = inject(PortalNavigation, { optional: true });
}

/** The PAYMENTS_PAGE_PANELS contribution mount-entry registers; drawn once HU-COM-010 brings the page of 13. */
export const REFUNDS_PAYMENTS_PANEL: PortalSlot = { component: RefundsPanelComponent, order: 10, isAvailable: refundsAvailable };

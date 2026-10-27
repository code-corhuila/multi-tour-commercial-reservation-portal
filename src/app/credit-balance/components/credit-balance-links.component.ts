import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { PAYMENTS_HEADER_ACTIONS, PortalSlot } from '../../shared/portal-slots';
import { CREDIT_BALANCE_COPY } from '../credit-balance-copy';
import { CREDIT_BALANCE_AREA, CreditBalanceSource } from '../data/credit-balance-ports';

/** The header link "Saldo a favor" of 13 (admin-pagos.html, app.js addLinks), through PAYMENTS_HEADER_ACTIONS, beside "Parámetros de pago" and "Ver reservas"; PortalNavigation only, never an address (plan D-07). */
@Component({
  selector: 'app-credit-balance-payments-link', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open(area)">{{ t.link }}</button>`,
})
export class CreditBalancePaymentsLinkComponent {
  protected readonly t = CREDIT_BALANCE_COPY; protected readonly area = CREDIT_BALANCE_AREA;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
}

const offered = (injector: Injector) => injector.get(CreditBalanceSource, null) !== null;
/** Registered in mount-entry.ts; drawn only when the build provides the credit balance ports. */
export const CREDIT_BALANCE_PAYMENTS_LINK: PortalSlot = { component: CreditBalancePaymentsLinkComponent, order: 30, isAvailable: offered };

import { ChangeDetectionStrategy, Component, Injector, Provider, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { CustomerContext } from '../../self-service-reservation/data/customer-context';
import { formatCop } from '../../shared/format';
import { CLIENT_NOTICES, contribute } from '../../shared/portal-slots';
import { CUSTOMER_CREDIT_COPY } from '../customer-credit-copy';
import { CustomerCreditSource } from '../data/customer-credit-ports';

/** "Notificaciones" of 17 (AC-CB.13): the line of the available credit, which opens Mis pagos on the credit; nothing when there is none. */
@Component({
  selector: 'app-customer-credit-notice', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@let cents = available();
    @if (cents > 0) { <p><strong>{{ t.noticeLead }}:</strong> {{ t.notice(cop(cents)) }}@if (navigation?.has(area)) { &ngsp;<button type="button" class="crp-panel-link" (click)="navigation?.open(area)">{{ t.see }}</button> }</p> }`,
})
export class CustomerCreditNoticeComponent {
  protected readonly t = CUSTOMER_CREDIT_COPY; protected readonly cop = formatCop; protected readonly area = CLIENT_AREA.payments;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly available = toSignal(inject(CustomerCreditSource).mine().pipe(map((c) => c.totalCents), catchError(() => of(0))), { initialValue: 0 });
}

/** Registered in mount-entry.ts, only for a final customer and when the build provides the port. */
export const CUSTOMER_CREDIT_NOTICE: Provider = contribute(CLIENT_NOTICES, { component: CustomerCreditNoticeComponent, order: 5,
  isAvailable: (injector: Injector) => injector.get(CustomerCreditSource, null) !== null && injector.get(CustomerContext).isFinalCustomer });

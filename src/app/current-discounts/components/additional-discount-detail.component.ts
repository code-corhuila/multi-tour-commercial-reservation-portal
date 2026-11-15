import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation } from '../../reservations/data/reservations-source';
import { formatCop } from '../../shared/format';
import { pesosText } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ADDITIONAL_DISCOUNT_DETAIL_COPY } from '../current-discounts-copy';
import { ADDITIONAL_DISCOUNT_AREA, AdditionalDiscountEligibility } from '../data/additional-discount-eligibility';

/** 10A header action (RESERVATION_DETAIL_ACTIONS): the Administrator, on a reservation the port admits (state and single discount, AC-CD.11). */
@Component({
  selector: 'app-additional-discount-detail-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="open()">{{ t.action }}</button> }`,
})
export class AdditionalDiscountDetailActionComponent {
  readonly reservation = input.required<Reservation>();
  protected readonly t = ADDITIONAL_DISCOUNT_DETAIL_COPY;
  private readonly allowed = inject(PortalCapabilities).canAuthorizeAdditionalDiscount();
  private readonly eligibility = inject(AdditionalDiscountEligibility);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly offered = computed(() => this.allowed && this.eligibility.isEligible(this.reservation()));
  protected open(): void { this.navigation?.open(ADDITIONAL_DISCOUNT_AREA, { reservation: this.reservation().id }); }
}

/** 10A block (RESERVATION_DETAIL_BLOCKS), read only for every role that reads the detail: the discount the service stored on the reservation. Nothing on 10C. */
@Component({
  selector: 'app-additional-discount-block', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!fresh() && reservation().additionalDiscount; as d) {
      <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.blockEyebrow }}</p><h2>{{ t.blockTitle }}</h2>
        <dl class="crp-additional-discount-list">
          <div><dt>{{ t.percentage }}</dt><dd>{{ percentage(d.basisPoints) }}%</dd></div><div><dt>{{ t.reason }}</dt><dd>{{ d.reason }}</dd></div>
          <div><dt>{{ t.previous }}</dt><dd>{{ money(d.previousValueCents) }}</dd></div><div><dt>{{ t.amount }}</dt><dd>{{ money(d.amountCents) }}</dd></div>
          <div><dt>{{ t.final }}</dt><dd>{{ money(reservation().quote.finalCents) }}</dd></div></dl></section>
    }
  `,
})
export class AdditionalDiscountBlockComponent {
  readonly reservation = input.required<Reservation>();
  readonly fresh = input(false);
  protected readonly t = ADDITIONAL_DISCOUNT_DETAIL_COPY;
  protected readonly money = formatCop; protected readonly percentage = pesosText;
}

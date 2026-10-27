import { ChangeDetectionStrategy, Component, Injector, Provider, inject, input } from '@angular/core';
import { PortalNavigation } from '../../portal-navigation';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { DISCOUNTS_PAGE_PANELS, RESERVATION_MODE_ACTIONS, contribute } from '../../shared/portal-slots';
import { ADDITIONAL_DISCOUNT_ENTRY_COPY } from '../current-discounts-copy';
import { ADDITIONAL_DISCOUNT_AREA, ADDITIONAL_DISCOUNT_MODE, AdditionalDiscountEligibility } from '../data/additional-discount-eligibility';

/** 12 (admin-descuentos.html), panel "Decisiones excepcionales / Descuento adicional": "Buscar una reserva" opens Reservas in mode. */
@Component({
  selector: 'app-additional-discount-search', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.panelEyebrow }}</p><h2>{{ t.panelTitle }}</h2></div></div>
    <p class="crp-operator-copy">{{ t.panelCopy }}</p>
    <button type="button" class="crp-operator-outline" (click)="navigation?.open('reservations', { mode: mode })">{{ t.search }}</button></section>`,
})
export class AdditionalDiscountSearchComponent {
  protected readonly t = ADDITIONAL_DISCOUNT_ENTRY_COPY;
  protected readonly mode = ADDITIONAL_DISCOUNT_MODE;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
}

/** 10 in mode: "Aplicar descuento" in the Acción cell of a reservation the port admits, that opens the screen with { reservation }. */
@Component({
  selector: 'app-additional-discount-row-action', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (offered()) { <span> · </span><button type="button" (click)="navigation?.open(area, { reservation: reservation().id })">{{ t.apply }}</button> }`,
})
export class AdditionalDiscountRowActionComponent {
  readonly reservation = input.required<{ readonly id: string; readonly status: string }>();
  readonly mode = input('');
  protected readonly t = ADDITIONAL_DISCOUNT_ENTRY_COPY;
  protected readonly area = ADDITIONAL_DISCOUNT_AREA;
  private readonly eligibility = inject(AdditionalDiscountEligibility);
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected offered(): boolean { return this.mode() === ADDITIONAL_DISCOUNT_MODE && this.eligibility.isEligible(this.reservation()); }
}

/** Only the Administrator (AC-CD.7) and only in a build that supplies the eligibility port. */
export const mayAuthorizeAdditionalDiscount = (injector: Injector): boolean =>
  injector.get(PortalCapabilities).canAuthorizeAdditionalDiscount() && injector.get(AdditionalDiscountEligibility, null) !== null;

/** Registered in mount-entry.ts: the search panel of Descuentos and the row action of Reservas in mode. */
export const ADDITIONAL_DISCOUNT_CONTRIBUTIONS: readonly Provider[] = [
  contribute(DISCOUNTS_PAGE_PANELS, { component: AdditionalDiscountSearchComponent, order: 10, isAvailable: mayAuthorizeAdditionalDiscount }),
  contribute(RESERVATION_MODE_ACTIONS, { component: AdditionalDiscountRowActionComponent, order: 10, isAvailable: mayAuthorizeAdditionalDiscount }),
];

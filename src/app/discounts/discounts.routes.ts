import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { DiscountsPageComponent } from './pages/discounts-page.component';
import { PortalCapabilities } from '../shared/portal-capabilities';
/** PROPUESTO (DP-PD1): provisional route; DP-09 denies optional reading roles. */
export const DISCOUNT_ROUTES: Routes = [{
  path: 'discounts', canMatch: [() => inject(PortalCapabilities).canManageDiscounts()],
  canActivate: [() => inject(PortalCapabilities).canManageDiscounts()], component: DiscountsPageComponent,
}];

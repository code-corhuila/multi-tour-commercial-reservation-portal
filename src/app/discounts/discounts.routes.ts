import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { ActorContext } from '../catalog/data/catalog-api.service';
import { canManageDiscounts } from './model/discount-rule';
import { DiscountsPageComponent } from './pages/discounts-page.component';
/** PROPUESTO (DP-PD1): provisional route; DP-09 denies optional reading roles. */
export const DISCOUNT_ROUTES: Routes = [{
  path: 'discounts', canMatch: [() => canManageDiscounts(inject(ActorContext))],
  canActivate: [() => canManageDiscounts(inject(ActorContext))], component: DiscountsPageComponent,
}];

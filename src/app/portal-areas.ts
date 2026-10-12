import { Injector, Type } from '@angular/core';
import { ActorContext } from './catalog/data/catalog-api.service';
import { ActorRole } from './catalog/model/catalog-item';
import { CatalogPageComponent } from './catalog/pages/catalog-page.component';
import { DiscountRulesSource } from './discounts/data/discount-rules-source';
import { canManageDiscounts } from './discounts/model/discount-rule';
import { DiscountsPageComponent } from './discounts/pages/discounts-page.component';
import { EstablishmentsPageComponent } from './establishments/pages/establishments-page.component';

/** One sidebar item of the operator shell and the page it shows. */
export interface PortalArea {
  readonly key: string;
  /** Spanish label of the authorized screen's menu. */
  readonly label: string;
  readonly component: Type<unknown>;
  /** Drawn only when this answers true; absent means always drawn. */
  readonly isAvailable?: (injector: Injector) => boolean;
}

/** The sidebar, in order. A new story appends ONE entry here; the shell is not edited. */
export const PORTAL_AREAS: readonly PortalArea[] = Object.freeze([
  { key: 'catalog', label: 'Catálogos', component: CatalogPageComponent },
  { key: 'establishments', label: 'Establecimientos', component: EstablishmentsPageComponent },
  {
    key: 'discounts', label: 'Descuentos', component: DiscountsPageComponent,
    // DP-09 role guard, and only in a build that supplies discount rules (no API contract for them yet).
    isAvailable: (injector) => canManageDiscounts(injector.get(ActorContext)) && injector.get(DiscountRulesSource, null) !== null,
  },
]);

/** The role line under the brand. */
export const ROLE_LABELS: Readonly<Record<ActorRole, string>> = Object.freeze({
  TENANT_ADMINISTRATOR: 'Administrador del tenant',
  OPERATIONAL_COLLABORATOR: 'Colaborador operativo',
  MANAGER: 'Gerente',
  ANALYST: 'Analista',
  ACCOUNTANT: 'Contador',
  READ_ONLY: 'Solo lectura',
});

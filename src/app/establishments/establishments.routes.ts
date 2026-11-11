import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { EstablishmentsPageComponent } from './pages/establishments-page.component';

/** Provisional single path for both types; the definitive route map is T-01. */
export const ESTABLISHMENT_ROUTES: Routes = [{
  path: 'establishments',
  canMatch: [() => inject(PortalCapabilities).canReadEstablishments()],
  canActivate: [() => inject(PortalCapabilities).canReadEstablishments()],
  component: EstablishmentsPageComponent,
}];

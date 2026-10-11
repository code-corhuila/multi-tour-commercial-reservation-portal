import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { ActorContext } from '../catalog/data/catalog-api.service';
import { canReadEstablishments } from './data/associated-establishments-source';
import { EstablishmentsPageComponent } from './pages/establishments-page.component';

/** Provisional single path for both types; the definitive route map is T-01. */
export const ESTABLISHMENT_ROUTES: Routes = [{
  path: 'establishments',
  canMatch: [() => canReadEstablishments(inject(ActorContext))],
  canActivate: [() => canReadEstablishments(inject(ActorContext))],
  component: EstablishmentsPageComponent,
}];

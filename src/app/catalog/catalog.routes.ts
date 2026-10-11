import { Routes } from '@angular/router';
import { CatalogPageComponent } from './pages/catalog-page.component';
import { ESTABLISHMENT_ROUTES } from '../establishments/establishments.routes';

/**
 * Exposed to the container as './routes' (see federation.config.js), which mounts it under its own prefix.
 *
 * A single route at the empty path is a provisional decision, so the catalog screen can be used now.
 * The definitive route map is task T-00, which waits for the domain decision on what a tour is:
 * paths copied from the discontinued monolith would be guessed paths, so none is declared until
 * that map is merged.
 */
export const CATALOG_ROUTES: Routes = [{ path: '', component: CatalogPageComponent }];

/** Combined provisional routes; the establishments route map remains pending T-01. */
export const PORTAL_ROUTES: Routes = [...CATALOG_ROUTES, ...ESTABLISHMENT_ROUTES];

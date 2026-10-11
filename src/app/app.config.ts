import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CATALOG_ROUTES } from './catalog/catalog.routes';
import { ActorContext } from './catalog/data/catalog-api.service';

/** Local development only: the catalog fails closed (READ_ONLY) unless an actor is provided. */
class DevelopmentAdministrator extends ActorContext {
  override readonly role = 'TENANT_ADMINISTRATOR' as const;
}

/**
 * Standalone runs only. Deliberately no HTTP client provider: inside the container
 * the portal runs in the container injector and receives the container client,
 * which already carries the interceptor. A client of its own would send requests
 * with no credential and no one would notice (norm 5.4.1, Annex H).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(CATALOG_ROUTES),
    // Standalone runs only: the Administrator is provided explicitly so local development still shows
    // every action. Inside the container the actor is provided by the container (T-09), not by this file.
    { provide: ActorContext, useValue: new DevelopmentAdministrator() },
  ],
};

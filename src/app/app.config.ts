import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CATALOG_ROUTES } from './catalog/catalog.routes';

/**
 * Standalone runs only. Deliberately no HTTP client provider: inside the container
 * the portal runs in the container injector and receives the container client,
 * which already carries the interceptor. A client of its own would send requests
 * with no credential and no one would notice (norm 5.4.1, Annex H).
 */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection(), provideRouter(CATALOG_ROUTES)],
};

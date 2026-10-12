import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from './app/catalog/data/catalog-api.service';
import { ActorRole } from './app/catalog/model/catalog-item';
import { DemoCatalogStore, DemoCatalogWriter, DemoEstablishmentsStore, DemoEstablishmentsWriter } from './app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from './app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from './app/establishments/data/associated-establishments-writer';
import { PORTAL_IDENTIFIER } from './app/hub/catalogs-hub.component';
import { PortalShellComponent } from './app/portal-shell.component';
import { MountProps } from './app/shell-contract';

const KNOWN_ROLES: readonly string[] = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT'];

/** DP-PT-06: one role is assumed, the first known one; anything else fails closed to READ_ONLY. */
export function roleOf(roles: readonly string[]): ActorRole {
  return (roles.find((role) => KNOWN_ROLES.includes(role)) as ActorRole | undefined) ?? 'READ_ONLY';
}

/** One <link> to the portal CSS, next to this module, however many times the portal is mounted. */
export function ensureStylesheet(): void {
  if (document.querySelector('link[data-crp-stylesheet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('commercial-reservation-portal.css', import.meta.url).href;
  link.dataset['crpStylesheet'] = '';
  document.head.append(link);
}

/** ADR-006 F4 contract. DEMO: sources are in memory; debt: replace them with sources over props.apiClient. */
export function mount(element: HTMLElement, props: MountProps): () => void {
  ensureStylesheet();
  element.classList.add('crp-root');
  const catalog = new DemoCatalogStore();
  const establishments = new DemoEstablishmentsStore();
  const actor = new (class extends ActorContext { override readonly role = roleOf(props.session.roles); })();
  let app: ApplicationRef | undefined;
  let cleaned = false;
  const release = () => {
    app?.destroy();  // no-op when never created
    element.replaceChildren();
    element.classList.remove('crp-root');
  };
  createApplication({
    providers: [
      provideZonelessChangeDetection(),
      { provide: ActorContext, useValue: actor },
      { provide: PORTAL_IDENTIFIER, useValue: props.identifier },
      { provide: CatalogItemsSource, useValue: catalog },
      { provide: CatalogItemsWriter, useValue: new DemoCatalogWriter(catalog) },
      { provide: AssociatedEstablishmentsSource, useValue: establishments },
      { provide: AssociatedEstablishmentsWriter, useValue: new DemoEstablishmentsWriter(establishments) },
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(PortalShellComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}

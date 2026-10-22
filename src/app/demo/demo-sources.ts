import { Provider } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CatalogItemsSource, CatalogItemsWriter } from '../catalog/data/catalog-api.service';
import { CatalogItem, CreateCatalogItemCommand, UpdateCatalogItemCommand, UpdateDescriptionCommand } from '../catalog/model/catalog-item';
import { AssociatedEstablishmentsSource } from '../establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter, RegisterEstablishmentCommand } from '../establishments/data/associated-establishments-writer';
import { AssociatedEstablishmentsEditor, UpdateEstablishmentCommand } from '../establishments/data/associated-establishments-editor';
import { AssociatedEstablishment, EstablishmentChange, EstablishmentChangeKind, EstablishmentFilters } from '../establishments/model/associated-establishment';
import { tenantWallTime } from '../shared/clock';

// DEMO: in-memory data so the shell can show the screens. Debt: replace with sources over props.apiClient.
const NOW = '2026-10-01T09:00:00Z';
const item = (n: number, serviceType: CatalogItem['serviceType'], commercialName: string, catalogStatus: CatalogItem['catalogStatus'], rate: number): CatalogItem => ({
  serviceId: `demo-svc-${n}`, serviceType, commercialName, catalogStatus, baseRateCents: rate, baseOperationalCostCents: Math.round(rate * 0.6),
  configuredCapacity: serviceType === 'TOUR' ? 12 : null, transportRequired: serviceType === 'TRANSPORTATION', highRisk: n === 3,
  validFrom: '2026-09-01', validTo: '2026-09-30', createdAt: NOW, updatedAt: NOW,
});
const place = (n: number, establishmentType: AssociatedEstablishment['establishmentType'], commercialName: string, associationStatus: AssociatedEstablishment['associationStatus'], commercialInformation: string): AssociatedEstablishment =>
  ({ associationId: `demo-est-${n}`, establishmentType, commercialName, commercialInformation, imageReference: `demo://image-${n}.jpg`, associationStatus,
    changes: [{ kind: 'REGISTERED', at: '2026-09-01T08:00:00', by: 'Fernanda Robayo (Administrador del tenant)' },
      ...(associationStatus === 'INACTIVE' ? [{ kind: 'INACTIVATED' as const, at: '2026-09-20T10:30:00', by: 'Fernanda Robayo (Administrador del tenant)' }] : [])] });

export class DemoCatalogStore extends CatalogItemsSource {
  private items: CatalogItem[] = [
    item(1, 'TOUR', 'Desierto de la Tatacoa al atardecer', 'ACTIVE', 18_000_000),
    item(2, 'TOUR', 'Ruta del café en Pitalito', 'ACTIVE', 14_500_000),
    item(3, 'TOUR', 'Canotaje en el Río Suaza', 'ACTIVE', 22_000_000),
    item(4, 'TRANSPORTATION', 'Traslado aeropuerto Neiva', 'ACTIVE', 9_000_000),
    item(5, 'TOUR', 'Caminata al Nevado del Huila', 'INACTIVE', 35_000_000),
  ];
  override list(): Observable<readonly CatalogItem[]> { return of([...this.items]); }
  replace(next: CatalogItem): Observable<CatalogItem> {
    this.items = this.items.map((it) => (it.serviceId === next.serviceId ? next : it));
    return of(next);
  }
  find(serviceId: string): CatalogItem { return this.items.find((it) => it.serviceId === serviceId)!; }
  add(created: CatalogItem): Observable<CatalogItem> { this.items = [...this.items, created]; return of(created); }
}

export class DemoCatalogWriter extends CatalogItemsWriter {
  private sequence = 100;
  constructor(private readonly store: DemoCatalogStore) { super(); }
  override create(command: CreateCatalogItemCommand): Observable<CatalogItem> {
    const { operationalRestrictions: _restrictions, route: _route, ...stored } = command;
    return this.store.add({ ...stored, serviceId: `demo-svc-${++this.sequence}`, catalogStatus: 'ACTIVE', createdAt: NOW, updatedAt: NOW });
  }
  override update(serviceId: string, command: UpdateCatalogItemCommand | UpdateDescriptionCommand): Observable<CatalogItem> {
    return this.store.replace({ ...this.store.find(serviceId), ...command });
  }
  override inactivate(serviceId: string): Observable<CatalogItem> { return this.store.replace({ ...this.store.find(serviceId), catalogStatus: 'INACTIVE' }); }
  override reactivate(serviceId: string): Observable<CatalogItem> { return this.store.replace({ ...this.store.find(serviceId), catalogStatus: 'ACTIVE' }); }
}

export class DemoEstablishmentsStore extends AssociatedEstablishmentsSource {
  items: AssociatedEstablishment[] = [
    place(1, 'HOTEL', 'Hotel Casa Neiva', 'ACTIVE', 'Habitaciones con vista al río Magdalena.'),
    place(2, 'HOTEL', 'Posada del Café', 'ACTIVE', 'Alojamiento rural entre cafetales.'),
    place(3, 'HOTEL', 'Hostal La Tatacoa', 'INACTIVE', 'Cerrado por remodelación.'),
    place(4, 'RESTAURANT', 'Sabores del Huila', 'ACTIVE', 'Cocina típica: asado huilense y tamal.'),
    place(5, 'RESTAURANT', 'Fogón del Desierto', 'ACTIVE', 'Cabrito al horno de barro.'),
    place(6, 'RESTAURANT', 'Café Altura', 'INACTIVE', 'Desayunos de montaña.'),
  ];
  override list(f: EstablishmentFilters): Observable<readonly AssociatedEstablishment[]> {
    return of(this.items.filter((e) => (!f.establishmentType || e.establishmentType === f.establishmentType) && (!f.associationStatus || e.associationStatus === f.associationStatus)));
  }
}

/** When and who the bitácora records: the demo clock and the label of the session role. */
export interface DemoEstablishmentsEnvironment { readonly now: () => number; readonly actor: () => string }

export class DemoEstablishmentsWriter extends AssociatedEstablishmentsWriter implements AssociatedEstablishmentsEditor {
  private sequence = 100;
  constructor(private readonly store: DemoEstablishmentsStore, private readonly env: DemoEstablishmentsEnvironment = { now: () => Date.now(), actor: () => 'Administrador del tenant (demo)' }) { super(); }
  /** One line of the bitácora; the instant is the tenant's wall clock (America/Bogota). */
  private change(kind: EstablishmentChangeKind): EstablishmentChange { return { kind, at: tenantWallTime(new Date(this.env.now()).toISOString()).slice(0, 19), by: this.env.actor() }; }
  override register(c: RegisterEstablishmentCommand): Observable<AssociatedEstablishment> {
    const created = { ...place(++this.sequence, c.establishmentType, c.commercialName, 'ACTIVE', c.commercialInformation), imageReference: `demo://${c.image.name}`, changes: [this.change('REGISTERED')] };
    this.store.items = [...this.store.items, created];
    return of(created);
  }
  private set(id: string, changes: Partial<AssociatedEstablishment>, kind: EstablishmentChangeKind): Observable<AssociatedEstablishment> {
    const current = this.store.items.find((e) => e.associationId === id)!;
    const next = { ...current, ...changes, changes: [...(current.changes ?? []), this.change(kind)] };
    this.store.items = this.store.items.map((e) => (e.associationId === id ? next : e));
    return of(next);
  }
  override inactivate(id: string): Observable<AssociatedEstablishment> { return this.set(id, { associationStatus: 'INACTIVE' }, 'INACTIVATED'); }
  override reactivate(id: string): Observable<AssociatedEstablishment> { return this.set(id, { associationStatus: 'ACTIVE' }, 'REACTIVATED'); }
  update(id: string, command: UpdateEstablishmentCommand): Observable<AssociatedEstablishment> { return this.set(id, { commercialName: command.commercialName, commercialInformation: command.commercialInformation }, 'UPDATED'); }
}

/** HU-COM-001 portal foundation of 2026-10-13: the module loads once per page, so every mount (a role switch) reads what the earlier mounts wrote. */
let pageStores: Provider[] | undefined;
export function oncePerPage(build: () => Provider[]): Provider[] { return (pageStores ??= build()); }

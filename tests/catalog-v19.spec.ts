import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { CATALOG_HUB_COPY } from '../src/app/catalog/catalog-hub-copy';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { CatalogHubPageComponent } from '../src/app/catalog/pages/catalog-hub-page.component';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { DemoCatalogStore, DemoEstablishmentsStore } from '../src/app/demo/demo-sources';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { ControllableCatalogItemsWriter } from './catalog-items-writer.double';
import { withoutComments } from './source-files';

// Amendment 2026-10-14 (mockup PDR v1.9) of HU-COM-001, tasks T-V19-1 to T-V19-3.
const validTour = (name: string, extra: Partial<CatalogItem> = {}): CatalogItem =>
  ({ ...itemNamed(name), baseRateCents: 129_900_000, validFrom: '2026-09-01', validTo: '2026-09-30', ...extra });

async function openList(items: readonly CatalogItem[], role: ActorRole = 'TENANT_ADMINISTRATOR', navigation?: PortalNavigation) {
  const source = new ControllableCatalogItemsSource();
  const writer = new ControllableCatalogItemsWriter();
  TestBed.configureTestingModule({ providers: [
    { provide: CatalogItemsSource, useValue: source }, { provide: CatalogItemsWriter, useValue: writer },
    { provide: ActorContext, useValue: actorAs(role) },
    ...(navigation ? [{ provide: PortalNavigation, useValue: navigation }] : []),
  ] });
  const fixture: ComponentFixture<CatalogPageComponent> = TestBed.createComponent(CatalogPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  source.requests[0].reply(items);
  await settle();
  const host = fixture.nativeElement as HTMLElement;
  return { host, ui: within(host), settle, writer };
}

describe('theTourListShowsTheMockupColumnsAndTheValidityRange', () => {
  it('draws the title, the panel texts and the columns of admin-gestionar-catalogo.html with the validity range', async () => {
    const { host, ui } = await openList([validTour('Tour destino ejemplo'), itemNamed('Bus Andino 01')].map((it, i) => (i ? { ...it, serviceType: 'TRANSPORTATION' as const } : it)));
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Gestionar catálogo de tours');
    expect(host.textContent).toContain('Tours y atractivos');
    expect(ui.getByRole('heading', { level: 2, name: 'Oferta, salidas y tarifas base' })).not.toBeNull();
    expect(host.textContent).toContain('Inactivar evita nuevas reservas; el historial existente se conserva y un tour inactivo puede reactivarse. Solo el Administrador del tenant crea, actualiza, inactiva y reactiva tours.');
    expect(Array.from(host.querySelectorAll('th')).map((th) => th.textContent)).toEqual(['Tour', 'Tarifa base', 'Vigencia', 'Estado', 'Acción']);
    const cells = Array.from(host.querySelectorAll('tbody tr td')).map((td) => td.textContent?.trim());
    expect(cells.slice(0, 4)).toEqual(['Tour destino ejemplo', '$1.299.000', '01 sep 2026 - 30 sep 2026', 'Activo']);
    // Transport belongs to operations-cost (A.2 row 2): its items leave this list.
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(host.textContent).not.toContain('Bus Andino 01');
  });

  it('offers "Crear tour" and "Volver a catálogos", which opens the hub through the navigation', async () => {
    const navigation = new PortalNavigation();
    navigation.register(['catalog', 'catalog-tours']);
    const { ui, settle } = await openList([validTour('Tour A')], 'TENANT_ADMINISTRATOR', navigation);
    expect(ui.getByRole('button', { name: 'Crear tour' })).not.toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Volver a catálogos' }));
    await settle();
    expect(navigation.selected()).toBe('catalog');
  });

  it('shows a tour the contract returned without validity as a dash instead of inventing dates', async () => {
    const { validFrom: _from, validTo: _to, ...bare } = itemNamed('Sin vigencia');
    const { host } = await openList([bare]);
    expect(host.querySelectorAll('tbody tr td')[2].textContent?.trim()).toBe('—');
  });
});

describe('inactivateAndReactivateUseTheMockupLabelsAndKeepTheTourInTheList', () => {
  it('labels the status actions "Inactivar" and "Reactivar" and never removes the row', async () => {
    const { ui, host, writer, settle } = await openList([validTour('Activo'), validTour('Dormido', { catalogStatus: 'INACTIVE' })]);
    expect(ui.getByRole('button', { name: 'Inactivar' })).not.toBeNull();
    expect(ui.getByRole('button', { name: 'Reactivar' })).not.toBeNull();
    fireEvent.click(ui.getByRole('button', { name: 'Inactivar' }));
    await settle();
    expect(writer.statusCalls).toHaveLength(1);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});

describe('noCatalogTextSaysDeactivateActivateOrService', () => {
  const BANNED = /\b(Desactivar|Activar|Servicio|servicio)\b/;

  it('keeps the words out of the list copy', () => {
    expect(JSON.stringify(CATALOG_COPY)).not.toMatch(BANNED);
  });

  it('keeps the words out of the list and of the open form', async () => {
    const { ui, host, settle } = await openList([validTour('Tour A')]);
    fireEvent.click(ui.getByRole('button', { name: 'Crear tour' }));
    await settle();
    expect(host.querySelector('form')).not.toBeNull();
    expect(host.textContent).not.toMatch(BANNED);
    expect(ui.getByRole('button', { name: 'Guardar tour' })).not.toBeNull();
  });

  it('keeps the words out of the form source', () => {
    expect(withoutComments(readFileSync('src/app/catalog/components/catalog-item-form.component.ts', 'utf8'))).not.toMatch(/Guardar servicio|Tipo de servicio|Datos del servicio/);
  });
});

describe('aValidityEndingBeforeItsStartIsRefusedBesideTheField', () => {
  it('shows the error beside "Vigencia hasta" when the person leaves it and sends nothing', async () => {
    const { ui, host, writer, settle } = await openList([validTour('Tour A')]);
    fireEvent.click(ui.getByRole('button', { name: 'Crear tour' }));
    await settle();
    fireEvent.input(ui.getByLabelText('Vigencia desde'), { target: { value: '2026-09-30' } });
    fireEvent.input(ui.getByLabelText('Vigencia hasta'), { target: { value: '2026-09-01' } });
    await settle();
    const end = ui.getByLabelText('Vigencia hasta');
    expect(end.getAttribute('aria-invalid')).toBe('true');
    expect(end.nextElementSibling?.getAttribute('role')).toBe('alert');
    expect(end.nextElementSibling?.textContent).toBe('La vigencia termina antes de empezar.');
    fireEvent.click(ui.getByRole('button', { name: 'Guardar tour' }));
    await settle();
    expect(writer.calls).toHaveLength(0);
    expect(host.querySelector('form')).not.toBeNull();
  });

  it('requires both dates of the validity', async () => {
    const { ui, writer, settle } = await openList([validTour('Tour A')]);
    fireEvent.click(ui.getByRole('button', { name: 'Crear tour' }));
    await settle();
    fireEvent.input(ui.getByLabelText('Nombre comercial'), { target: { value: 'Nuevo' } });
    fireEvent.input(ui.getByLabelText('Tarifa base'), { target: { value: '520000' } });
    fireEvent.input(ui.getByLabelText('Costo operativo base'), { target: { value: '300000' } });
    fireEvent.input(ui.getByLabelText('Capacidad configurada'), { target: { value: '10' } });
    fireEvent.click(ui.getByRole('button', { name: 'Guardar tour' }));
    await settle();
    expect(ui.getByLabelText('Vigencia desde').getAttribute('aria-invalid')).toBe('true');
    expect(ui.getByLabelText('Vigencia hasta').getAttribute('aria-invalid')).toBe('true');
    expect(writer.calls).toHaveLength(0);
  });

  it('sends the validity dates with the command once they are valid', async () => {
    const { ui, writer, settle } = await openList([validTour('Tour A')]);
    fireEvent.click(ui.getByRole('button', { name: 'Crear tour' }));
    await settle();
    fireEvent.input(ui.getByLabelText('Nombre comercial'), { target: { value: 'Nuevo' } });
    fireEvent.input(ui.getByLabelText('Tarifa base'), { target: { value: '520000' } });
    fireEvent.input(ui.getByLabelText('Costo operativo base'), { target: { value: '300000' } });
    fireEvent.input(ui.getByLabelText('Capacidad configurada'), { target: { value: '10' } });
    fireEvent.input(ui.getByLabelText('Vigencia desde'), { target: { value: '2026-09-01' } });
    fireEvent.input(ui.getByLabelText('Vigencia hasta'), { target: { value: '2026-09-30' } });
    fireEvent.click(ui.getByRole('button', { name: 'Guardar tour' }));
    await settle();
    expect(JSON.stringify(writer.calls[0])).toContain('"validFrom":"2026-09-01"');
    expect(JSON.stringify(writer.calls[0])).toContain('"validTo":"2026-09-30"');
  });
});

describe('theHubDrawsTheCardsOfTheRoleAndSkipsAnAreaWithoutAdapter', () => {
  async function openHub(role: ActorRole, areas: readonly string[]) {
    const navigation = new PortalNavigation();
    navigation.register(areas);
    const catalog = new DemoCatalogStore();
    TestBed.configureTestingModule({ providers: [
      { provide: CatalogItemsSource, useValue: catalog }, { provide: AssociatedEstablishmentsSource, useValue: new DemoEstablishmentsStore() },
      { provide: ActorContext, useValue: actorAs(role) }, { provide: PortalNavigation, useValue: navigation },
    ] });
    const fixture = TestBed.createComponent(CatalogHubPageComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { host, navigation, ui: within(host), cards: () => Array.from(host.querySelectorAll('article span')).map((s) => s.textContent) };
  }
  const ALL = ['catalog', 'catalog-tours', 'establishments'];

  it('draws the title, the note, "Nuevo servicio" and the cards of the Administrator that have an area', async () => {
    const { ui, cards, host } = await openHub('TENANT_ADMINISTRATOR', ALL);
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Catálogos');
    expect(host.textContent).toContain('El único servicio con reserva y cupo es el tour (por salida).');
    expect(ui.getByRole('button', { name: 'Nuevo servicio' })).not.toBeNull();
    // "Salidas" and "Transporte" have no area registered: they are absent, not dead links (DP-001-V19-1).
    expect(cards()).toEqual(['TOURS', 'ALOJAMIENTO ASOCIADO', 'RESTAURANTES ASOCIADOS']);
    expect(host.textContent).toContain('3 tours activos');
    expect(host.textContent).toContain('2 establecimientos activos');
  });

  it('draws a card for an area the container registers', async () => {
    const { cards } = await openHub('TENANT_ADMINISTRATOR', [...ALL, 'departures', 'transport']);
    expect(cards()).toEqual(['TOURS', 'SALIDAS', 'TRANSPORTE', 'ALOJAMIENTO ASOCIADO', 'RESTAURANTES ASOCIADOS']);
  });

  it('skips "Nuevo servicio" and the establishment cards for the Collaborator', async () => {
    const { ui, cards } = await openHub('OPERATIONAL_COLLABORATOR', ALL);
    expect(cards()).toEqual(['TOURS']);
    expect(ui.queryByRole('button', { name: 'Nuevo servicio' })).toBeNull();
  });

  it('opens the tour list, the establishments with their type, and the tour creation through the navigation', async () => {
    const { ui, navigation } = await openHub('TENANT_ADMINISTRATOR', ALL);
    fireEvent.click(ui.getByRole('button', { name: 'Ver tours' }));
    expect(navigation.selected()).toBe('catalog-tours');
    fireEvent.click(ui.getAllByRole('button', { name: 'Gestionar establecimientos' })[1]);
    expect(navigation.selected()).toBe('establishments');
    expect(navigation.params()).toEqual({ type: 'RESTAURANT' });
    fireEvent.click(ui.getByRole('button', { name: 'Nuevo servicio' }));
    expect(navigation.selected()).toBe('catalog-tours');
    expect(navigation.params()).toEqual({ create: '1' });
  });

  it('keeps its texts in the hub copy file', () => {
    expect(CATALOG_HUB_COPY.title).toBe('Catálogos');
  });
});

describe('theOperatorLandsOnReservationsAndTheMenuFollowsTheMockupOrder', () => {
  const operator = PORTAL_AREAS.filter((area) => !area.audience);

  it('lists the sidebar in the order of the mockup, opening on Reservas, without "Establecimientos"', () => {
    const menu = operator.filter((area) => area.menu !== false).map((area) => area.label);
    expect(menu[0]).toBe('Reservas');
    expect(menu).toEqual(['Reservas', 'Catálogos', 'Descuentos', 'Descuentos vigentes', 'Pagos', 'Notificaciones']);
  });

  it('registers the hub as Catálogos and the lists as sub-screens of it', () => {
    expect(operator.find((area) => area.key === 'catalog')?.component).toBe(CatalogHubPageComponent);
    expect(operator.find((area) => area.key === 'catalog-tours')).toMatchObject({ component: CatalogPageComponent, menu: false, parent: 'catalog' });
    expect(operator.find((area) => area.key === 'establishments')).toMatchObject({ menu: false, parent: 'catalog' });
  });
});

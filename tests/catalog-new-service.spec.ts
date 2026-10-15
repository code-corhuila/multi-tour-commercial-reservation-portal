import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogNewServicePageComponent } from '../src/app/catalog/pages/catalog-new-service-page.component';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { apiError, ControllableCatalogItemsWriter, ControllableIdempotencyKeys } from './catalog-items-writer.double';

// HU-COM-001, owner decision 2026-10-15: "Nuevo servicio" is its own screen, drawn as admin-nuevo-servicio.html of the mockup.
async function openScreen(role: ActorRole = 'TENANT_ADMINISTRATOR', areas: readonly string[] = ['catalog', 'catalog-tours', 'catalog-new-service', 'establishments']) {
  const writer = new ControllableCatalogItemsWriter();
  const navigation = new PortalNavigation();
  navigation.register(areas);
  TestBed.configureTestingModule({ providers: [
    { provide: CatalogItemsSource, useValue: new ControllableCatalogItemsSource() },
    { provide: CatalogItemsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: ActorContext, useValue: actorAs(role) },
    { provide: PortalNavigation, useValue: navigation },
  ] });
  const fixture: ComponentFixture<CatalogNewServicePageComponent> = TestBed.createComponent(CatalogNewServicePageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host = fixture.nativeElement as HTMLElement;
  const ui = within(host);
  const type = (label: string, value: string) => fireEvent.input(ui.getByLabelText(label), { target: { value } });
  const choose = (label: string, value: string) => fireEvent.change(ui.getByLabelText(label), { target: { value } });
  const click = async (name: string) => { fireEvent.click(ui.getByRole('button', { name })); await settle(); };
  const fillValid = () => {
    type('Nombre comercial', 'Cañón del Suaza');
    type('Tarifa base', '520000');
    type('Costo operativo base', '300000');
    type('Vigencia desde', '2026-09-01');
    type('Vigencia hasta', '2026-09-30');
  };
  return { host, ui, settle, writer, navigation, type, choose, click, fillValid };
}

const labelsOf = (card: Element) => Array.from(card.querySelectorAll('label')).map((label) => label.firstChild?.textContent?.trim());

describe('newServiceDrawsTheMockupScreen', () => {
  it('draws the kicker, the title and "Volver a catálogos", which opens the hub', async () => {
    const { host, ui, navigation, settle } = await openScreen();
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Catálogo operativo · Solo Administrador del tenant');
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Nuevo servicio');
    fireEvent.click(ui.getByRole('button', { name: 'Volver a catálogos' }));
    await settle();
    expect(navigation.selected()).toBe('catalog');
  });

  it('draws two stacked cards, 01 Producto and 02 Condiciones y publicación, with the mockup fields in order', async () => {
    const { host } = await openScreen();
    const cards = Array.from(host.querySelectorAll('section.crp-operator-panel'));
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.crp-operator-eyebrow')?.textContent).toBe('01. Producto');
    expect(cards[0].querySelector('h2')?.textContent).toBe('¿Qué vas a registrar?');
    expect(cards[0].textContent).toContain('Los hoteles y restaurantes son informativos: no se reservan, no tienen cupos, tarifas ni inventario.');
    expect(labelsOf(cards[0])).toEqual(['¿Qué quieres crear?', 'Nombre comercial', 'Tipo', 'Capacidad / cupo', 'Restricciones operativas', '¿Incluye transporte?']);
    expect(cards[1].querySelector('.crp-operator-eyebrow')?.textContent).toBe('02. Condiciones y publicación');
    expect(cards[1].querySelector('h2')?.textContent).toBe('Tarifa, vigencia e imagen');
    expect(labelsOf(cards[1])).toEqual(['Tarifa base', 'Política de cupo', 'Costo operativo base', 'Alto riesgo', 'Vigencia desde', 'Vigencia hasta']);
    expect(host.textContent).toContain('Completa la información para publicar el producto en el catálogo del cliente.');
  });

  it('offers the mockup options and placeholders', async () => {
    const { ui } = await openScreen();
    const options = (label: string) => Array.from(ui.getByLabelText(label).querySelectorAll('option')).map((option) => option.textContent);
    expect(options('¿Qué quieres crear?')).toEqual(['Tour o recurso de transporte', 'Establecimiento asociado (alojamiento o restaurante)']);
    expect(options('Tipo')).toEqual(['Tour o actividad', 'Transporte']);
    expect(options('Política de cupo')).toEqual(['Cupo apartado con el primer pago válido']);
    expect(options('¿Incluye transporte?')).toEqual(['No', 'Sí']);
    expect(ui.getByPlaceholderText('Nombre del producto')).not.toBeNull();
    expect(ui.getByPlaceholderText('Opcional')).not.toBeNull();
    expect(ui.getByPlaceholderText('Opcional: condiciones que limitan la disponibilidad')).not.toBeNull();
    expect(ui.getByRole('button', { name: 'Cancelar' })).not.toBeNull();
    expect(ui.getByRole('button', { name: 'Guardar y publicar' })).not.toBeNull();
  });

  it('turns the form into a transport one: "Trayecto" and "Tarifa por persona" instead of the transport question', async () => {
    const { ui, choose, settle } = await openScreen();
    choose('Tipo', 'transport');
    await settle();
    expect(ui.queryByLabelText('¿Incluye transporte?')).toBeNull();
    expect(ui.getByLabelText('Trayecto (origen - destino o descripción)')).not.toBeNull();
    expect(ui.getByLabelText('Tarifa por persona')).not.toBeNull();
    expect(ui.queryByLabelText('Tarifa base')).toBeNull();
  });

  it('sends the person to the establishments form of HU-COM-002 when they choose an associated establishment', async () => {
    const { ui, navigation, choose, settle } = await openScreen();
    choose('¿Qué quieres crear?', 'establishment');
    await settle();
    expect(navigation.selected()).toBe('establishments');
    expect(navigation.params()).toEqual({ type: 'HOTEL' });
    expect((ui.getByLabelText('¿Qué quieres crear?') as HTMLSelectElement).value).toBe('operational');
  });

  it('disables the establishment option while the build has no establishments area', async () => {
    const { ui } = await openScreen('TENANT_ADMINISTRATOR', ['catalog', 'catalog-new-service']);
    const option = Array.from(ui.getByLabelText('¿Qué quieres crear?').querySelectorAll('option')).find((each) => each.value === 'establishment');
    expect(option?.disabled).toBe(true);
  });

  it('keeps the words of the old copy out of the screen', async () => {
    const { host } = await openScreen();
    expect(host.textContent).not.toMatch(/\b(Desactivar|Activar)\b/);
  });
});

describe('newServiceCreatesWithTheSpecFieldsKept', () => {
  it('marks every missing field beside itself, focuses the first one and sends nothing', async () => {
    const { ui, writer, click } = await openScreen();
    await click('Guardar y publicar');
    expect(writer.calls).toHaveLength(0);
    for (const label of ['Nombre comercial', 'Tarifa base', 'Costo operativo base', 'Vigencia desde', 'Vigencia hasta']) {
      const field = ui.getByLabelText(label);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(document.getElementById(field.getAttribute('aria-describedby') ?? '')?.getAttribute('role')).toBe('alert');
    }
    expect(ui.getByLabelText('Capacidad / cupo').getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(ui.getByLabelText('Nombre comercial'));
  });

  it('refuses a validity that ends before it starts', async () => {
    const { ui, writer, type, click, fillValid } = await openScreen();
    fillValid();
    type('Vigencia hasta', '2026-08-01');
    await click('Guardar y publicar');
    expect(ui.getByLabelText('Vigencia hasta').getAttribute('aria-invalid')).toBe('true');
    expect(writer.calls).toHaveLength(0);
  });

  it('creates a tour with its cost, risk, transport, capacity and restrictions, once, with one Idempotency-Key, and opens the tour list', async () => {
    const { ui, writer, navigation, type, choose, click, settle, fillValid } = await openScreen();
    fillValid();
    type('Capacidad / cupo', '12');
    type('Restricciones operativas', 'Solo mayores de 12 años');
    choose('¿Incluye transporte?', 'si');
    choose('Alto riesgo', 'si');
    await settle();
    fireEvent.click(ui.getByRole('button', { name: 'Guardar y publicar' }));
    fireEvent.click(ui.getByRole('button', { name: 'Guardar y publicar' }));
    await settle();
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]).toMatchObject({
      kind: 'create', idempotencyKey: 'test-key-0000',
      command: {
        serviceType: 'TOUR', commercialName: 'Cañón del Suaza', baseRateCents: 52_000_000, baseOperationalCostCents: 30_000_000,
        configuredCapacity: 12, transportRequired: true, highRisk: true, validFrom: '2026-09-01', validTo: '2026-09-30',
        operationalRestrictions: 'Solo mayores de 12 años',
      },
    });
    writer.calls[0].reply(itemNamed('Cañón del Suaza'));
    await settle();
    expect(navigation.selected()).toBe('catalog-tours');
  });

  it('leaves the capacity empty as null and the risk and transport as No', async () => {
    const { writer, click, fillValid } = await openScreen();
    fillValid();
    await click('Guardar y publicar');
    expect(writer.calls[0]).toMatchObject({ command: { configuredCapacity: null, transportRequired: false, highRisk: false } });
  });

  it('creates a transport resource as TRANSPORTATION with its route', async () => {
    const { writer, type, choose, click, settle, fillValid } = await openScreen();
    choose('Tipo', 'transport');
    await settle();
    fillValid();
    type('Tarifa por persona', '40000');
    type('Trayecto (origen - destino o descripción)', 'Neiva - Tatacoa');
    await click('Guardar y publicar');
    expect(writer.calls[0]).toMatchObject({ command: { serviceType: 'TRANSPORTATION', baseRateCents: 4_000_000, route: 'Neiva - Tatacoa' } });
  });

  it('keeps what the person typed when the service refuses, and shows the reason beside the field', async () => {
    const { ui, writer, click, settle, fillValid } = await openScreen();
    fillValid();
    await click('Guardar y publicar');
    writer.calls[0].fail(apiError({ userMessage: 'La capacidad es menor a los cupos apartados.', details: [{ field: 'configuredCapacity', message: 'Menor a los cupos apartados.' }] }));
    await settle();
    expect((ui.getByLabelText('Nombre comercial') as HTMLInputElement).value).toBe('Cañón del Suaza');
    expect(ui.getByLabelText('Capacidad / cupo').getAttribute('aria-invalid')).toBe('true');
    expect(ui.getByText('La capacidad es menor a los cupos apartados.')).not.toBeNull();
  });

  it('cancels back to the hub without sending anything', async () => {
    const { writer, navigation, click } = await openScreen();
    await click('Cancelar');
    expect(navigation.selected()).toBe('catalog');
    expect(writer.calls).toHaveLength(0);
  });

  it('shows only the denial to whoever may not register', async () => {
    const { host, ui } = await openScreen('OPERATIONAL_COLLABORATOR');
    expect(ui.getByRole('alert').textContent).toBe(CATALOG_COPY.denied);
    expect(host.querySelector('form')).toBeNull();
  });
});

describe('newServiceIsAnAreaOfTheCatalog', () => {
  it('registers "catalog-new-service" under Catálogos, out of the menu', () => {
    expect(PORTAL_AREAS.find((area) => area.key === 'catalog-new-service')).toMatchObject({ component: CatalogNewServicePageComponent, menu: false, parent: 'catalog' });
  });
});

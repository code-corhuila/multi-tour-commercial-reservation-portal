import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG_ROUTES } from '../src/app/catalog/catalog.routes';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { apiError, ControllableCatalogItemsWriter, ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { withoutComments } from './source-files';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';

/** Opens the page; with `items` the first list request is answered, without them it stays loading. */
async function openPage(items?: readonly CatalogItem[]) {
  const source = new ControllableCatalogItemsSource();
  const writer = new ControllableCatalogItemsWriter();
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogItemsSource, useValue: source },
      { provide: CatalogItemsWriter, useValue: writer },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    ],
  });
  const fixture: ComponentFixture<CatalogPageComponent> = TestBed.createComponent(CatalogPageComponent);
  const host = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  if (items) {
    source.requests[0].reply(items);
    await settle();
  }
  const ui = within(host);
  const button = (name: string) => ui.getByRole('button', { name }) as HTMLButtonElement;
  const queryButton = (name: string) => ui.queryByRole('button', { name });
  const rows = () => Array.from<HTMLElement>(host.querySelectorAll('tbody tr'));
  const rowOf = (name: string) => rows().find((row) => row.textContent?.includes(name)) as HTMLElement;
  const editOf = (name: string) => within(rowOf(name)).getByRole('button', { name: CATALOG_COPY.edit }) as HTMLButtonElement;
  const type = (label: string, value: string) => fireEvent.input(ui.getByLabelText(label), { target: { value } });
  const typed = (label: string) => (ui.getByLabelText(label) as HTMLInputElement).value;
  const fillAll = (name = 'Canyon walk') => {
    type('Nombre comercial', name);
    type('Tarifa base', '12.50');
    type('Costo operativo base', '7');
    type('Capacidad configurada', '18');
    type('Vigencia desde', '2026-09-01');
    type('Vigencia hasta', '2026-09-30');
  };
  const click = async (element: HTMLElement) => {
    fireEvent.click(element);
    await settle();
  };
  const formsOpen = () => host.querySelectorAll('app-catalog-item-form').length;
  return { fixture, source, writer, host, settle, ui, button, queryButton, rows, rowOf, editOf, type, typed, fillAll, click, formsOpen };
}

const renamed: CatalogItem = { ...itemNamed('Alpha'), commercialName: 'Canyon walk', baseRateCents: 1250, baseOperationalCostCents: 700, configuredCapacity: 18 };

describe('listShowsTheNewValuesWithoutAReload', () => {
  it('shows the new values of an edited item in its own place without asking the source again', async () => {
    const page = await openPage([itemNamed('Alpha'), itemNamed('Beta')]);
    await page.click(page.editOf('Alpha'));
    expect(page.typed('Nombre comercial')).toBe('Alpha');
    page.type('Nombre comercial', 'Alpha renamed');
    page.type('Tarifa base', '20');
    page.type('Capacidad configurada', '18'); // a tour needs it, and Alpha had none
    await page.click(page.button('Guardar tour'));
    expect(page.writer.calls[0]).toMatchObject({
      kind: 'update',
      serviceId: itemNamed('Alpha').serviceId,
      command: { commercialName: 'Alpha renamed', baseRateCents: 2000, configuredCapacity: 18 },
    });
    page.writer.calls[0].reply({ ...itemNamed('Alpha'), commercialName: 'Alpha renamed', baseRateCents: 2000, configuredCapacity: 18 });
    await page.settle();

    expect(page.rows()).toHaveLength(2);
    expect(page.rows()[0].textContent).toContain('Alpha renamed');
    expect(page.rows()[1].textContent).toContain('Beta');
    expect(page.source.requests).toHaveLength(1);
    expect(page.formsOpen()).toBe(0);
  });
});

describe('newItemFromTheEmptyState', () => {
  it('offers New item in the data state but not while loading or after an error', async () => {
    const loading = await openPage();
    expect(loading.queryButton(CATALOG_COPY.newItem)).toBeNull();
    TestBed.resetTestingModule();

    const failed = await openPage();
    failed.source.requests[0].fail();
    await failed.settle();
    expect(failed.host.querySelector('[data-state="error"]')).not.toBeNull();
    expect(failed.queryButton(CATALOG_COPY.newItem)).toBeNull();
    TestBed.resetTestingModule();

    const data = await openPage([itemNamed('Alpha')]);
    expect(data.queryButton(CATALOG_COPY.newItem)).not.toBeNull();
  });
});

describe('oneFormAtATime', () => {
  it('keeps a single form when one Edit follows another, with the values of the last one', async () => {
    const page = await openPage([itemNamed('Alpha'), itemNamed('Beta')]);
    await page.click(page.editOf('Alpha'));
    expect(page.formsOpen()).toBe(1);
    expect(page.typed('Nombre comercial')).toBe('Alpha');

    await page.click(page.editOf('Beta'));
    expect(page.formsOpen()).toBe(1);
    expect(page.typed('Nombre comercial')).toBe('Beta');
  });

  it('closes the form on Cancel without calling the writer', async () => {
    const page = await openPage([itemNamed('Alpha')]);
    await page.click(page.editOf('Alpha'));
    page.type('Nombre comercial', 'Never saved either');
    await page.click(page.button('Cancelar'));
    expect(page.formsOpen()).toBe(0);

    expect(page.writer.calls).toHaveLength(0);
    expect(page.rows()[0].textContent).toContain('Alpha');
    expect(page.source.requests).toHaveLength(1);
  });
});

describe('aRefusedSaveKeepsTheFormAndTheList', () => {
  it('leaves the form open with what was typed, shows the reason and leaves the list as it was', async () => {
    const page = await openPage([itemNamed('Alpha'), itemNamed('Beta')]);
    await page.click(page.editOf('Alpha'));
    page.fillAll('Canyon walk');
    await page.click(page.button('Guardar tour'));
    page.writer.calls[0].fail(apiError({ userMessage: 'The change was refused.' }));
    await page.settle();

    expect(page.formsOpen()).toBe(1);
    expect(page.typed('Nombre comercial')).toBe('Canyon walk');
    expect(page.typed('Tarifa base')).toBe('12.50');
    expect(page.typed('Costo operativo base')).toBe('7');
    expect(page.typed('Capacidad configurada')).toBe('18');
    expect(page.host.textContent).toContain('The change was refused.');
    expect(page.rows().map((row) => row.textContent)).toEqual([expect.stringContaining('Alpha'), expect.stringContaining('Beta')]);
    expect(page.source.requests).toHaveLength(1);
  });
});

describe('theCatalogRoute', () => {
  it('is a single route at the empty path that shows the catalog page', () => {
    expect(CATALOG_ROUTES).toHaveLength(1);
    expect(CATALOG_ROUTES[0].path).toBe('');
    expect(CATALOG_ROUTES[0].component).toBe(CatalogPageComponent);
  });

  it('carries no forbidden word in its code or its path', () => {
    const forbidden = /delete|remove|erase|destroy|borrar|eliminar|suprimir/i;
    const source = withoutComments(readFileSync('src/app/catalog/catalog.routes.ts', 'utf8'));
    expect(source).not.toMatch(forbidden);
    expect(CATALOG_ROUTES[0].path ?? '').not.toMatch(forbidden);
  });
});

describe('nothingReplacesTheFormWhileItSaves', () => {
  /** A page with a registration in flight: the form is filled, Save was pressed, the writer has not answered. */
  async function savingPage() {
    const page = await openPage([itemNamed('Alpha'), itemNamed('Beta')]);
    await page.click(page.editOf('Alpha'));
    page.fillAll('Canyon walk');
    await page.click(page.button('Guardar tour'));
    expect(page.writer.calls).toHaveLength(1);
    return page;
  }

  it('disables New item and every Edit while a save is pending', async () => {
    const page = await savingPage();
    expect(page.button(CATALOG_COPY.newItem).disabled).toBe(true);
    expect(page.editOf('Alpha').disabled).toBe(true);
    expect(page.editOf('Beta').disabled).toBe(true);
  });

  it('lets the save in flight finish and list its item although another form was tried', async () => {
    const page = await savingPage();
    await page.click(page.button(CATALOG_COPY.newItem));
    await page.click(page.editOf('Beta'));
    expect(page.formsOpen()).toBe(1);
    expect(page.typed('Nombre comercial')).toBe('Canyon walk');

    page.writer.calls[0].reply(renamed);
    await page.settle();
    expect(page.rows()[0].textContent).toContain('Canyon walk');
    expect(page.rows()).toHaveLength(2);
    expect(page.writer.calls).toHaveLength(1);
  });

  it('keeps the form and its save when the list is reloaded meanwhile, and shows the item once both answer', async () => {
    const page = await savingPage();
    page.fixture.componentInstance.reload();
    await page.settle();
    expect(page.formsOpen()).toBe(1);

    page.writer.calls[0].reply(renamed);
    await page.settle();
    page.source.requests[1].reply([renamed, itemNamed('Beta')]);
    await page.settle();
    expect(page.formsOpen()).toBe(0);
    expect(page.rows()).toHaveLength(2);
    expect(page.rows()[0].textContent).toContain('Canyon walk');
  });

  it('enables New item and Edit again once the save ends, by success or by refusal', async () => {
    const refused = await savingPage();
    refused.writer.calls[0].fail(apiError());
    await refused.settle();
    expect(refused.formsOpen()).toBe(1);
    expect(refused.button(CATALOG_COPY.newItem).disabled).toBe(false);
    expect(refused.editOf('Alpha').disabled).toBe(false);
    TestBed.resetTestingModule();

    const saved = await savingPage();
    saved.writer.calls[0].reply(renamed);
    await saved.settle();
    expect(saved.button(CATALOG_COPY.newItem).disabled).toBe(false);
    expect(saved.editOf('Canyon walk').disabled).toBe(false);
  });
});

describe('aRowOffersItsStatusActionPlusEdit', () => {
  it('offers exactly one status action and Edit on each row', async () => {
    const page = await openPage([itemNamed('Alpha'), { ...itemNamed('Beta'), catalogStatus: 'INACTIVE' }]);
    const labels = (name: string) => Array.from(page.rowOf(name).querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels('Alpha')).toEqual([CATALOG_COPY.inactivate, CATALOG_COPY.edit]);
    expect(labels('Beta')).toEqual([CATALOG_COPY.reactivate, CATALOG_COPY.edit]);
  });
});

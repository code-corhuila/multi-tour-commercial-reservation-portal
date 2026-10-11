import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ActorContext, CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { apiError, ControllableCatalogItemsWriter } from './catalog-items-writer.double';

const inactive = (item: CatalogItem): CatalogItem => ({ ...item, catalogStatus: 'INACTIVE' });

/** Opens the page with a list already loaded; the first item is active and the second is inactive. */
async function openList(items: readonly CatalogItem[] = [itemNamed('Alpha'), inactive(itemNamed('Beta'))]) {
  const source = new ControllableCatalogItemsSource();
  const writer = new ControllableCatalogItemsWriter();
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogItemsSource, useValue: source },
      { provide: CatalogItemsWriter, useValue: writer },
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
    ],
  });
  const fixture: ComponentFixture<CatalogPageComponent> = TestBed.createComponent(CatalogPageComponent);
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  source.requests[0].reply(items);
  await settle();
  const rows = () => Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('li'));
  const rowOf = (name: string) => rows().find((row) => row.textContent?.includes(name)) as HTMLElement;
  const buttonOf = (name: string) => rowOf(name).querySelector('button') as HTMLButtonElement;
  return { fixture, source, writer, settle, rows, rowOf, buttonOf, items };
}

describe('inactivatedItemStaysInTheListAsInactive', () => {
  it('shows the item as INACTIVE, still listed, and leaves the other rows alone', async () => {
    const { writer, settle, rows, rowOf, buttonOf, source, items } = await openList();
    buttonOf('Alpha').click();
    await settle();
    expect(writer.statusCalls).toHaveLength(1);
    expect(writer.statusCalls[0]).toMatchObject({ kind: 'inactivate', serviceId: items[0].serviceId });

    writer.statusCalls[0].reply(inactive(items[0]));
    await settle();

    expect(rows()).toHaveLength(2);
    expect(rowOf('Alpha').textContent).toContain('INACTIVE');
    expect(buttonOf('Alpha').textContent?.trim()).toBe('Reactivate');
    expect(rowOf('Beta').textContent).toContain('INACTIVE');
    expect(source.requests).toHaveLength(1);
  });
});

describe('reactivatedItemShowsAsActive', () => {
  it('shows the item as ACTIVE again with the inactivate action', async () => {
    const { writer, settle, rows, rowOf, buttonOf, items } = await openList();
    buttonOf('Beta').click();
    await settle();
    expect(writer.statusCalls[0]).toMatchObject({ kind: 'reactivate', serviceId: items[1].serviceId });

    writer.statusCalls[0].reply({ ...items[1], catalogStatus: 'ACTIVE' });
    await settle();

    expect(rows()).toHaveLength(2);
    expect(rowOf('Beta').textContent).toContain('ACTIVE');
    expect(rowOf('Beta').textContent).not.toContain('INACTIVE');
    expect(buttonOf('Beta').textContent?.trim()).toBe('Inactivate');
  });
});

describe('oneStatusActionPerItem', () => {
  it('offers only Inactivate on an active item and only Reactivate on an inactive one', async () => {
    const { rowOf } = await openList();
    expect(Array.from(rowOf('Alpha').querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Inactivate', 'Edit']);
    expect(Array.from(rowOf('Beta').querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Reactivate', 'Edit']);
  });

  it('sends one request for a double click, disables the button while it pends and enables it after', async () => {
    const { writer, settle, buttonOf, items } = await openList();
    const button = buttonOf('Alpha');
    button.click();
    button.click();
    await settle();
    expect(writer.statusCalls).toHaveLength(1);
    expect(buttonOf('Alpha').disabled).toBe(true);
    expect(buttonOf('Beta').disabled).toBe(false);

    writer.statusCalls[0].reply(inactive(items[0]));
    await settle();
    expect(buttonOf('Alpha').disabled).toBe(false);
  });

  it('sends no Idempotency-Key: the writer receives the service id and nothing else', async () => {
    const { writer, settle, buttonOf } = await openList();
    buttonOf('Alpha').click();
    await settle();
    expect(writer.statusCalls[0].argumentCount).toBe(1);
  });
});

describe('aRefusedStatusChangeShowsItsReasonBesideTheItem', () => {
  it('shows the userMessage beside the item, keeps the visible condition and does not reload', async () => {
    const { writer, settle, rowOf, buttonOf, source, rows } = await openList();
    buttonOf('Alpha').click();
    await settle();
    writer.statusCalls[0].fail(apiError({ status: 422, userMessage: 'That transition is not allowed.' }));
    await settle();

    const alert = rowOf('Alpha').querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('That transition is not allowed.');
    expect(rowOf('Alpha').textContent).toContain('ACTIVE');
    expect(rowOf('Alpha').textContent).not.toContain('INACTIVE');
    expect(rowOf('Beta').querySelector('[role="alert"]')).toBeNull();
    expect(buttonOf('Alpha').disabled).toBe(false);
    expect(rows()).toHaveLength(2);
    expect(source.requests).toHaveLength(1);
  });

  it('shows a generic message beside the item when the failure has no ApiError shape', async () => {
    const { writer, settle, rowOf, buttonOf } = await openList();
    buttonOf('Alpha').click();
    await settle();
    writer.statusCalls[0].fail(new Error('socket closed'));
    await settle();
    const alert = rowOf('Alpha').querySelector('[role="alert"]');
    expect(alert?.textContent?.trim()).toBe('The request failed.');
    expect(rowOf('Alpha').textContent).not.toContain('socket closed');
  });

  it('clears the previous reason when the action is tried again', async () => {
    const { writer, settle, rowOf, buttonOf } = await openList();
    buttonOf('Alpha').click();
    await settle();
    writer.statusCalls[0].fail(apiError({ userMessage: 'Refused once.' }));
    await settle();
    buttonOf('Alpha').click();
    await settle();
    expect(rowOf('Alpha').querySelector('[role="alert"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { CatalogItemFormComponent } from '../src/app/catalog/components/catalog-item-form.component';
import { CatalogItemsWriter, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { itemNamed } from './catalog-items-source.double';
import { apiError, ControllableCatalogItemsWriter, ControllableIdempotencyKeys } from './catalog-items-writer.double';

/** Opens the form; with `controlKeys` false it uses the real generator that ships with the portal. */
async function openForm(options: { item?: CatalogItem; controlKeys?: boolean; keys?: ControllableIdempotencyKeys } = {}) {
  const writer = new ControllableCatalogItemsWriter();
  const keys = options.keys ?? new ControllableIdempotencyKeys();
  const view = await render(CatalogItemFormComponent, {
    providers: [
      { provide: CatalogItemsWriter, useValue: writer },
      ...(options.controlKeys === false ? [] : [{ provide: IdempotencyKeys, useValue: keys }]),
    ],
    inputs: options.item ? { item: options.item } : {},
  });
  const fill = () => {
    fireEvent.input(screen.getByLabelText('Commercial name'), { target: { value: 'Canyon walk' } });
    fireEvent.input(screen.getByLabelText('Base rate'), { target: { value: '12.50' } });
    fireEvent.input(screen.getByLabelText('Base operational cost'), { target: { value: '7' } });
    fireEvent.input(screen.getByLabelText('Configured capacity'), { target: { value: '18' } });
  };
  const settle = async () => {
    await view.fixture.whenStable();
    view.fixture.detectChanges();
  };
  const save = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await settle();
  };
  return { writer, keys, view, fill, save, settle };
}

const createKeys = (writer: ControllableCatalogItemsWriter) =>
  writer.calls.flatMap((call) => (call.kind === 'create' ? [call.idempotencyKey] : []));

describe('doubleSubmitSendsOneIdempotencyKey', () => {
  it('sends one create with one key when the same intention is submitted twice', async () => {
    const { writer, keys, view, fill } = await openForm();
    fill();
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(createKeys(writer)).toEqual([keys.generated[0]]);
  });

  it('reuses the same key when the person retries after a refusal', async () => {
    const { writer, fill, save, settle } = await openForm();
    fill();
    await save();
    writer.calls[0].fail(apiError());
    await settle();
    await save();
    const sent = createKeys(writer);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toBe(sent[0]);
  });

  it('keeps the key when local validation stops the first attempt', async () => {
    const { writer, keys, fill, save } = await openForm();
    await save();
    expect(writer.calls).toHaveLength(0);
    fill();
    await save();
    expect(createKeys(writer)).toEqual([keys.generated[0]]);
  });

  it('uses a new key for the next registration after a successful one', async () => {
    const { writer, fill, save, settle } = await openForm();
    fill();
    await save();
    writer.calls[0].reply(itemNamed('Canyon walk'));
    await settle();
    fill();
    await save();
    const sent = createKeys(writer);
    expect(sent).toHaveLength(2);
    expect(sent[1]).not.toBe(sent[0]);
  });

  it('uses a different key every time the form is opened again', async () => {
    const shared = new ControllableIdempotencyKeys();
    const first = await openForm({ keys: shared });
    first.fill();
    await first.save();
    TestBed.resetTestingModule();
    const second = await openForm({ keys: shared });
    second.fill();
    await second.save();
    expect(createKeys(first.writer)).toHaveLength(1);
    expect(createKeys(second.writer)).toHaveLength(1);
    expect(createKeys(second.writer)[0]).not.toBe(createKeys(first.writer)[0]);
  });

  it('never repeats a key with the generator that ships with the portal', async () => {
    const first = await openForm({ controlKeys: false });
    first.fill();
    await first.save();
    TestBed.resetTestingModule();
    const second = await openForm({ controlKeys: false });
    second.fill();
    await second.save();
    expect(createKeys(second.writer)[0]).not.toBe(createKeys(first.writer)[0]);
  });

  it('does not send a key when editing, and asks for none to be made', async () => {
    const item = { ...itemNamed('Old name'), configuredCapacity: 18 };
    const { writer, keys, save } = await openForm({ item });
    await save();
    expect(writer.calls[0].kind).toBe('update');
    expect(writer.calls[0]).not.toHaveProperty('idempotencyKey');
    expect(keys.generated).toEqual([]);
  });

  it('sends a key of 8 to 128 characters, also with the generator that ships with the portal', async () => {
    const { writer, fill, save } = await openForm({ controlKeys: false });
    fill();
    await save();
    const [key] = createKeys(writer);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

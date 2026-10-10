import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItemFormComponent } from '../src/app/catalog/components/catalog-item-form.component';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { apiError, ControllableCatalogItemsWriter } from './catalog-items-writer.double';
import { itemNamed } from './catalog-items-source.double';

async function openForm(item?: CatalogItem) {
  const writer = new ControllableCatalogItemsWriter();
  const saved: CatalogItem[] = [];
  const view = await render(CatalogItemFormComponent, {
    providers: [{ provide: CatalogItemsWriter, useValue: writer }],
    inputs: item ? { item } : {},
    on: { saved: (value: CatalogItem) => saved.push(value) },
  });
  const type = (label: string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });
  const fillAll = (overrides: Partial<Record<string, string>> = {}) => {
    type('Commercial name', overrides['name'] ?? 'Canyon walk');
    type('Base rate', overrides['rate'] ?? '12.50');
    type('Base operational cost', overrides['cost'] ?? '7');
    type('Configured capacity', overrides['capacity'] ?? '18');
  };
  const settle = async () => {
    await view.fixture.whenStable();
    view.fixture.detectChanges();
  };
  const save = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await view.fixture.whenStable();
    view.fixture.detectChanges();
  };
  /** The text of the element that `aria-describedby` points to from a field. */
  const describedBy = (label: string): string => {
    const ids = (screen.getByLabelText(label).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ');
  };
  return { writer, saved, view, type, fillAll, save, settle, describedBy };
}

describe('marksTheMissingFieldBesideItAndDisablesSubmit', () => {
  it('marks a missing base rate beside its field and sends no request', async () => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ rate: '' });
    await save();
    expect(screen.getByLabelText('Base rate').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Base rate')).not.toBe('');
    expect(screen.getByLabelText('Base operational cost').getAttribute('aria-invalid')).not.toBe('true');
    expect(writer.calls).toHaveLength(0);
  });

  it('marks a missing base operational cost beside its field and sends no request', async () => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ cost: '' });
    await save();
    expect(screen.getByLabelText('Base operational cost').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Base operational cost')).not.toBe('');
    expect(writer.calls).toHaveLength(0);
  });

  it.each(['12,5', 'abc'])('marks the money text %j as invalid, because parseMoney refuses it', async (text) => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ rate: text });
    await save();
    expect(screen.getByLabelText('Base rate').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Base rate')).not.toBe('');
    expect(writer.calls).toHaveLength(0);
  });

  it('shows each error as an alert that sits in the form beside its field, not in a banner', async () => {
    const { fillAll, save } = await openForm();
    fillAll({ rate: '', name: '' });
    await save();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    const field = screen.getByLabelText('Base rate');
    expect(alerts.some((alert) => alert.previousElementSibling === field)).toBe(true);
  });

  it('gives every field a label', async () => {
    await openForm();
    for (const label of ['Commercial name', 'Service type', 'Base rate', 'Base operational cost', 'Configured capacity', 'Transport required', 'High risk']) {
      expect(screen.getByLabelText(label)).not.toBeNull();
    }
  });
});

describe('theSubmitActionIsDisabledWhilePending', () => {
  it('sends one request for a double click and disables the button while it is pending', async () => {
    const { writer, fillAll, view } = await openForm();
    fillAll();
    const button = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(button);
    fireEvent.click(button);
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(writer.calls).toHaveLength(1);
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('sends one request even when the form is submitted twice without the button, as Enter does', async () => {
    const { writer, fillAll, view } = await openForm();
    fillAll();
    const form = view.container.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(writer.calls).toHaveLength(1);
  });

  it('enables the button again once the refusal arrives', async () => {
    const { writer, fillAll, save, settle } = await openForm();
    fillAll();
    await save();
    writer.calls[0].fail(apiError());
    await settle();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('aRefusedChangeKeepsWhatWasTyped', () => {
  it('shows the userMessage and keeps every typed value', async () => {
    const { writer, fillAll, view } = await openForm();
    fillAll({ name: 'Canyon walk', rate: '12.50', cost: '7', capacity: '18' });
    fireEvent.click(screen.getByLabelText('Transport required'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    writer.calls[0].fail(apiError({ userMessage: 'The capacity cannot be reduced.' }));
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(screen.getByText('The capacity cannot be reduced.')).not.toBeNull();
    expect((screen.getByLabelText('Commercial name') as HTMLInputElement).value).toBe('Canyon walk');
    expect((screen.getByLabelText('Base rate') as HTMLInputElement).value).toBe('12.50');
    expect((screen.getByLabelText('Base operational cost') as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText('Configured capacity') as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText('Transport required') as HTMLInputElement).checked).toBe(true);
  });

  it('shows a field message beside the field named in the details', async () => {
    const { writer, fillAll, view, describedBy } = await openForm();
    fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    writer.calls[0].fail(
      apiError({ details: [{ field: 'configuredCapacity', message: 'Below the booked seats.' }] }),
    );
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(describedBy('Configured capacity')).toContain('Below the booked seats.');
    expect(screen.getByLabelText('Configured capacity').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Configured capacity') as HTMLInputElement).value).toBe('18');
  });
});

describe('listShowsTheNewValuesWithoutAReload', () => {
  it('emits the saved item', async () => {
    const { writer, saved, fillAll, save, settle } = await openForm();
    fillAll();
    await save();
    const stored = itemNamed('Canyon walk');
    writer.calls[0].reply(stored);
    await settle();
    expect(saved).toEqual([stored]);
  });
});

describe('sendsMoneyAsMinorUnits', () => {
  it('sends 12.50 as 1250 and the rest of the typed values', async () => {
    const { writer, fillAll, save } = await openForm();
    fillAll({ rate: '12.50', cost: '0.07' });
    await save();
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].kind).toBe('create');
    expect(writer.calls[0].command).toEqual({
      serviceType: expect.any(String),
      commercialName: 'Canyon walk',
      baseRateCents: 1250,
      baseOperationalCostCents: 7,
      configuredCapacity: 18,
      transportRequired: false,
      highRisk: false,
    });
  });
});

describe('formOffersTheHighRiskControl', () => {
  it('offers a labelled High risk checkbox that starts unchecked', async () => {
    await openForm();
    const box = screen.getByLabelText('High risk') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
  });

  it.each([true, false])('sends highRisk %s when registering', async (marked) => {
    const { writer, fillAll, save } = await openForm();
    fillAll();
    if (marked) {
      fireEvent.click(screen.getByLabelText('High risk'));
    }
    await save();
    expect(writer.calls[0].command.highRisk).toBe(marked);
  });

  it('shows a refusal of the field beside the High risk control', async () => {
    const { writer, fillAll, view, describedBy } = await openForm();
    fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    writer.calls[0].fail(apiError({ details: [{ field: 'highRisk', message: 'Needs a review.' }] }));
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(describedBy('High risk')).toContain('Needs a review.');
  });
});

describe('capacityDependsOnTheServiceType', () => {
  it('marks a tour without capacity and does not call the writer', async () => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ capacity: '' });
    await save();
    expect(screen.getByLabelText('Configured capacity').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Configured capacity')).toBe('Required for a tour');
    expect(writer.calls).toHaveLength(0);
  });

  it('sends null capacity for a transportation item without one', async () => {
    const { writer, fillAll, save } = await openForm();
    fireEvent.change(screen.getByLabelText('Service type'), { target: { value: 'TRANSPORTATION' } });
    fillAll({ capacity: '' });
    await save();
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].command.configuredCapacity).toBeNull();
    expect(writer.calls[0].command).toMatchObject({ serviceType: 'TRANSPORTATION' });
  });
});

describe('editsAnExistingItem', () => {
  it('starts from the item values and updates it by id', async () => {
    const item = { ...itemNamed('Old name'), baseRateCents: 1250, configuredCapacity: 18 };
    const { writer, type, save } = await openForm(item);
    expect((screen.getByLabelText('Base rate') as HTMLInputElement).value).toBe('12.50');
    expect((screen.getByLabelText('Configured capacity') as HTMLInputElement).value).toBe('18');
    expect(screen.getByLabelText('Service type').hasAttribute('disabled')).toBe(true);
    type('Commercial name', 'New name');
    await save();
    expect(writer.calls[0].kind).toBe('update');
    expect(writer.calls[0].serviceId).toBe(item.serviceId);
    expect(writer.calls[0].command.commercialName).toBe('New name');
    expect(writer.calls[0].command.baseRateCents).toBe(1250);
  });

  it('sends a command without serviceType when editing, because the contract refuses it', async () => {
    const { writer, save } = await openForm({ ...itemNamed('Old name'), configuredCapacity: 18 });
    await save();
    expect(writer.calls[0].kind).toBe('update');
    expect(Object.keys(writer.calls[0].command)).not.toContain('serviceType');
    expect(writer.calls[0].command).toMatchObject({ highRisk: false });
  });
});

import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItemFormComponent } from '../src/app/catalog/components/catalog-item-form.component';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { apiError, ControllableCatalogItemsWriter } from './catalog-items-writer.double';
import { itemNamed } from './catalog-items-source.double';
import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';

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
    type('Nombre comercial', overrides['name'] ?? 'Canyon walk');
    type('Tarifa base', overrides['rate'] ?? '12.50');
    type('Costo operativo base', overrides['cost'] ?? '7');
    type('Capacidad configurada', overrides['capacity'] ?? '18');
    type('Vigencia desde', '2026-09-01');
    type('Vigencia hasta', '2026-09-30');
  };
  const settle = async () => {
    await view.fixture.whenStable();
    view.fixture.detectChanges();
  };
  const save = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tour' }));
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
    expect(screen.getByLabelText('Tarifa base').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Tarifa base')).not.toBe('');
    expect(screen.getByLabelText('Costo operativo base').getAttribute('aria-invalid')).not.toBe('true');
    expect(writer.calls).toHaveLength(0);
  });

  it('marks a missing base operational cost beside its field and sends no request', async () => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ cost: '' });
    await save();
    expect(screen.getByLabelText('Costo operativo base').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Costo operativo base')).not.toBe('');
    expect(writer.calls).toHaveLength(0);
  });

  it.each(['12,5', 'abc'])('marks the money text %j as invalid, because parseMoney refuses it', async (text) => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ rate: text });
    await save();
    expect(screen.getByLabelText('Tarifa base').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Tarifa base')).not.toBe('');
    expect(writer.calls).toHaveLength(0);
  });

  it('shows each error as an alert that sits in the form beside its field, not in a banner', async () => {
    const { fillAll, save } = await openForm();
    fillAll({ rate: '', name: '' });
    await save();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    const field = screen.getByLabelText('Tarifa base');
    expect(alerts.some((alert) => alert.previousElementSibling === field)).toBe(true);
  });

  it('gives every field a label', async () => {
    await openForm();
    for (const label of ['Nombre comercial', 'Tarifa base', 'Costo operativo base', 'Capacidad configurada', 'Transporte obligatorio', 'Alto riesgo']) {
      expect(screen.getByLabelText(label)).not.toBeNull();
    }
  });
});

describe('theSubmitActionIsDisabledWhilePending', () => {
  it('sends one request for a double click and disables the button while it is pending', async () => {
    const { writer, fillAll, view } = await openForm();
    fillAll();
    const button = screen.getByRole('button', { name: 'Guardar tour' });
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
    expect(screen.getByRole('button', { name: 'Guardar tour' }).hasAttribute('disabled')).toBe(false);
  });
});

describe('aRefusedChangeKeepsWhatWasTyped', () => {
  it('shows the userMessage and keeps every typed value', async () => {
    const { writer, fillAll, view } = await openForm();
    fillAll({ name: 'Canyon walk', rate: '12.50', cost: '7', capacity: '18' });
    fireEvent.click(screen.getByLabelText('Transporte obligatorio'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tour' }));
    writer.calls[0].fail(apiError({ userMessage: 'The capacity cannot be reduced.' }));
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(screen.getByText('The capacity cannot be reduced.')).not.toBeNull();
    expect((screen.getByLabelText('Nombre comercial') as HTMLInputElement).value).toBe('Canyon walk');
    expect((screen.getByLabelText('Tarifa base') as HTMLInputElement).value).toBe('12.50');
    expect((screen.getByLabelText('Costo operativo base') as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText('Capacidad configurada') as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText('Transporte obligatorio') as HTMLInputElement).checked).toBe(true);
  });

  it('shows a field message beside the field named in the details', async () => {
    const { writer, fillAll, view, describedBy } = await openForm();
    fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tour' }));
    writer.calls[0].fail(
      apiError({ details: [{ field: 'configuredCapacity', message: 'Below the booked seats.' }] }),
    );
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(describedBy('Capacidad configurada')).toContain('Below the booked seats.');
    expect(screen.getByLabelText('Capacidad configurada').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Capacidad configurada') as HTMLInputElement).value).toBe('18');
  });
});

describe('aCapacityBelowTheHeldSeatsIsExplainedInSpanish', () => {
  const GENERIC = 'This action is not allowed in the current state.';
  const containerRefusal = (overrides = {}) =>
    apiError({ status: 422, code: 'BUSINESS_RULE_VIOLATION', message: GENERIC, userMessage: GENERIC, ...overrides });
  async function refuseEdit(error: ReturnType<typeof apiError>) {
    const opened = await openForm({ ...itemNamed('Old name'), configuredCapacity: 18 });
    opened.type('Capacidad configurada', '2');
    await opened.save();
    opened.writer.calls[0].fail(error);
    await opened.settle();
    return opened;
  }

  it('shows the Spanish reason beside the capacity field and not the generic English text', async () => {
    const { describedBy } = await refuseEdit(containerRefusal());
    expect(describedBy('Capacidad configurada')).toContain(CATALOG_COPY.capacityBelowHeldSeats);
    expect(screen.getByLabelText('Capacidad configurada').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(GENERIC)).toBeNull();
  });

  it('keeps the typed capacity', async () => {
    await refuseEdit(containerRefusal());
    expect((screen.getByLabelText('Capacidad configurada') as HTMLInputElement).value).toBe('2');
  });

  it('keeps the message the page already showed for a 422 with another code', async () => {
    await refuseEdit(apiError({ status: 422, code: 'VALIDATION_FAILED', userMessage: 'Other reason.' }));
    expect(screen.getByText('Other reason.')).not.toBeNull();
    expect(screen.queryByText(CATALOG_COPY.capacityBelowHeldSeats)).toBeNull();
  });

  it.each([403, 400])('keeps the message the page already showed for a %i', async (status) => {
    await refuseEdit(containerRefusal({ status, userMessage: 'Server says no.' }));
    expect(screen.getByText('Server says no.')).not.toBeNull();
    expect(screen.queryByText(CATALOG_COPY.capacityBelowHeldSeats)).toBeNull();
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
      validFrom: '2026-09-01',
      validTo: '2026-09-30',
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
    const box = screen.getByLabelText('Alto riesgo') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
  });

  it.each([true, false])('sends highRisk %s when registering', async (marked) => {
    const { writer, fillAll, save } = await openForm();
    fillAll();
    if (marked) {
      fireEvent.click(screen.getByLabelText('Alto riesgo'));
    }
    await save();
    expect(writer.calls[0].command.highRisk).toBe(marked);
  });

  it('shows a refusal of the field beside the High risk control', async () => {
    const { writer, fillAll, view, describedBy } = await openForm();
    fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tour' }));
    writer.calls[0].fail(apiError({ details: [{ field: 'highRisk', message: 'Needs a review.' }] }));
    await view.fixture.whenStable();
    view.fixture.detectChanges();
    expect(describedBy('Alto riesgo')).toContain('Needs a review.');
  });
});

describe('capacityDependsOnTheServiceType', () => {
  it('marks a tour without capacity and does not call the writer', async () => {
    const { writer, fillAll, save, describedBy } = await openForm();
    fillAll({ capacity: '' });
    await save();
    expect(screen.getByLabelText('Capacidad configurada').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Capacidad configurada')).toBe('Obligatoria para un tour');
    expect(writer.calls).toHaveLength(0);
  });

  // The type select left the tour form (v1.9: the tour is the only product here), so a transportation item is changed, not registered.
  it('sends no capacity when a transportation item is changed without one', async () => {
    const { writer, fillAll, save } = await openForm({ ...itemNamed('Bus Andino 01'), serviceType: 'TRANSPORTATION' });
    fillAll({ capacity: '' });
    await save();
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].command.configuredCapacity).toBeUndefined();
    expect(writer.calls[0].kind).toBe('update');
  });
});

describe('editsAnExistingItem', () => {
  it('starts from the item values and updates it by id', async () => {
    const item = { ...itemNamed('Old name'), baseRateCents: 1250, configuredCapacity: 18 };
    const { writer, type, save } = await openForm(item);
    expect((screen.getByLabelText('Tarifa base') as HTMLInputElement).value).toBe('12.50');
    expect((screen.getByLabelText('Capacidad configurada') as HTMLInputElement).value).toBe('18');
    type('Nombre comercial', 'New name');
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

describe('theFormFollowsTheAuthorizedScreenInSpanish', () => {
  it('numbers its sections, names the types, buttons and messages in Spanish and previews money with formatCop', async () => {
    const { view, type, save, describedBy } = await openForm();
    const host: HTMLElement = view.fixture.nativeElement;
    expect(Array.from(host.querySelectorAll('.crp-operator-eyebrow'), (node) => node.textContent?.trim())).toEqual(['01. Datos del tour', '02. Condiciones']);
    // The type select left the tour form (v1.9): the tour is the only product registered here.
    expect(host.querySelectorAll('option')).toHaveLength(0);
    expect(Array.from(host.querySelectorAll('.crp-form-actions button'), (button) => button.textContent?.trim())).toEqual(['Cancelar', 'Guardar tour']);
    expect(host.querySelector('.crp-form-actions button.crp-operator-outline')?.textContent?.trim()).toBe('Cancelar');
    expect(host.querySelector('.crp-form-actions button.crp-operator-primary')?.textContent?.trim()).toBe('Guardar tour');
    type('Tarifa base', '1299000');
    view.fixture.detectChanges();
    expect(host.querySelector('[data-money-preview="baseRate"]')?.textContent?.trim()).toBe('$1.299.000');
    type('Costo operativo base', '12,5');
    await save();
    expect(describedBy('Nombre comercial')).toBe('Obligatorio.');
    expect(describedBy('Costo operativo base')).toBe('Usa solo dígitos y punto decimal, por ejemplo 180000 o 180000.50.');
    expect(host.textContent).not.toMatch(/TOUR|TRANSPORTATION|Required|Save|Cancel\b/);
  });

  it('shows the stored rate of an item in whole pesos, never with two zero decimals', async () => {
    const { view } = await openForm({ ...itemNamed('Alpha'), baseRateCents: 18_000_000 });
    expect((screen.getByLabelText('Tarifa base') as HTMLInputElement).value).toBe('180000');
    expect(view.fixture.nativeElement.querySelector('[data-money-preview="baseRate"]')?.textContent?.trim()).toBe('$180.000');
  });
});


// Owner decision 2026-10-23 (A): the API has no validity fields, so the form does not demand them.
describe('validityIsOptionalBecauseTheApiHasNoValidity', () => {
  it('saves a tour without typing the validity and shows no validity error', async () => {
    const { validFrom: _from, validTo: _to, ...bare } = itemNamed('Old name');
    const { writer, type, save } = await openForm({ ...bare, configuredCapacity: 18 });
    type('Nombre comercial', 'Canyon walk');
    await save();
    expect(screen.getByLabelText('Vigencia desde').getAttribute('aria-invalid')).not.toBe('true');
    expect(screen.getByLabelText('Vigencia hasta').getAttribute('aria-invalid')).not.toBe('true');
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].kind).toBe('update');
    expect(writer.calls[0].command.validFrom ?? '').toBe('');
  });

  it('still refuses a validity that ends before it starts', async () => {
    const { writer, fillAll, type, save, describedBy } = await openForm();
    fillAll();
    type('Vigencia desde', '2026-09-30');
    type('Vigencia hasta', '2026-09-01');
    await save();
    expect(screen.getByLabelText('Vigencia hasta').getAttribute('aria-invalid')).toBe('true');
    expect(describedBy('Vigencia hasta')).toBe('La vigencia termina antes de empezar.');
    expect(writer.calls).toHaveLength(0);
  });
});

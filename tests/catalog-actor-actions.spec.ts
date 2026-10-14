import { CATALOG_COPY } from '../src/app/catalog/catalog-copy';
import { TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { CatalogItemsSource, CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogPageComponent } from '../src/app/catalog/pages/catalog-page.component';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { ControllableCatalogItemsWriter } from './catalog-items-writer.double';
import { ActorRole, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';

// DP-PT-06 is open: an account with several roles has no defined way to choose which it acts as.
// Every actor below acts as ONE internal role. The screen is convenience, not authority (D-09):
// the service refuses regardless, so these tests only prove what the screen offers.

async function openAs(actor?: ActorContext, items = [itemNamed('Alpha'), itemNamed('Beta')]) {
  const source = new ControllableCatalogItemsSource();
  const writer = new ControllableCatalogItemsWriter();
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogItemsSource, useValue: source },
      { provide: CatalogItemsWriter, useValue: writer },
      ...(actor ? [{ provide: ActorContext, useValue: actor }] : []),
    ],
  });
  const fixture = TestBed.createComponent(CatalogPageComponent);
  const host = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  if (source.requests.length > 0) {
    source.requests[0].reply(items);
    await settle();
  }
  const ui = within(host);
  const buttonNames = () => Array.from(host.querySelectorAll('button')).map((b) => b.textContent?.trim());
  const click = async (element: HTMLElement) => {
    fireEvent.click(element);
    await settle();
  };
  return { source, writer, host, ui, settle, buttonNames, click };
}

const CHANGING_ACTIONS = [CATALOG_COPY.newItem, CATALOG_COPY.edit, CATALOG_COPY.inactivate, CATALOG_COPY.reactivate, 'Guardar tour'];

describe('collaboratorOfAnEnablingTenantSeesNoRateCostOrCapacityField', () => {
  it('offers only Edit on a row, with no New item and no status action', async () => {
    const page = await openAs(actorAs('OPERATIONAL_COLLABORATOR', true));
    expect(page.buttonNames()).toEqual([CATALOG_COPY.edit, CATALOG_COPY.edit]);
  });

  it('shows the name and none of the rate, cost, capacity, type, transport or risk controls', async () => {
    const page = await openAs(actorAs('OPERATIONAL_COLLABORATOR', true));
    await page.click(within(page.host.querySelector('tbody tr') as HTMLElement).getByRole('button', { name: CATALOG_COPY.edit }));
    expect((page.ui.getByLabelText('Nombre comercial') as HTMLInputElement).value).toBe('Alpha');
    for (const label of ['Tarifa base', 'Costo operativo base', 'Capacidad configurada', 'Transporte obligatorio', 'Alto riesgo']) {
      expect(page.ui.queryByLabelText(label), label).toBeNull();
    }
  });

  it('sends a command with the commercial name and nothing else', async () => {
    const page = await openAs(actorAs('OPERATIONAL_COLLABORATOR', true));
    await page.click(within(page.host.querySelector('tbody tr') as HTMLElement).getByRole('button', { name: CATALOG_COPY.edit }));
    fireEvent.input(page.ui.getByLabelText('Nombre comercial'), { target: { value: 'Alpha renamed' } });
    await page.click(page.ui.getByRole('button', { name: 'Guardar tour' }));

    expect(page.writer.calls).toHaveLength(1);
    expect(page.writer.calls[0]).toMatchObject({ kind: 'update', serviceId: itemNamed('Alpha').serviceId });
    expect(Object.keys(page.writer.calls[0].command)).toEqual(['commercialName']);
    expect(page.writer.calls[0].command).toEqual({ commercialName: 'Alpha renamed' });

    page.writer.calls[0].reply({ ...itemNamed('Alpha'), commercialName: 'Alpha renamed' });
    await page.settle();
    expect(page.host.querySelector('tbody tr')?.textContent).toContain('Alpha renamed');
  });

  it('still requires the commercial name and sends nothing without it', async () => {
    const page = await openAs(actorAs('OPERATIONAL_COLLABORATOR', true));
    await page.click(within(page.host.querySelector('tbody tr') as HTMLElement).getByRole('button', { name: CATALOG_COPY.edit }));
    fireEvent.input(page.ui.getByLabelText('Nombre comercial'), { target: { value: '  ' } });
    await page.click(page.ui.getByRole('button', { name: 'Guardar tour' }));
    expect(page.writer.calls).toHaveLength(0);
    expect(page.ui.getByLabelText('Nombre comercial').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('collaboratorOfANonEnablingTenantSeesNoSaveAction', () => {
  it('reads the list and offers no New item, Edit, Inactivate, Reactivate or Save', async () => {
    const page = await openAs(actorAs('OPERATIONAL_COLLABORATOR', false), [itemNamed('Alpha'), { ...itemNamed('Beta'), catalogStatus: 'INACTIVE' }]);
    expect(page.host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(page.buttonNames()).toEqual([]);
    for (const name of CHANGING_ACTIONS) {
      expect(page.ui.queryByRole('button', { name }), name).toBeNull();
    }
  });

  it('is the actor that does not declare the tenant flag', async () => {
    const undeclared = new (class extends ActorContext {
      override readonly role = 'OPERATIONAL_COLLABORATOR' as const;
    })();
    expect(undeclared.collaboratorMayEditDescription).toBe(false);
    expect(actorAs('OPERATIONAL_COLLABORATOR').collaboratorMayEditDescription).toBe(false);
    const page = await openAs(undeclared);
    expect(page.buttonNames()).toEqual([]);
  });
});

describe('managerAndAnalystReadWithoutActionsAccountantIsDenied', () => {
  it.each<ActorRole>(['MANAGER', 'ANALYST'])('lets the %s read the list with no action that changes it', async (role) => {
    const page = await openAs(actorAs(role));
    expect(page.source.requests).toHaveLength(1);
    expect(page.host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(page.buttonNames()).toEqual([]);
  });

  it('denies the Accountant with an alert and never asks for the list', async () => {
    const page = await openAs(actorAs('ACCOUNTANT'));
    expect(page.source.requests).toHaveLength(0);
    expect(page.ui.getByRole('alert').textContent?.trim()).not.toBe('');
    expect(page.host.querySelector('tbody tr')).toBeNull();
    expect(page.buttonNames()).toEqual([]);
  });
});

describe('theAdministratorSeesEveryAction', () => {
  it('offers every action when the Administrator is provided explicitly', async () => {
    const page = await openAs(actorAs('TENANT_ADMINISTRATOR'));
    expect(page.buttonNames()).toEqual([CATALOG_COPY.newItem, CATALOG_COPY.inactivate, CATALOG_COPY.edit, CATALOG_COPY.inactivate, CATALOG_COPY.edit]);
  });

  it('opens the full form with every control', async () => {
    const page = await openAs(actorAs('TENANT_ADMINISTRATOR'));
    await page.click(page.ui.getByRole('button', { name: CATALOG_COPY.newItem }));
    for (const label of ['Nombre comercial', 'Tarifa base', 'Costo operativo base', 'Capacidad configurada', 'Transporte obligatorio', 'Alto riesgo']) {
      expect(page.ui.queryByLabelText(label), label).not.toBeNull();
    }
  });
});

describe('capabilitiesOfTheRoleMatrix', () => {
  const all = { canRegister: true, canEditCommercialFields: true, canEditDescription: true, canChangeStatus: true, canRead: true, isDenied: false };
  const none = { canRegister: false, canEditCommercialFields: false, canEditDescription: false, canChangeStatus: false, canRead: false, isDenied: false };

  it('gives the Administrator everything', () => {
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR', false).catalog()).toEqual(all);
  });

  it('gives the Collaborator descriptive edits only when the tenant enables them, and never rates, status or creation', () => {
    expect(PortalCapabilities.for('OPERATIONAL_COLLABORATOR', true).catalog()).toEqual({ ...none, canRead: true, canEditDescription: true });
    expect(PortalCapabilities.for('OPERATIONAL_COLLABORATOR', false).catalog()).toEqual({ ...none, canRead: true });
  });

  it('ignores the tenant flag for every other role', () => {
    expect(PortalCapabilities.for('MANAGER', true).catalog()).toEqual({ ...none, canRead: true });
    expect(PortalCapabilities.for('ANALYST', true).catalog()).toEqual({ ...none, canRead: true });
    expect(PortalCapabilities.for('ACCOUNTANT', true).catalog()).toEqual({ ...none, isDenied: true });
  });
});

describe('theDefaultActorFailsClosed', () => {
  it('is read-only when no actor is provided: no New item, Edit or status action', async () => {
    const page = await openAs(undefined);
    const fallback = TestBed.inject(ActorContext);
    expect(fallback.role).toBe('READ_ONLY');
    expect(fallback.collaboratorMayEditDescription).toBe(false);
    expect(page.source.requests).toHaveLength(1);
    expect(page.host.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(page.buttonNames()).toEqual([]);
    for (const name of [CATALOG_COPY.newItem, CATALOG_COPY.edit, CATALOG_COPY.inactivate, CATALOG_COPY.reactivate]) {
      expect(page.ui.queryByRole('button', { name }), name).toBeNull();
    }
  });
});

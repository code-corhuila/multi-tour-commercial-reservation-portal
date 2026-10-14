import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { CatalogItemsWriter } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItemFormComponent } from '../src/app/catalog/components/catalog-item-form.component';
import { PORTAL_AREA_LIST, PortalArea } from '../src/app/portal-areas';
import { PortalAudience } from '../src/app/portal-audience';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { apiError, ControllableCatalogItemsWriter } from './catalog-items-writer.double';

// Amendment 2026-10-13, HC-4 (plan H-D5): a refused form focuses its first field in error; an opened area focuses its heading.

describe('aRefusedFormFocusesItsFirstFieldInError', () => {
  async function openForm() {
    const writer = new ControllableCatalogItemsWriter();
    const view = await render(CatalogItemFormComponent, { providers: [{ provide: CatalogItemsWriter, useValue: writer }] });
    const type = (label: string, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });
    const settle = async () => { await view.fixture.whenStable(); view.fixture.detectChanges(); await view.fixture.whenStable(); };
    const save = async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar tour' })); await settle(); };
    return { writer, type, save, settle };
  }

  it('focuses the first invalid field when the form refuses locally (AC-P1.2)', async () => {
    const { writer, type, save } = await openForm();
    type('Nombre comercial', 'Canyon walk');
    type('Tarifa base', '');
    type('Costo operativo base', 'abc');
    type('Capacidad configurada', '18');
    type('Vigencia desde', '2026-09-01');
    type('Vigencia hasta', '2026-09-30');
    await save();
    expect(writer.calls).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByLabelText('Tarifa base'));
  });

  it('focuses the field the service refused', async () => {
    const { writer, type, save, settle } = await openForm();
    type('Nombre comercial', 'Canyon walk');
    type('Tarifa base', '12');
    type('Costo operativo base', '7');
    type('Capacidad configurada', '18');
    type('Vigencia desde', '2026-09-01');
    type('Vigencia hasta', '2026-09-30');
    await save();
    (document.activeElement as HTMLElement | null)?.blur();
    writer.calls[0].fail(apiError({ details: [{ field: 'configuredCapacity', message: 'Below the booked seats.' }] }));
    await settle();
    expect(document.activeElement).toBe(screen.getByLabelText('Capacidad configurada'));
  });
});

@Component({ selector: 'crp-test-first-area', template: '<h1>Primera área</h1><button type="button">Acción</button>' })
class FirstAreaDouble {}
@Component({ selector: 'crp-test-second-area', template: '<h1>Segunda área</h1><button type="button">Acción</button>' })
class SecondAreaDouble {}
const AREAS: PortalArea[] = [
  { key: 'first', label: 'Primera', component: FirstAreaDouble },
  { key: 'second', label: 'Segunda', component: SecondAreaDouble },
];

describe('openingAnAreaFocusesItsHeading', () => {
  async function openShell() {
    TestBed.configureTestingModule({ providers: [
      { provide: PortalAudience, useValue: { audience: 'operator' } },
      { provide: PORTAL_AREA_LIST, useValue: AREAS },
    ] });
    const fixture = TestBed.createComponent(PortalShellComponent);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); };
    await settle();
    const host: HTMLElement = fixture.nativeElement;
    const item = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-operator-nav button')).find((b) => b.textContent?.trim() === label)!;
    return { host, item, settle };
  }

  it('moves the focus to the heading of the opened area, focusable by script only', async () => {
    const { host, item, settle } = await openShell();
    item('Segunda').focus();
    item('Segunda').click();
    await settle();
    const heading = host.querySelector('crp-test-second-area h1');
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute('tabindex')).toBe('-1');
  });

  it('leaves the focus where it is on the first render, before any area is opened', async () => {
    const { host } = await openShell();
    expect(host.querySelector('crp-test-first-area h1')).not.toBeNull();
    expect(host.contains(document.activeElement)).toBe(false);
  });
});

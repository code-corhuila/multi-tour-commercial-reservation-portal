import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AssociatedEstablishmentsEditor, UpdateEstablishmentCommand } from '../src/app/establishments/data/associated-establishments-editor';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { DemoEstablishmentsStore, DemoEstablishmentsWriter } from '../src/app/demo/demo-sources';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

// HU-COM-002 (spec 002-, one screen for hotels and restaurants, AC-PE.12): admin-gestionar-hospedaje.html / -alimentacion.html — "Estado y último cambio",
// "Gestionar" on each row, the bitácora de cambios and the configuration of the information, all on the same screen.
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const OLD = { kind: 'INACTIVATED' as const, at: '2026-09-20T10:30:00', by: 'Fernanda Robayo (Administrador del tenant)' };
const FIRST = { kind: 'REGISTERED' as const, at: '2026-09-01T08:00:00', by: 'Fernanda Robayo (Administrador del tenant)' };
const withChanges = (name: string, over: Partial<AssociatedEstablishment> = {}): AssociatedEstablishment => ({ ...establishmentNamed(name), changes: [FIRST, OLD], associationStatus: 'INACTIVE', ...over });

class ControllableEditor extends AssociatedEstablishmentsEditor {
  readonly calls: { id: string; command: UpdateEstablishmentCommand; reply: (item: AssociatedEstablishment) => void; fail: (error: unknown) => void }[] = [];
  override update(id: string, command: UpdateEstablishmentCommand): Observable<AssociatedEstablishment> {
    const answers = new Subject<AssociatedEstablishment>();
    this.calls.push({ id, command, reply: (item) => { answers.next(item); answers.complete(); }, fail: (error) => answers.error(error) });
    return answers;
  }
}

async function openPage(role: ActorRole = 'TENANT_ADMINISTRATOR', options: { editor?: boolean } = {}) {
  const source = new ControllableEstablishmentsSource(), writer = new ControllableEstablishmentsWriter(), editor = new ControllableEditor();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    { provide: AssociatedEstablishmentsWriter, useValue: writer },
    ...(options.editor === false ? [] : [{ provide: AssociatedEstablishmentsEditor, useValue: editor }]),
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: ActorContext, useValue: actorAs(role, true) },
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const element: HTMLElement = fixture.nativeElement;
  const button = (text: string, within: ParentNode = element) => Array.from(within.querySelectorAll('button')).find((node) => flat(node.textContent) === text);
  const click = async (text: string, within: ParentNode = element) => { button(text, within)!.click(); await settle(); };
  const panel = () => element.querySelector('.crp-establishment-manage');
  await settle();
  return { source, writer, editor, element, settle, button, click, panel };
}

describe('theStatusColumnTellsTheLastChange', () => {
  it('is headed "Estado y último cambio" and tells who changed it last, and when', async () => {
    const { source, element, settle } = await openPage();
    source.requests[0].reply([withChanges('Hostal La Tatacoa')]); await settle();
    expect(flat(element.querySelector('thead')!.textContent)).toContain('Estado y último cambio');
    const cell = flat(element.querySelector('tbody tr td:nth-child(3)')!.textContent);
    expect(cell).toContain('Inactivo');
    expect(cell).toContain('Último cambio: Inactivado por Fernanda Robayo (Administrador del tenant) · 20 sep 2026 · 10:30');
  });

  it('says that no change was recorded for an establishment with no bitácora', async () => {
    const { source, element, settle } = await openPage();
    source.requests[0].reply([{ ...establishmentNamed('Sin historial'), changes: [] }]); await settle();
    expect(flat(element.querySelector('tbody tr td:nth-child(3)')!.textContent)).toContain('Sin cambios registrados');
  });
});

describe('gestionarOpensTheEstablishmentOnTheSameScreen', () => {
  it('offers "Gestionar" on each row to the Administrador and opens one panel at a time, below the list', async () => {
    const { source, element, settle, click, panel } = await openPage();
    source.requests[0].reply([withChanges('Uno'), withChanges('Dos')]); await settle();
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows.map((row) => Array.from(row.querySelectorAll('button')).map((b) => flat(b.textContent)))).toEqual([['Gestionar', 'Reactivar'], ['Gestionar', 'Reactivar']]);
    await click('Gestionar', rows[0]);
    expect(element.querySelectorAll('.crp-establishment-manage')).toHaveLength(1);
    expect(flat(panel()!.querySelector('h2')!.textContent)).toBe('Gestionar establecimiento · Uno');
    await click('Gestionar', rows[1]);
    expect(element.querySelectorAll('.crp-establishment-manage')).toHaveLength(1);
    expect(flat(panel()!.querySelector('h2')!.textContent)).toBe('Gestionar establecimiento · Dos');
    await click('Cerrar', panel()!);
    expect(panel()).toBeNull();
  });

  it.each([['MANAGER'], ['ANALYST']] as const)('offers neither "Gestionar" nor the panel to a %s, who only reads', async (role) => {
    const { source, element, settle, button } = await openPage(role);
    source.requests[0].reply([withChanges('Uno')]); await settle();
    expect(button('Gestionar')).toBeUndefined();
  });

  it('draws the bitácora de cambios, newest first, with who and when', async () => {
    const { source, settle, click, panel, element } = await openPage();
    source.requests[0].reply([withChanges('Uno')]); await settle();
    await click('Gestionar', element.querySelector('tbody tr')!);
    const section = panel()!;
    expect(flat(section.querySelector('.crp-establishment-log h3')!.textContent)).toBe('Bitácora de cambios');
    expect(Array.from(section.querySelectorAll('.crp-establishment-log th')).map((th) => flat(th.textContent))).toEqual(['Fecha', 'Responsable', 'Cambio']);
    const rows = Array.from(section.querySelectorAll('.crp-establishment-log tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((td) => flat(td.textContent)));
    expect(rows).toEqual([
      ['20 sep 2026 · 10:30', 'Fernanda Robayo (Administrador del tenant)', 'Inactivado'],
      ['01 sep 2026 · 08:00', 'Fernanda Robayo (Administrador del tenant)', 'Registrado'],
    ]);
  });

  it('says that nothing was recorded when the bitácora is empty', async () => {
    const { source, settle, click, panel, element } = await openPage();
    source.requests[0].reply([{ ...establishmentNamed('Vacío'), changes: [] }]); await settle();
    await click('Gestionar', element.querySelector('tbody tr')!);
    expect(flat(panel()!.querySelector('.crp-establishment-log')!.textContent)).toContain('Sin cambios registrados.');
  });

  it('keeps room, dish, menu, seat, rate and availability out of the panel, and offers no delete (AC-PE.8, AC-PE.9)', async () => {
    const { source, settle, click, panel, element } = await openPage();
    source.requests[0].reply([withChanges('Uno')]); await settle();
    await click('Gestionar', element.querySelector('tbody tr')!);
    expect(flat(panel()!.textContent)).not.toMatch(/habitaci|plato|men[uú]|cupo|tarifa|disponibilidad|eliminar|borrar/i);
  });
});

describe('configurarEditsTheInformationOfTheSameEstablishment', () => {
  const open = async (options: { editor?: boolean } = {}) => {
    const view = await openPage('TENANT_ADMINISTRATOR', options);
    view.source.requests[0].reply([withChanges('Hostal La Tatacoa')]); await view.settle();
    await view.click('Gestionar', view.element.querySelector('tbody tr')!);
    const field = (label: string) => Array.from(view.panel()!.querySelectorAll('label')).find((l) => flat(l.textContent) === label)!;
    const input = (label: string) => view.panel()!.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${field(label).getAttribute('for')}`)!;
    const type = async (label: string, value: string) => { const node = input(label); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); await view.settle(); };
    return { ...view, input, type };
  };

  it('starts from the current name and information, and saves them trimmed', async () => {
    const { editor, input, type, click, panel } = await open();
    expect(input('Nombre del establecimiento').value).toBe('Hostal La Tatacoa');
    expect(input('Información comercial').value).toBe('Contact the establishment directly.');
    await type('Nombre del establecimiento', '  Hostal La Tatacoa Real  ');
    await type('Información comercial', 'Reabierto tras la remodelación.');
    await click('Guardar cambios', panel()!);
    expect(editor.calls.map((call) => [call.id, call.command])).toEqual([['Hostal La Tatacoa', { commercialName: 'Hostal La Tatacoa Real', commercialInformation: 'Reabierto tras la remodelación.' }]]);
  });

  it('shows the stored row and the notice after the answer, with the new entry in the bitácora', async () => {
    const { editor, type, click, panel, element, settle } = await open();
    await type('Nombre del establecimiento', 'Hostal Real');
    await click('Guardar cambios', panel()!);
    editor.calls[0].reply({ ...withChanges('Hostal La Tatacoa', { commercialName: 'Hostal Real' }), changes: [FIRST, OLD, { kind: 'UPDATED', at: '2026-10-22T09:00:00', by: 'Fernanda Robayo (Administrador del tenant)' }] });
    await settle();
    expect(flat(element.querySelector('tbody tr td')!.textContent)).toContain('Hostal Real');
    expect(flat(panel()!.querySelector('[role="status"]')!.textContent)).toBe('Información actualizada correctamente.');
    expect(flat(panel()!.querySelector('.crp-establishment-log tbody tr')!.textContent)).toContain('Información actualizada');
  });

  it('sends nothing when the name is empty and says so beside the field', async () => {
    const { editor, type, click, panel } = await open();
    await type('Nombre del establecimiento', '   ');
    await click('Guardar cambios', panel()!);
    expect(editor.calls).toEqual([]);
    expect(flat(panel()!.querySelector('[role="alert"]')!.textContent)).toBe('Obligatorio: de 1 a 255 caracteres.');
  });

  it('moves the focus to the name field when the form refuses it (HC-4)', async () => {
    const { editor, type, click, panel, element, settle } = await open();
    document.body.appendChild(element);
    await type('Nombre del establecimiento', '   ');
    await click('Guardar cambios', panel()!); await settle();
    expect(editor.calls).toEqual([]);
    expect(document.activeElement).toBe(panel()!.querySelector('#crp-establishment-manage-name'));
    element.remove();
  });

  it('shows the message of the service and keeps what was typed when the update fails', async () => {
    const { editor, input, type, click, panel, settle } = await open();
    await type('Información comercial', 'Texto nuevo');
    await click('Guardar cambios', panel()!);
    editor.calls[0].fail({ status: 500, userMessage: 'Internal error' }); await settle();
    expect(flat(panel()!.querySelector('[role="alert"]')!.textContent)).toBe('No se pudo completar la solicitud. Intenta de nuevo.');
    expect(input('Información comercial').value).toBe('Texto nuevo');
  });

  it('shows the bitácora but no fields where the build has no editor (production)', async () => {
    const { panel, button } = await open({ editor: false });
    expect(panel()!.querySelector('input, textarea')).toBeNull();
    expect(button('Guardar cambios', panel()!)).toBeUndefined();
    expect(panel()!.querySelector('.crp-establishment-log')).not.toBeNull();
  });
});

describe('theDemoWritersKeepTheBitacora', () => {
  const demo = () => {
    const store = new DemoEstablishmentsStore();
    return { store, writer: new DemoEstablishmentsWriter(store, { now: () => Date.UTC(2026, 9, 22, 14, 0), actor: () => 'Administrador del tenant (demo)' }) };
  };
  const last = (store: DemoEstablishmentsStore, id: string) => store.items.find((e) => e.associationId === id)!.changes!.at(-1)!;

  it('seeds a recorded change for the establishments of the demo', () => {
    const { store } = demo();
    expect(store.items.every((e) => (e.changes ?? []).length > 0)).toBe(true);
    expect(store.items.find((e) => e.associationStatus === 'INACTIVE')!.changes!.at(-1)!.kind).toBe('INACTIVATED');
  });

  it.each([
    ['inactivates', 'demo-est-1', 'INACTIVATED'],
    ['reactivates', 'demo-est-3', 'REACTIVATED'],
  ] as const)('records who and when when it %s', (verb, id, kind) => {
    const { store, writer } = demo();
    (verb === 'inactivates' ? writer.inactivate(id) : writer.reactivate(id)).subscribe();
    expect(last(store, id)).toEqual({ kind, at: '2026-10-22T09:00:00', by: 'Administrador del tenant (demo)' });
  });

  it('records the registration and the update, and changes only the name and the information', () => {
    const { store, writer } = demo();
    writer.update('demo-est-2', { commercialName: 'Posada Nueva', commercialInformation: 'Otra información.' }).subscribe();
    const stored = store.items.find((e) => e.associationId === 'demo-est-2')!;
    expect(stored).toMatchObject({ commercialName: 'Posada Nueva', commercialInformation: 'Otra información.', associationStatus: 'ACTIVE', establishmentType: 'HOTEL' });
    expect(last(store, 'demo-est-2').kind).toBe('UPDATED');
    writer.register({ establishmentType: 'RESTAURANT', commercialName: 'Nuevo', commercialInformation: 'x', image: new File(['x'], 'a.png') }).subscribe();
    expect(store.items.at(-1)!.changes).toEqual([{ kind: 'REGISTERED', at: '2026-10-22T09:00:00', by: 'Administrador del tenant (demo)' }]);
  });
});

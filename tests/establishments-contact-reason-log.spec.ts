import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { formControls, imageFile } from './establishment-form.helpers';

// HU-COM-002 closes the three items of DD-12: the contact (AC-PE.15), the reason of a state change (AC-PE.13) and the bitácora (AC-PE.14).
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const withChanges = (item: AssociatedEstablishment): AssociatedEstablishment => ({
  ...item, associationStatus: 'INACTIVE',
  changes: [{ kind: 'REGISTERED', at: '2026-09-01T08:00:00', by: 'Ana' }, { kind: 'INACTIVATED', at: '2026-09-20T10:30:00', by: 'Luis', reason: 'Cerrado por obras' }],
});

async function openPage() {
  const source = new ControllableEstablishmentsSource(), writer = new ControllableEstablishmentsWriter();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    { provide: AssociatedEstablishmentsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR', true) },
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const element: HTMLElement = fixture.nativeElement;
  const click = async (text: string) => { Array.from(element.querySelectorAll('button')).find((b) => flat(b.textContent) === text)!.click(); await settle(); };
  await settle();
  return { source, writer, settle, element, click };
}

describe('theFormCarriesTheContactFields', () => {
  it('shows "Datos de contacto" with Correo de contacto, Teléfono and Dirección', async () => {
    const { element, click, source, settle } = await openPage();
    source.requests[0].reply([]); await settle(); await click(ESTABLISHMENTS_COPY.newEstablishment);
    expect(flat(element.querySelector('form')!.textContent)).toContain('Datos de contacto');
    const labels = Array.from(element.querySelectorAll('form label'), (label) => flat(label.textContent));
    expect(labels).toEqual(expect.arrayContaining(['Correo de contacto', 'Teléfono', 'Dirección']));
  });

  async function openForm() {
    const page = await openPage();
    page.source.requests[0].reply([]); await page.settle(); await page.click(ESTABLISHMENTS_COPY.newEstablishment);
    const form = await formControls(page.element, page.settle);
    await form.text('commercialName', 'Hotel Alpha'); await form.text('commercialInformation', 'Description.'); await form.choose(imageFile());
    return { ...page, form };
  }

  it('oneOfEmailOrPhoneIsRequired: with neither, the error shows beside the contact fields and nothing is sent', async () => {
    const { form, writer } = await openForm();
    await form.submit();
    expect(writer.registrations).toEqual([]);
    expect(form.errorFor('contactEmail')).toBe('Registra al menos un dato de contacto (correo o teléfono).');
    expect(form.field('contactEmail').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses an email that is not one', async () => {
    const { form, writer } = await openForm();
    await form.text('contactEmail', 'not-an-email'); await form.submit();
    expect(writer.registrations).toEqual([]);
    expect(form.errorFor('contactEmail')).toBe('Ingresa un correo de contacto válido.');
  });

  it('sends the typed contact trimmed and leaves out what was not typed', async () => {
    const { form, writer } = await openForm();
    await form.text('contactPhone', '  +57 8 8700000 '); await form.submit();
    expect(writer.registrations[0].command.contactPhone).toBe('+57 8 8700000');
    expect(Object.keys(writer.registrations[0].command)).not.toContain('contactEmail');
    expect(Object.keys(writer.registrations[0].command)).not.toContain('contactAddress');
  });
});

describe('theContactColumnShowsTheContactOfTheRecord', () => {
  it('names the second column "Contacto" and draws the email, the phone and the address, or "Sin datos de contacto"', async () => {
    const { element, source, settle } = await openPage();
    source.requests[0].reply([{ ...establishmentNamed('Alpha'), contactEmail: 'info@alpha.co', contactPhone: '+57 8 8700000', contactAddress: 'Calle 1 No. 2-3' }, establishmentNamed('Beta')]); await settle();
    expect(Array.from(element.querySelectorAll('th'), (th) => flat(th.textContent))).toContain('Contacto');
    const rows = element.querySelectorAll('tbody tr');
    expect(Array.from(rows[0].children[1].querySelectorAll('span'), (line) => flat(line.textContent))).toEqual(['info@alpha.co', '+57 8 8700000', 'Calle 1 No. 2-3']);
    expect(flat(rows[1].children[1].textContent)).toBe('Sin datos de contacto');
  });
});

describe('changingTheStateAsksForTheReason', () => {
  async function openChange(label: string, item: AssociatedEstablishment) {
    const page = await openPage();
    page.source.requests[0].reply([item]); await page.settle(); await page.click(label);
    const reason = () => page.element.querySelector<HTMLTextAreaElement>('textarea[name="reason"]')!;
    const type = async (value: string) => { reason().value = value; reason().dispatchEvent(new Event('input')); await page.settle(); };
    return { ...page, reason, type };
  }

  it('opens the panel "Cambiar estado" with "Motivo (obligatorio)", Cancelar and the confirmation, and sends nothing yet', async () => {
    const { element, writer } = await openChange(ESTABLISHMENTS_COPY.inactivate, establishmentNamed('Alpha'));
    const panel = element.querySelector('[aria-label="Inactivar Alpha"]')!;
    expect(flat(panel.textContent)).toContain('Confirmación');
    expect(flat(panel.textContent)).toContain('Motivo (obligatorio)');
    expect(Array.from(panel.querySelectorAll('button'), (b) => flat(b.textContent))).toEqual(['Cancelar', 'Confirmar inactivación']);
    expect(writer.transitions).toEqual([]);
  });

  it('anEmptyReasonIsRefusedAndAReasonIsRecorded', async () => {
    const { element, writer, click, type, reason, settle } = await openChange(ESTABLISHMENTS_COPY.inactivate, establishmentNamed('Alpha'));
    await click('Confirmar inactivación');
    expect(writer.transitions).toEqual([]);
    expect(flat(element.querySelector('[role="alert"]')!.textContent)).toBe('El motivo es obligatorio para la trazabilidad.');
    expect(reason().getAttribute('aria-invalid')).toBe('true');
    await type('   '); await click('Confirmar inactivación');
    expect(writer.transitions).toEqual([]);
    await type('Cerrado por obras'); await click('Confirmar inactivación');
    expect(writer.transitions).toHaveLength(1);
    expect(writer.transitions[0]).toMatchObject({ kind: 'inactivate', id: 'Alpha', reason: 'Cerrado por obras' });
    writer.transitions[0].reply({ ...establishmentNamed('Alpha'), associationStatus: 'INACTIVE' }); await settle();
    expect(element.querySelector('[aria-label="Inactivar Alpha"]')).toBeNull();
  });

  it('Cancelar closes the panel without a write, and a reactivation asks for its own reason', async () => {
    const { element, writer, click, type } = await openChange(ESTABLISHMENTS_COPY.reactivate, { ...establishmentNamed('Alpha'), associationStatus: 'INACTIVE' });
    expect(element.querySelector('[aria-label="Reactivar Alpha"]')).not.toBeNull();
    await click('Cancelar');
    expect(element.querySelector('[aria-label="Reactivar Alpha"]')).toBeNull();
    expect(writer.transitions).toEqual([]);
    await click(ESTABLISHMENTS_COPY.reactivate); await type('Obras terminadas'); await click('Confirmar reactivación');
    expect(writer.transitions[0]).toMatchObject({ kind: 'reactivate', reason: 'Obras terminadas' });
  });
});

describe('theLogListsEveryChangeNewestFirst', () => {
  it('draws "Trazabilidad / Bitácora de cambios" with date, establishment, event, responsible and reason, newest first', async () => {
    const { element, source, settle } = await openPage();
    source.requests[0].reply([withChanges(establishmentNamed('Alpha'))]); await settle();
    const panel = Array.from(element.querySelectorAll('section')).find((section) => flat(section.querySelector('h2')?.textContent) === 'Bitácora de cambios')!;
    expect(flat(panel.textContent)).toContain('Trazabilidad');
    expect(Array.from(panel.querySelectorAll('th'), (th) => flat(th.textContent))).toEqual(['Fecha y hora', 'Establecimiento', 'Evento', 'Responsable', 'Motivo']);
    const rows = Array.from(panel.querySelectorAll('tbody tr'), (row) => Array.from(row.children, (cell) => flat(cell.textContent)));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([expect.stringContaining('10:30'), 'Alpha', 'Inactivado', 'Luis', 'Cerrado por obras']);
    expect(rows[1]).toEqual([expect.stringContaining('08:00'), 'Alpha', 'Registrado', 'Ana', '—']);
  });

  it('says "Sin movimientos registrados." when no establishment has a change', async () => {
    const { element, source, settle } = await openPage();
    source.requests[0].reply([establishmentNamed('Alpha')]); await settle();
    expect(flat(element.textContent)).toContain('Sin movimientos registrados.');
  });

  it('the last change of the row carries its reason', async () => {
    const { element, source, settle } = await openPage();
    source.requests[0].reply([withChanges(establishmentNamed('Alpha'))]); await settle();
    expect(flat(element.querySelector('tbody tr')!.textContent)).toContain('Motivo: Cerrado por obras');
  });
});

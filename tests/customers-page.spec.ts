import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ActorContext, CatalogItemsSource, IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CatalogItem } from '../src/app/catalog/model/catalog-item';
import { CustomersSource, SensitiveDataAccess } from '../src/app/customers/data/customers-source';
import { CustomersWriter } from '../src/app/customers/data/customers-writer';
import { CustomerGroup } from '../src/app/customers/model/customer-group';
import { CustomersPageComponent } from '../src/app/customers/pages/customers-page.component';
import { actorAs } from './actor-context.double';
import { ControllableCatalogItemsSource, itemNamed } from './catalog-items-source.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { ControllableCustomersSource, ControllableCustomersWriter, groupWith, personNamed, sensitiveAccess } from './customers.double';
import { ActorRole } from '../src/app/shared/portal-capabilities';

const ordinary: CatalogItem = { ...itemNamed('Caminata de prueba'), serviceId: 'svc-ordinary' };
const risky: CatalogItem = { ...itemNamed('Canotaje de prueba'), serviceId: 'svc-risky', highRisk: true };
const inactive: CatalogItem = { ...itemNamed('Cerrado de prueba'), serviceId: 'svc-closed', catalogStatus: 'INACTIVE' };

async function openPeople(role: ActorRole = 'TENANT_ADMINISTRATOR', granted = false) {
  const source = new ControllableCustomersSource(), writer = new ControllableCustomersWriter();
  const catalog = new ControllableCatalogItemsSource(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: CustomersSource, useValue: source }, { provide: CustomersWriter, useValue: writer },
    { provide: CatalogItemsSource, useValue: catalog }, { provide: ActorContext, useValue: actorAs(role) },
    { provide: SensitiveDataAccess, useValue: sensitiveAccess(granted) }, { provide: IdempotencyKeys, useValue: keys }] });
  const fixture = TestBed.createComponent(CustomersPageComponent), element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const answer = async (group: CustomerGroup | null, items: CatalogItem[] = [ordinary, risky, inactive]) => {
    source.requests.at(-1)!.reply(group); catalog.requests.at(-1)?.reply(items); await settle();
  };
  const control = (label: string) => {
    const tag = Array.from(element.querySelectorAll('label')).find((l) => l.textContent?.trim() === label);
    return tag ? element.querySelector<HTMLInputElement>(`[id="${tag.htmlFor}"]`) : null;
  };
  const set = async (label: string, value: string) => {
    const c = control(label)!;
    if (c.type === 'checkbox') { c.checked = value === 'true'; c.dispatchEvent(new Event('change')); }
    else { c.value = value; c.dispatchEvent(new Event(c.tagName === 'SELECT' ? 'change' : 'input')); }
    await settle();
  };
  const fill = async (values: Record<string, string>) => { for (const [label, value] of Object.entries(values)) await set(label, value); };
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const click = async (text: string) => { button(text)!.click(); await settle(); };
  const errorBeside = (label: string) => {
    const described = control(label)?.getAttribute('aria-describedby');
    return described ? element.querySelector(`[id="${described}"][role="alert"]`)?.textContent ?? null : null;
  };
  await settle();
  return { fixture, element, source, writer, catalog, keys, settle, state, answer, control, set, fill, button, click, errorBeside };
}

const lead = { 'Nombre completo': 'Lider Ficticio Dos', 'Documento de identidad': 'DOC 5005', 'Correo electrónico': 'lider.dos@example.test',
  'Teléfono de contacto': '300 000 0005', 'Fecha de nacimiento': '1988-03-03' };
const extra = { 'Consentimiento informado o exoneración registrado.': 'true', 'Tipo de sangre': 'O+', 'Contacto de emergencia': 'Contacto Ficticio 302',
  'Restricciones físicas o movilidad reducida': 'Ninguna' };
const companion = { 'Nombre completo': 'Acompanante Ficticio', 'Documento de identidad': 'DOC 6006', 'Teléfono de contacto': '300 000 0006', 'Fecha de nacimiento': '2010-07-07' };

describe('everyScreenShowsOneOfTheFourStates', () => {
  it('shows loading, error with retry, empty and data', async () => {
    const p = await openPeople(); expect(p.state()).toBe('loading');
    p.source.requests[0].fail(); await p.settle(); expect(p.state()).toBe('error');
    await p.click('Reintentar'); expect(p.state()).toBe('loading');
    await p.answer(null); expect(p.state()).toBe('empty');
    p.fixture.componentInstance.reload(); await p.answer(groupWith(false)); expect(p.state()).toBe('data');
    expect(p.element.textContent).toContain('Lider Ficticio Uno');
  });
});

describe('registersTheLeadCustomerWithCompleteData', () => {
  it('sends the lead with every field labelled and the button disabled while pending', async () => {
    const p = await openPeople(); await p.answer(null);
    expect(Array.from(p.control('Tour')!.querySelectorAll('option'), (o) => o.textContent?.trim())).not.toContain('Cerrado de prueba');
    await p.set('Tour', 'svc-ordinary'); await p.fill({ ...lead, 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.': 'true' });
    await p.click('Registrar titular');
    expect(p.writer.calls).toHaveLength(1);
    expect(p.writer.calls[0]).toMatchObject({ kind: 'lead', command: { serviceId: 'svc-ordinary', fullName: 'Lider Ficticio Dos', document: 'DOC 5005', email: 'lider.dos@example.test', contact: '300 000 0005', acceptedTerms: true } });
    expect(p.writer.calls[0].command).not.toHaveProperty('highRisk');
    expect(p.button('Registrar titular')!.disabled).toBe(true);
    p.writer.calls[0].reply({ ...groupWith(false), lead: personNamed('Lider Ficticio Dos', 'DOC 5005', false) }); await p.settle();
    expect(p.state()).toBe('data'); expect(p.element.textContent).toContain('Lider Ficticio Dos');
  });
  it('refuses a lead who did not accept the terms', async () => {
    const p = await openPeople(); await p.answer(null);
    await p.set('Tour', 'svc-ordinary'); await p.fill(lead); await p.click('Registrar titular');
    expect(p.writer.calls).toHaveLength(0); expect(p.errorBeside('Confirmo que el cliente acepta las condiciones aplicables a esta reserva.')).toBeTruthy();
  });
});

describe('highRiskActivityRefusesTheLeadWithoutTheExtraData', () => {
  it('stops the lead and says beside each missing field why', async () => {
    const p = await openPeople(); await p.answer(null);
    await p.set('Tour', 'svc-risky'); await p.fill({ ...lead, 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.': 'true' });
    await p.click('Registrar titular');
    expect(p.writer.calls).toHaveLength(0);
    for (const label of Object.keys(extra)) expect(p.errorBeside(label)).toBeTruthy();
    await p.fill(extra); await p.click('Registrar titular');
    expect(p.writer.calls[0].command).toMatchObject({ highRisk: { informedConsent: true, bloodType: 'O+', emergencyContact: 'Contacto Ficticio 302', physicalRestrictions: 'Ninguna' } });
  });
});

describe('ordinaryActivityDoesNotAskForTheExtraData', () => {
  it('shows the extra fields only for a high-risk activity', async () => {
    const p = await openPeople(); await p.answer(null);
    await p.set('Tour', 'svc-ordinary');
    for (const label of Object.keys(extra)) expect(p.control(label)).toBeNull();
    await p.set('Tour', 'svc-risky');
    for (const label of Object.keys(extra)) expect(p.control(label)).not.toBeNull();
  });
});

describe('registersACompanionWithTheMinimumData', () => {
  it('adds a companion to the group and lists them', async () => {
    const p = await openPeople(); await p.answer(groupWith(false));
    expect(p.control('Tipo de sangre')).toBeNull(); expect(p.control('Correo electrónico')).toBeNull();
    await p.fill(companion); await p.click('Agregar acompañante');
    expect(p.writer.calls[0]).toMatchObject({ kind: 'companion', groupId: 'g-1', command: { fullName: 'Acompanante Ficticio', document: 'DOC 6006' } });
    expect(p.writer.calls[0].command).not.toHaveProperty('email');
    p.writer.calls[0].reply(groupWith(false, [personNamed('Acompanante Ficticio', 'DOC 6006', false)])); await p.settle();
    expect(p.element.querySelector('[data-state="data"]')?.textContent).toContain('Acompanante Ficticio');
  });
});

describe('aDocumentAlreadyInTheGroupIsRefused', () => {
  it('refuses the document of the lead beside the field and sends nothing', async () => {
    const p = await openPeople(); await p.answer(groupWith(false));
    await p.fill({ ...companion, 'Documento de identidad': ' doc1001 ' }); await p.click('Agregar acompañante');
    expect(p.writer.calls).toHaveLength(0); expect(p.errorBeside('Documento de identidad')).toBeTruthy();
  });
});

describe('highRiskActivityRefusesACompanionWithoutTheExtraData', () => {
  it('asks a companion of a high-risk group for the extra data', async () => {
    const p = await openPeople(); await p.answer(groupWith(true));
    await p.fill(companion); await p.click('Agregar acompañante');
    expect(p.writer.calls).toHaveLength(0);
    for (const label of Object.keys(extra)) expect(p.errorBeside(label)).toBeTruthy();
    await p.fill(extra); await p.click('Agregar acompañante');
    expect(p.writer.calls).toHaveLength(1);
  });
});

describe('sensitiveDataIsRestrictedWithoutThePermission', () => {
  const values = ['AB-', 'Asma leve', 'Contacto Ficticio 300'];
  it('keeps the values out of the page without the permission', async () => {
    const p = await openPeople('TENANT_ADMINISTRATOR', false); await p.answer(groupWith(true));
    expect(p.element.textContent).toContain('Restringido');
    for (const value of values) expect(p.element.querySelector('[data-state="data"]')!.innerHTML).not.toContain(value);
  });
  it('shows them to an administrator holding the permission', async () => {
    const p = await openPeople('TENANT_ADMINISTRATOR', true); await p.answer(groupWith(true));
    for (const value of values) expect(p.element.textContent).toContain(value);
  });
  it('masks a manager even with the permission', async () => {
    const p = await openPeople('MANAGER', true); await p.answer(groupWith(true));
    for (const value of values) expect(p.element.querySelector('[data-state="data"]')!.innerHTML).not.toContain(value);
  });
});

describe('managerReadsAccountantIsDeniedUnknownRoleIsReadOnly', () => {
  for (const role of ['MANAGER', 'ANALYST', 'READ_ONLY'] as const) {
    it(`lets ${role} read the people with no action`, async () => {
      const p = await openPeople(role); await p.answer(groupWith(false));
      expect(p.element.textContent).toContain('Lider Ficticio Uno');
      expect(p.element.querySelector('form')).toBeNull(); expect(p.button('Nuevo grupo')).toBeUndefined();
    });
  }
  it('denies the accountant without reading anything', async () => {
    const p = await openPeople('ACCOUNTANT');
    expect(p.element.querySelector('[role="alert"]')).not.toBeNull();
    expect(p.source.requests).toHaveLength(0); expect(p.element.querySelector('form, [data-state]')).toBeNull();
  });
});

describe('aRetriedRegistrationReusesItsIdempotencyKey', () => {
  it('sends one key for a double click and a retry, and a new one for the next person', async () => {
    const p = await openPeople(); await p.answer(null);
    await p.set('Tour', 'svc-ordinary'); await p.fill({ ...lead, 'Confirmo que el cliente acepta las condiciones aplicables a esta reserva.': 'true' });
    p.button('Registrar titular')!.click(); p.button('Registrar titular')!.click(); await p.settle();
    expect(p.writer.calls).toHaveLength(1);
    p.writer.calls[0].fail(apiError()); await p.settle();
    expect(p.element.textContent).toContain('The change was refused.');
    await p.click('Registrar titular');
    expect(p.writer.calls[1].key).toBe(p.writer.calls[0].key);
    p.writer.calls[1].reply(groupWith(false)); await p.settle();
    await p.fill(companion); await p.click('Agregar acompañante');
    expect(p.writer.calls[2].key).not.toBe(p.writer.calls[0].key);
  });
  it('makes a new key when the person changes the data after a refusal', async () => {
    const p = await openPeople(); await p.answer(groupWith(false));
    await p.fill(companion); await p.click('Agregar acompañante');
    p.writer.calls[0].fail(apiError()); await p.settle();
    await p.set('Nombre completo', 'Otro Acompanante'); await p.click('Agregar acompañante');
    expect(p.writer.calls[1].key).not.toBe(p.writer.calls[0].key);
  });
});

describe('the screen follows the authorized screen 10B, in Spanish', () => {
  const texts = (p: { element: HTMLElement }, selector: string) => Array.from(p.element.querySelectorAll(selector), (e) => e.textContent?.trim());
  it('draws the header and panel 01 with the labels of the mockup', async () => {
    const p = await openPeople(); await p.answer(null);
    expect(p.element.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe('Gestión comercial');
    expect(p.element.querySelector('h1')?.textContent?.trim()).toBe('Titular y acompañantes');
    expect(texts(p, '.crp-operator-panel .crp-operator-eyebrow')).toContain('01. Cliente titular');
    expect(texts(p, '.crp-operator-panel h2')).toContain('Datos para asociar la reserva');
    for (const label of Object.keys(lead)) expect(p.control(label)).not.toBeNull();
    expect(p.element.textContent).toContain('Aún no hay grupo');
  });
  it('refuses a lead without e-mail in Spanish beside the field', async () => {
    const p = await openPeople(); await p.answer(null);
    await p.set('Tour', 'svc-ordinary'); await p.click('Registrar titular');
    expect(p.errorBeside('Correo electrónico')).toBe('Obligatorio.');
    await p.set('Correo electrónico', 'sin-arroba'); await p.click('Registrar titular');
    expect(p.errorBeside('Correo electrónico')).toBe('Escribe un correo válido.');
  });
  it('draws panel 03 with one card per companion and the next companion form', async () => {
    const p = await openPeople(); await p.answer(groupWith(false, [personNamed('Acompanante Ficticio', 'DOC 6006', false)]));
    expect(texts(p, '.crp-operator-panel .crp-operator-eyebrow')).toContain('03. Acompañantes');
    expect(p.element.textContent).toContain('Los documentos no pueden repetirse dentro de la misma reserva.');
    expect(texts(p, '.customers-card > strong')).toEqual(['Acompañante 1', 'Acompañante 2']);
    expect(p.element.querySelector('.customers-grid h2, .customers-grid strong')).toBeNull();
  });
  it('shows dates as 01 may 1990 and no English or raw value', async () => {
    const p = await openPeople(); await p.answer(groupWith(true));
    const data = p.element.querySelector('[data-state="data"]')!.textContent!;
    expect(data).toContain('01 may 1990'); expect(data).not.toContain('1990-05-01');
    for (const english of ['Companion', 'Lead customer', 'Restricted', 'Full name', 'Birth date', 'Given', 'High-risk', 'Demo data'])
      expect(p.element.textContent).not.toContain(english);
  });
  it('draws the high-risk panel per person with its labels', async () => {
    const p = await openPeople('TENANT_ADMINISTRATOR', true); await p.answer(groupWith(true, [personNamed('Acompanante Ficticio', 'DOC 6006')]));
    expect(texts(p, '.crp-operator-panel .crp-operator-eyebrow')).toContain('Requisitos de actividad de riesgo');
    expect(texts(p, '.customers-risk-card > strong')).toEqual(['Titular', 'Acompañante 1']);
    for (const label of ['Tipo de sangre', 'Contacto de emergencia', 'Restricciones físicas o movilidad reducida', 'Consentimiento informado o exoneración registrado.'])
      expect(p.element.textContent).toContain(label);
  });
});

import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthorizableReasons } from '../src/app/current-discounts/data/authorizable-reasons';
import { DemoAuthorizableReasons } from '../src/app/demo/authorizable-reasons-demo';
import { ActorContext } from '../src/app/shared/actor-context';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { apiError } from './catalog-items-writer.double';
import { openReasons, reasonsOf } from './authorizable-reasons.double';
import { AUTHORIZABLE_REASONS_PANEL } from '../src/app/current-discounts/components/authorizable-reasons-panel.component';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-004 amendment 2026-10-14 (mockup PDR v1.9), AC-CD.13: the panel "Parametrización / Motivos autorizables" of admin-descuentos.html.
const ready = async (...names: string[]) => { const p = await openReasons(); p.port.requests[0].reply(reasonsOf(...(names.length ? names : ['Fidelización', 'Convenio comercial']))); await p.settle(); return p; };

describe('thePanelDrawsTheEnabledReasonsAndTheFormOfTheMockup', () => {
  it('draws the texts, one row per reason with "Quitar", and "Nuevo motivo" with "Agregar motivo"', async () => {
    const p = await ready();
    expect(p.element.querySelector('.crp-operator-eyebrow')?.textContent).toBe('Parametrización');
    expect(p.element.querySelector('h2')?.textContent).toBe('Motivos autorizables');
    expect(p.element.querySelector('.crp-operator-copy')?.textContent).toBe('Define los motivos por los que se puede autorizar un descuento adicional (por ejemplo, fidelización).');
    expect(p.items()).toEqual(['Fidelización', 'Convenio comercial']);
    expect(Array.from(p.element.querySelectorAll('li button'), (b) => b.textContent?.trim())).toEqual(['Quitar', 'Quitar']);
    expect(Array.from(p.element.querySelectorAll('label'), (l) => l.textContent?.trim())).toEqual(['Nuevo motivo']);
    expect(p.field().getAttribute('placeholder')).toBe('Ej. Cortesía por referido');
    expect(p.element.querySelector('form button')?.textContent?.trim()).toBe('Agregar motivo');
  });

  it('goes through loading, error with retry, data and empty', async () => {
    const p = await openReasons();
    expect(p.state()).toBe('loading');
    p.port.requests[0].fail(); await p.settle();
    expect(p.state()).toBe('error');
    Array.from(p.element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click(); await p.settle();
    expect(p.state()).toBe('loading');
    p.port.requests[1].reply([]); await p.settle();
    expect(p.state()).toBe('empty');
    expect(p.element.textContent).toContain('Aún no hay motivos habilitados.');
  });
});

describe('theReasonsPanelAddsRemovesAndRefusesDuplicatesAndTheLastRemoval', () => {
  it('adds a reason through the port with one Idempotency-Key and shows the list it answers', async () => {
    const p = await ready();
    await p.type('  Cortesía por referido ');
    await p.submit();
    expect(p.port.changes).toHaveLength(1);
    expect(p.port.changes[0]).toMatchObject({ kind: 'add', reason: 'Cortesía por referido' });
    p.port.changes[0].reply(reasonsOf('Fidelización', 'Convenio comercial', 'Cortesía por referido')); await p.settle();
    expect(p.items()).toEqual(['Fidelización', 'Convenio comercial', 'Cortesía por referido']);
    expect(p.field().value).toBe('');
  });

  it('refuses an empty reason beside the field, focuses it and sends nothing', async () => {
    const p = await ready();
    document.body.append(p.element);
    await p.type('   '); await p.submit();
    expect(p.error()).toBe('Escribe el motivo que se podrá autorizar.');
    expect(p.field().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(p.field());
    expect(p.port.changes).toHaveLength(0);
    p.element.remove();
  });

  it('shows the refusal of the port for a duplicate and keeps the typed text and the key on a retry', async () => {
    const p = await ready();
    await p.type('fidelización'); await p.submit();
    p.port.changes[0].fail(apiError({ status: 409, userMessage: 'Ese motivo ya está habilitado.' })); await p.settle();
    expect(p.error()).toBe('Ese motivo ya está habilitado.');
    expect(p.field().value).toBe('fidelización');
    await p.submit();
    expect(p.port.changes[1].key).toBe(p.port.changes[0].key);
    p.port.changes[1].fail(apiError()); await p.settle();
    await p.type('Otro motivo'); await p.submit();
    expect(p.port.changes[2].key).not.toBe(p.port.changes[0].key);
  });

  it('removes a reason through the port with "Quitar"', async () => {
    const p = await ready();
    p.removeButton('Convenio comercial').click(); await p.settle();
    expect(p.port.changes[0]).toMatchObject({ kind: 'remove', reason: 'Convenio comercial' });
    p.port.changes[0].reply(reasonsOf('Fidelización')); await p.settle();
    expect(p.items()).toEqual(['Fidelización']);
  });

  it('cannot remove the last reason: its "Quitar" is disabled and nothing is sent', async () => {
    const p = await ready('Fidelización');
    expect(p.removeButton('Fidelización').disabled).toBe(true);
    p.removeButton('Fidelización').click(); await p.settle();
    expect(p.port.changes).toHaveLength(0);
  });

  it('blocks a second change while one is pending', async () => {
    const p = await ready();
    await p.type('Uno'); await p.submit(); await p.submit();
    expect(p.port.changes).toHaveLength(1);
    expect(p.removeButton('Fidelización').disabled).toBe(true);
  });
});

describe('onlyTheAdministratorSeesTheReasonsPanel', () => {
  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('offers %s no panel', (role) => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as ActorRole) }, { provide: AuthorizableReasons, useValue: new DemoAuthorizableReasons() }] });
    expect(AUTHORIZABLE_REASONS_PANEL.isAvailable!(TestBed.inject(Injector))).toBe(false);
  });

  it('offers it to the Administrator only while the build supplies the port', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }] });
    expect(AUTHORIZABLE_REASONS_PANEL.isAvailable!(TestBed.inject(Injector))).toBe(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: AuthorizableReasons, useValue: new DemoAuthorizableReasons() }] });
    expect(AUTHORIZABLE_REASONS_PANEL.isAvailable!(TestBed.inject(Injector))).toBe(true);
  });
});

describe('theDemoReasonsKeepTheMockupRules', () => {
  const run = (answer: Promise<unknown>) => answer.then(() => null, (e: { status: number; userMessage: string }) => e);
  it('starts with the three reasons of the mockup and adds one per Idempotency-Key', async () => {
    const port = new DemoAuthorizableReasons();
    expect((await firstValueFrom(port.list())).map((r) => r.reason)).toEqual(['Fidelización', 'Compensación por inconveniente', 'Convenio comercial']);
    const first = await firstValueFrom(port.add('Cortesía por referido', 'k1'));
    expect(await firstValueFrom(port.add('Cortesía por referido', 'k1'))).toEqual(first);
    expect(first.map((r) => r.reason)).toContain('Cortesía por referido');
    expect(first.every((r) => r.removable)).toBe(true);
  });

  it('refuses an empty reason and a duplicate that differs only in case', async () => {
    const port = new DemoAuthorizableReasons();
    expect(await run(firstValueFrom(port.add('  ', 'k1')))).toMatchObject({ status: 422, userMessage: 'Escribe el motivo que se podrá autorizar.' });
    expect(await run(firstValueFrom(port.add('FIDELIZACIÓN', 'k2')))).toMatchObject({ status: 409, userMessage: 'Ese motivo ya está habilitado.' });
  });

  it('removes a reason, never the last one', async () => {
    const port = new DemoAuthorizableReasons(['Fidelización', 'Convenio comercial']);
    const left = await firstValueFrom(port.remove('Convenio comercial', 'k1'));
    expect(left).toEqual([{ reason: 'Fidelización', removable: false }]);
    expect(await run(firstValueFrom(port.remove('Fidelización', 'k2')))).toMatchObject({ status: 409 });
  });
});

describe('theReasonsPanelFocusesTheFieldWhenThePortalRefuses', () => {
  it('moves the focus to the field of the reason that the port refused', async () => {
    const p = await ready(); document.body.append(p.element);
    await p.type('Cortesia por referido'); await p.submit();
    p.port.changes[0].fail(apiError()); await p.settle();
    expect(p.field().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(p.field());
    p.element.remove();
  });
});
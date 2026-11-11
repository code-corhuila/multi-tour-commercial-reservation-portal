import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

async function openPage(role: ActorRole, options: { writer?: boolean; areas?: readonly string[] } = {}) {
  const source = new ControllableEstablishmentsSource();
  const navigation = new PortalNavigation();
  if (options.areas) { navigation.register(options.areas); }
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    ...(options.writer ? [{ provide: AssociatedEstablishmentsWriter, useValue: new ControllableEstablishmentsWriter() }] : []),
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: ActorContext, useValue: actorAs(role, true) },
    ...(options.areas ? [{ provide: PortalNavigation, useValue: navigation }] : []),
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find((node) => node.textContent?.trim() === text);
  const headers = () => Array.from(element.querySelectorAll('th'), (th) => th.textContent?.trim());
  return { source, navigation, settle, element, button, headers };
}

describe('theTypeFilterOffersAllTypes', () => {
  it('starts on "Todos los tipos" and lists hotels and restaurants together', async () => {
    const { source, settle, element } = await openPage('TENANT_ADMINISTRATOR');
    const type = element.querySelector<HTMLSelectElement>('select[aria-label="Tipo de establecimiento"]')!;
    expect(type.options[type.selectedIndex].textContent?.trim()).toBe('Todos los tipos');
    source.requests[0].reply([establishmentNamed('Hotel Alpha'), establishmentNamed('Restaurant Beta', 'RESTAURANT')]); await settle();
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
  });
  it('goes back to every type after choosing one', async () => {
    const { source, settle, element } = await openPage('TENANT_ADMINISTRATOR');
    const type = element.querySelector<HTMLSelectElement>('select[aria-label="Tipo de establecimiento"]')!;
    type.value = 'RESTAURANT'; type.dispatchEvent(new Event('change')); await settle();
    expect(source.requests.at(-1)!.filters).toEqual({ establishmentType: 'RESTAURANT' });
    type.value = ''; type.dispatchEvent(new Event('change')); await settle();
    expect(source.requests.at(-1)!.filters).toEqual({});
  });
});

describe('theActionColumnIsOnlyForWhoCanAct', () => {
  it('the administrator with the writer sees the Acción column', async () => {
    const { source, settle, headers } = await openPage('TENANT_ADMINISTRATOR', { writer: true });
    source.requests[0].reply([establishmentNamed('Hotel Alpha')]); await settle();
    expect(headers()).toEqual(['Establecimiento', 'Información comercial', 'Estado', 'Acción']);
  });
  for (const role of ['ANALYST', 'MANAGER'] as const) {
    it(`${role} reads the list without the Acción column`, async () => {
      const { source, settle, headers, element } = await openPage(role, { writer: true });
      source.requests[0].reply([establishmentNamed('Hotel Alpha')]); await settle();
      expect(headers()).toEqual(['Establecimiento', 'Información comercial', 'Estado']);
      expect(element.querySelector('tbody tr')!.children.length).toBe(3);
    });
  }
});

describe('backToCatalogs', () => {
  it('opens Catálogos from "Volver a catálogos" as admin-gestionar-hospedaje.html', async () => {
    const { button, navigation, settle } = await openPage('TENANT_ADMINISTRATOR', { areas: ['catalog', 'establishments'] });
    button('Volver a catálogos')!.click(); await settle();
    expect(navigation.selected()).toBe('catalog');
  });
  it('is not drawn when the build has no Catálogos area', async () => {
    const { button } = await openPage('TENANT_ADMINISTRATOR', { areas: ['establishments'] });
    expect(button('Volver a catálogos')).toBeUndefined();
  });
});

describe('theFormNamesTheEstablishmentInALine', () => {
  it('asks the name in a one-line input and picks the image with a Spanish button', async () => {
    const { button, settle, element } = await openPage('TENANT_ADMINISTRATOR', { writer: true });
    button(ESTABLISHMENTS_COPY.newEstablishment)!.click(); await settle();
    expect(element.querySelector('[name="commercialName"]')!.tagName).toBe('INPUT');
    expect(element.querySelector('.crp-file-picker')?.textContent).toContain('Seleccionar archivo');
  });
});

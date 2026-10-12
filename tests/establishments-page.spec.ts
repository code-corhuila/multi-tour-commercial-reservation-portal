import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { PORTAL_ROUTES } from '../src/app/catalog/catalog.routes';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { ESTABLISHMENT_TYPES, AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';
import { EstablishmentsPageComponent, EstablishmentsPageState } from '../src/app/establishments/pages/establishments-page.component';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';

async function openPage(role?: ActorRole, enabled = false) {
  const source = new ControllableEstablishmentsSource();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    ...(role ? [{ provide: ActorContext, useValue: actorAs(role, enabled) }] : []),
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const regions = () => Array.from(element.querySelectorAll('[data-state]'), (node) => node.getAttribute('data-state'));
  const select = async (label: string, value: string) => {
    const control = element.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    control.value = value;
    control.dispatchEvent(new Event('change'));
    await settle();
  };
  return { source, fixture, element, settle, regions, select };
}

describe('everyScreenShowsOneOfTheFourStates', () => {
  it('RN-PE2 shows loading while waiting and starts without type or status restrictions', async () => {
    const { regions, source } = await openPage();
    expect(regions()).toEqual(['loading']);
    expect(source.requests[0].filters).toEqual({});
  });
  it('RN-PE2 shows empty distinctly from error', async () => {
    const { source, settle, regions, element } = await openPage();
    source.requests[0].reply([]); await settle();
    expect(regions()).toEqual(['empty']);
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain(ESTABLISHMENTS_COPY.empty);
  });
  it('RN-PE2 shows an error with a working retry that returns to loading and then data', async () => {
    const { source, settle, regions, element } = await openPage();
    source.requests[0].fail(); await settle();
    expect(regions()).toEqual(['error']);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('button')!.click(); await settle();
    expect(regions()).toEqual(['loading']);
    source.requests[1].reply([establishmentNamed('Recovered')]); await settle();
    expect(regions()).toEqual(['data']);
    expect(element.textContent).toContain('Recovered');
  });
  describe('oneScreenHandlesHotelAndRestaurant', () => {
  it('RN-PE10 shows a hotel and an inactive restaurant in the same list with their information and status', async () => {
    const { source, settle, regions, element } = await openPage('TENANT_ADMINISTRATOR');
    source.requests[0].reply([establishmentNamed('Hotel Alpha'), {
      ...establishmentNamed('Restaurant Beta', 'RESTAURANT'), associationStatus: 'INACTIVE',
    }]); await settle();
    expect(regions()).toEqual(['data']);
    expect(element.querySelectorAll('table').length).toBe(1);
    expect(element.querySelectorAll('tbody tr').length).toBe(2);
    for (const text of ['Hotel Alpha', 'Restaurant Beta', ESTABLISHMENTS_COPY.types.HOTEL, ESTABLISHMENTS_COPY.types.RESTAURANT, 'ACTIVE', 'INACTIVE', 'Contact the establishment directly.']) {
      expect(element.querySelector('table')!.textContent).toContain(text);
    }
    expect(element.querySelector('table')!.textContent).not.toMatch(/ACTIVE|HOTEL|RESTAURANT/);
    expect(Array.from(element.querySelectorAll('th'), (th) => th.textContent)).toEqual(['Establecimiento', 'Información comercial', 'Estado', 'Acción']);
    expect(element.querySelector('img, form, button')).toBeNull();
  });
  });
  it('inherits exactly the four PageState kinds and carries establishment records', () => {
    expectTypeOf<EstablishmentsPageState['kind']>().toEqualTypeOf<'loading' | 'error' | 'empty' | 'data'>();
    expectTypeOf<Extract<EstablishmentsPageState, { kind: 'data' }>['items']>().toEqualTypeOf<readonly AssociatedEstablishment[]>();
  });
});

describe('theNewestRequestReplacesThePreviousOne', () => {
  it('RN-PE3 a slow previous response never overwrites a newer filter response', async () => {
    const { source, settle, element, select } = await openPage();
    await select('Tipo de establecimiento', 'RESTAURANT');
    expect(source.requests.length).toBe(2);
    source.requests[1].reply([establishmentNamed('Fast', 'RESTAURANT')]); await settle();
    source.requests[0].reply([establishmentNamed('Slow')]); await settle();
    expect(element.querySelector('table')!.textContent).toContain('Fast');
    expect(element.querySelector('table')!.textContent).not.toContain('Slow');
    expect(source.requests[0].isOpen()).toBe(false);
  });
  it('cancels an outstanding request when the page lifetime ends', async () => {
    const { fixture, source } = await openPage();
    TestBed.resetTestingModule();
    expect(source.requests[0].isOpen()).toBe(false);
  });
});

describe('theTypeSelectorOffersExactlyHotelAndRestaurant', () => {
  it('RN-PE10 offers exactly HOTEL and RESTAURANT and sends both filters to the source', async () => {
    const { element, select, source } = await openPage();
    expect(ESTABLISHMENT_TYPES).toEqual(['HOTEL', 'RESTAURANT']);
    expect(Array.from(element.querySelectorAll<HTMLOptionElement>('select[aria-label="Tipo de establecimiento"] option'), (option) => option.value))
      .toEqual(['HOTEL', 'RESTAURANT']);
    await select('Tipo de establecimiento', 'HOTEL');
    await select('Estado de la asociación', 'INACTIVE');
    expect(source.requests.at(-1)!.filters).toEqual({ establishmentType: 'HOTEL', associationStatus: 'INACTIVE' });
    await select('Estado de la asociación', '');
    element.querySelector<HTMLButtonElement>('button')!.click();
    expect(source.requests.at(-1)!.filters).toEqual({});
  });
});

describe('establishmentAccessUsesTheContainerActor', () => {
  for (const role of ['OPERATIONAL_COLLABORATOR', 'ACCOUNTANT'] as const) {
    it(`${role} sees no list or filters and cannot request data even with the tenant flag enabled`, async () => {
      const { source, element, fixture } = await openPage(role, true);
      fixture.componentInstance.reload();
      expect(source.requests).toEqual([]);
      expect(element.querySelector('table, select, button')).toBeNull();
      expect(element.querySelector('[data-state="denied"]')).not.toBeNull();
    });
    it(`${role} cannot activate the provisional route`, async () => {
      const source = new ControllableEstablishmentsSource();
      TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES),
        { provide: ActorContext, useValue: actorAs(role) },
        { provide: AssociatedEstablishmentsSource, useValue: source },
      ] });
      const harness = await RouterTestingHarness.create();
      await expect(harness.navigateByUrl('/establishments')).rejects.toThrow('Cannot match any routes');
      expect(harness.routeNativeElement).toBeNull();
      expect(source.requests).toEqual([]);
    });
  }
  for (const role of ['MANAGER', 'ANALYST', undefined] as const) {
    it(`${role ?? 'no actor'} reads the list without business actions`, async () => {
      const { source, settle, element } = await openPage(role);
      source.requests[0].reply([establishmentNamed('Readable')]); await settle();
      expect(element.querySelector('table')!.textContent).toContain('Readable');
      expect(element.querySelector('button, form, img')).toBeNull();
    });
  }
  it('the provisional route admits the administrator and points to exactly one establishments page', async () => {
    const source = new ControllableEstablishmentsSource();
    TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES),
      { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      { provide: AssociatedEstablishmentsSource, useValue: source },
    ] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/establishments', EstablishmentsPageComponent);
    expect(source.requests.length).toBe(1);
    expect(PORTAL_ROUTES.filter((route) => route.component === EstablishmentsPageComponent).length).toBe(1);
  });
});

describe('theFiltersSpeakSpanish', () => {
  it('labels the filters and their options in Spanish and never shows a status code', async () => {
    const { element, select } = await openPage();
    const options = (label: string) => Array.from(element.querySelectorAll<HTMLOptionElement>(`select[aria-label="${label}"] option`), (option) => option.textContent?.trim());
    expect(Array.from(element.querySelectorAll('.crp-filters label'), (label) => label.textContent)).toEqual(['Tipo de establecimiento', 'Estado de la asociación']);
    expect(options('Tipo de establecimiento')).toEqual(['Alojamiento', 'Restaurante']);
    expect(options('Estado de la asociación')).toEqual(['Todos los estados', 'Activo', 'Inactivo']);
    await select('Estado de la asociación', 'ACTIVE');
    expect(element.querySelector('.crp-filters button')?.textContent?.trim()).toBe('Limpiar filtros');
  });
});

import { TestBed } from '@angular/core/testing';
import { fireEvent, within } from '@testing-library/dom';
import { describe, expect, it } from 'vitest';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { EstablishmentType } from '../src/app/establishments/model/associated-establishment';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource } from './associated-establishments-source.double';

// Amendment 2026-10-14 (mockup PDR v1.9) of HU-COM-002, T-V19-1 (AC-PE.12): the hub opens the one page with the type of its card.
async function open(type?: EstablishmentType) {
  const source = new ControllableEstablishmentsSource();
  const navigation = new PortalNavigation();
  navigation.register(['catalog', 'establishments']);
  navigation.open('establishments', type ? { type } : {});
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source }, { provide: PortalNavigation, useValue: navigation },
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { host, source, navigation, ui: within(host), settle: async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); } };
}

describe('oneComponentServesBothAreasWithTheirOwnTexts', () => {
  it('draws the lodging eyebrow, title and note and asks only for hotels', async () => {
    const { host, source, ui } = await open('HOTEL');
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Alojamiento asociado');
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Establecimientos de alojamiento');
    expect(host.querySelector('.crp-access-note')?.textContent).toContain('Los hoteles son establecimientos asociados por convenio');
    expect(source.requests[0].filters).toEqual({ establishmentType: 'HOTEL' });
  });

  it('draws the food eyebrow, title and note and asks only for restaurants', async () => {
    const { host, source, ui } = await open('RESTAURANT');
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Alimentación asociada');
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Restaurantes asociados');
    expect(host.querySelector('.crp-access-note')?.textContent).toContain('Los restaurantes son establecimientos asociados por convenio');
    expect(source.requests[0].filters).toEqual({ establishmentType: 'RESTAURANT' });
  });

  it('keeps the generic texts when no type is given', async () => {
    const { host, ui } = await open();
    expect(ui.getByRole('heading', { level: 1 }).textContent).toBe('Establecimientos asociados');
    expect(host.querySelector('.crp-page-header-eyebrow')?.textContent).toBe('Catálogos');
  });

  it('offers "Volver a catálogos", which opens the hub through the navigation', async () => {
    const { ui, navigation, settle } = await open('HOTEL');
    fireEvent.click(ui.getByRole('button', { name: 'Volver a catálogos' }));
    await settle();
    expect(navigation.selected()).toBe('catalog');
  });
});

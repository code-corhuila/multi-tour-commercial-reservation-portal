import { Injector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ADDITIONAL_DISCOUNT_CONTRIBUTIONS, AdditionalDiscountSearchComponent } from '../src/app/current-discounts/components/additional-discount-entries.component';
import { ADDITIONAL_DISCOUNT_ENTRY_COPY } from '../src/app/current-discounts/current-discounts-copy';
import { ADDITIONAL_DISCOUNT_AREA, ADDITIONAL_DISCOUNT_MODE, AdditionalDiscountEligibility } from '../src/app/current-discounts/data/additional-discount-eligibility';
import { AdditionalDiscountContexts } from '../src/app/current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountWriter } from '../src/app/current-discounts/data/additional-discount-writer';
import { DemoAdditionalDiscountEligibility } from '../src/app/demo/current-discounts-demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { Reservation } from '../src/app/reservations/model/reservation';
import { ActorContext } from '../src/app/shared/actor-context';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { DiscountRulesSource } from '../src/app/discounts/data/discount-rules-source';
import { DiscountsPageComponent } from '../src/app/discounts/pages/discounts-page.component';
import { DISCOUNTS_PAGE_PANELS, slotEntries } from '../src/app/shared/portal-slots';
import { ControllableAdditionalDiscountWriter, ControllableContexts } from './additional-discount.double';
import { actorAs } from './actor-context.double';
import { ControllableReservations, reservationOf, reservationProviders, screenOf } from './reservations.double';
import { ControllableDiscountRulesSource } from './discount-rules-source.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-004 amendment 2026-10-14 (mockup PDR v1.9), AC-CD.7 and AC-CD.10: the entrances to "Aplicar descuento".
const withEligibility: Provider[] = [{ provide: AdditionalDiscountEligibility, useValue: new DemoAdditionalDiscountEligibility() }, ...ADDITIONAL_DISCOUNT_CONTRIBUTIONS];
const screenPorts: Provider[] = [{ provide: AdditionalDiscountContexts, useValue: new ControllableContexts() }, { provide: AdditionalDiscountWriter, useValue: new ControllableAdditionalDiscountWriter() }];

const RESERVATIONS: readonly Reservation[] = [
  reservationOf('RES-P', { status: 'PENDIENTE_DE_PAGO' }), reservationOf('RES-C', { status: 'CONFIRMADA', balanceCents: 1000 }),
  reservationOf('RES-E', { status: 'EN_EJECUCION' }), reservationOf('RES-F', { status: 'FINALIZADA' }), reservationOf('RES-X', { status: 'CANCELADA' }),
];

async function reservationsInMode(role: ActorRole, mode?: string) {
  const navigation = new PortalNavigation();
  navigation.register(['reservations', 'payment-management', ADDITIONAL_DISCOUNT_AREA]);
  if (mode) navigation.open('reservations', { mode });
  const source = new ControllableReservations();
  const screen = await screenOf(ReservationsPageComponent, [
    ...reservationProviders({ role, reservations: source }), ...withEligibility, { provide: PortalNavigation, useValue: navigation },
  ]);
  source.inner.requests[0].reply(RESERVATIONS);
  await screen.settle();
  const rowOf = (code: string) => Array.from(screen.element.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(`#${code}`))!;
  const applyIn = (code: string) => Array.from(rowOf(code).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Aplicar descuento');
  return { ...screen, navigation, rowOf, applyIn };
}

describe('theSearchOpensReservationsInModeAndMarksOnlyEligibleRows', () => {
  it('draws the panel "Decisiones excepcionales / Descuento adicional" with "Buscar una reserva" in Descuentos, through its slot', async () => {
    const source = new ControllableDiscountRulesSource();
    TestBed.configureTestingModule({ providers: [{ provide: DiscountRulesSource, useValue: source }, { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      ...screenPorts, ...withEligibility] });
    const fixture = TestBed.createComponent(DiscountsPageComponent);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle(); source.requests[0].reply([]); await settle();
    const element: HTMLElement = fixture.nativeElement;
    const panel = Array.from(element.querySelectorAll('section')).find((s) => s.textContent?.includes('Decisiones excepcionales'))!;
    expect(panel.querySelector('.crp-operator-eyebrow')?.textContent).toBe('Decisiones excepcionales');
    expect(panel.querySelector('h2')?.textContent).toBe('Descuento adicional');
    expect(panel.textContent).toContain('Solo el Administrador del tenant puede autorizar descuentos adicionales, y únicamente por alguno de los motivos habilitados. Toda autorización debe registrar el motivo y quedar asociada a la reserva.');
    expect(panel.querySelector('button')?.textContent?.trim()).toBe('Buscar una reserva');
  });

  it('opens Reservas in mode through the navigation, with no address', async () => {
    const navigation = new PortalNavigation();
    navigation.register(['reservations']);
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: PortalNavigation, useValue: navigation }] });
    const fixture = TestBed.createComponent(AdditionalDiscountSearchComponent);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(navigation.selected()).toBe('reservations');
    expect(navigation.params()).toEqual({ mode: ADDITIONAL_DISCOUNT_MODE });
  });

  it('draws the banner and "Aplicar descuento" only on Pendiente de pago and Confirmada', async () => {
    const p = await reservationsInMode('TENANT_ADMINISTRATOR', ADDITIONAL_DISCOUNT_MODE);
    expect(p.element.textContent).toContain('Selecciona la reserva a la que deseas aplicar un descuento adicional.');
    expect(Array.from(p.element.querySelectorAll('tbody button')).filter((b) => b.textContent?.trim() === 'Aplicar descuento')).toHaveLength(2);
    expect(p.applyIn('RES-P')).toBeTruthy();
    expect(p.applyIn('RES-C')).toBeTruthy();
    p.button('Ver todas las reservas')!.click(); await p.settle();
    expect(Array.from(p.element.querySelectorAll('tbody button')).filter((b) => b.textContent?.trim() === 'Aplicar descuento')).toHaveLength(2);
    for (const code of ['RES-E', 'RES-F', 'RES-X']) expect(p.applyIn(code), code).toBeUndefined();
  });

  it('keeps "Ver detalle" and drops the payment actions while the mode is open', async () => {
    const p = await reservationsInMode('TENANT_ADMINISTRATOR', ADDITIONAL_DISCOUNT_MODE);
    const labels = Array.from(p.rowOf('RES-P').querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Ver detalle', 'Aplicar descuento']);
  });

  it('opens the screen "Aplicar descuento" of the chosen reservation, through the navigation', async () => {
    const p = await reservationsInMode('TENANT_ADMINISTRATOR', ADDITIONAL_DISCOUNT_MODE);
    p.applyIn('RES-C')!.click();
    expect(p.navigation.selected()).toBe(ADDITIONAL_DISCOUNT_AREA);
    expect(p.navigation.params()).toEqual({ reservation: 'RES-C' });
  });

  it('draws the list as always when no mode is open', async () => {
    const p = await reservationsInMode('TENANT_ADMINISTRATOR');
    expect(p.element.textContent).not.toContain('Selecciona la reserva a la que deseas aplicar un descuento adicional.');
    expect(p.applyIn('RES-P')).toBeUndefined();
    expect(Array.from(p.rowOf('RES-P').querySelectorAll('button')).map((b) => b.textContent?.trim())).toContain('Gestionar pago');
  });
});

describe('onlyTheAdministratorSeesTheButtonTheModeAndTheScreen', () => {
  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('%s opened in the mode gets the plain list: no banner and no action', async (role) => {
    const p = await reservationsInMode(role as ActorRole, ADDITIONAL_DISCOUNT_MODE);
    expect(p.element.textContent).not.toContain('Selecciona la reserva a la que deseas aplicar un descuento adicional.');
    expect(p.element.textContent).not.toContain('Aplicar descuento');
  });

  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('%s is offered neither the search panel nor the screen', (role) => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as ActorRole) }, ...withEligibility,
      ...screenPorts] });
    const injector = TestBed.inject(Injector);
    const area = PORTAL_AREAS.find((a) => a.key === ADDITIONAL_DISCOUNT_AREA)!;
    expect(area.isAvailable!(injector)).toBe(false);
    expect(slotEntries(DISCOUNTS_PAGE_PANELS, injector)).toEqual([]);
    const contributed = ADDITIONAL_DISCOUNT_CONTRIBUTIONS.map((p) => (p as { useValue: { isAvailable: (i: Injector) => boolean } }).useValue);
    expect(contributed.every((entry) => entry.isAvailable(injector) === false)).toBe(true);
  });

  it('offers the screen to the Administrator, as a sub-screen of Descuentos with no sidebar item', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, ...withEligibility,
      ...screenPorts] });
    const area = PORTAL_AREAS.find((a) => a.key === ADDITIONAL_DISCOUNT_AREA)!;
    expect(area).toMatchObject({ key: 'additional-discount', label: 'Aplicar descuento', menu: false, parent: 'discounts' });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
    expect(PORTAL_AREAS.some((a) => a.key === 'current-discounts')).toBe(false);
  });
});

describe('theDemoEligibilityMarksOnlyPendingAndConfirmedReservations', () => {
  it('answers from the state of the reservation, and the copy keeps the texts out of the templates', () => {
    const port = new DemoAdditionalDiscountEligibility();
    expect(['PENDIENTE_DE_PAGO', 'CONFIRMADA', 'EN_EJECUCION', 'FINALIZADA', 'CANCELADA'].map((status) => port.isEligible({ status }))).toEqual([true, true, false, false, false]);
    expect(ADDITIONAL_DISCOUNT_ENTRY_COPY.search).toBe('Buscar una reserva');
  });
});

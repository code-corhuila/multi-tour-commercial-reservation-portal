import { Component, InjectionToken, Provider, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps, PortalApiClient } from '../src/app/shell-contract';
import { PORTAL_AREA_LIST, PortalArea } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PortalShellComponent } from '../src/app/portal-shell.component';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { ActorContext } from '../src/app/shared/actor-context';
import {
  CHECKOUT_BLOCKS, CLIENT_NOTICES, CLIENT_QUICK_ACTIONS, PAYMENTS_PAGE_PANELS, PAYMENTS_ROW_ACTIONS, PAYMENT_MANAGEMENT_ACTIONS,
  PortalSlot, PortalSlotOutlet, RESERVATION_CARD_ACTIONS, RESERVATION_CARD_EXTRAS, RESERVATION_DETAIL_ACTIONS, RESERVATION_DETAIL_BLOCKS, RESERVATION_ROW_ACTIONS, TRANSFER_PAYMENT_LINES, contribute,
} from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { reservationOf, reservationProviders, screenOf } from './reservations.double';
import { of } from 'rxjs';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-001 amendment 2026-10-13 (2), point 2: a sub-screen opened from another area has no sidebar item of its own.
@Component({ selector: 'crp-test-list', template: '<h1>Lista</h1>' })
class ListDouble {}
@Component({ selector: 'crp-test-sub', template: '<h1>Subpantalla</h1>' })
class SubScreenDouble {}
const OPERATOR_AREAS: PortalArea[] = [
  { key: 'first', label: 'Catálogos', component: ListDouble },
  { key: 'reservations', label: 'Reservas', component: ListDouble },
  { key: 'payment-management', label: 'Gestión de pago', component: SubScreenDouble, menu: false, parent: 'reservations' },
];

async function operatorShell(areas: PortalArea[] = OPERATOR_AREAS) {
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: PORTAL_AREA_LIST, useValue: areas }] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.crp-operator-nav button'));
  return { host, items, settle, navigation: fixture.debugElement.injector.get(PortalNavigation) };
}

describe('areasWithoutAMenuItem', () => {
  it('opens an area with menu false through PortalNavigation.open but draws no sidebar item for it', async () => {
    const shell = await operatorShell();
    expect(shell.items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Reservas']);
    expect(shell.navigation.open('payment-management', { reservation: 'RES-1842' })).toBe(true);
    await shell.settle();
    expect(shell.host.querySelector('main h1')?.textContent).toBe('Subpantalla');
    expect(shell.items().map((b) => b.textContent?.trim())).toEqual(['Catálogos', 'Reservas']);
  });

  it('keeps the parent item active while its sub-screen is open (Reservas on screen 13)', async () => {
    const shell = await operatorShell();
    shell.navigation.open('payment-management'); await shell.settle();
    const active = shell.items().filter((b) => b.classList.contains('crp-is-active'));
    expect(active.map((b) => b.textContent?.trim())).toEqual(['Reservas']);
    expect(active[0].getAttribute('aria-current')).toBe('page');
  });

  it('lands on the first area with a menu item, never on a sub-screen', async () => {
    const shell = await operatorShell([OPERATOR_AREAS[2], OPERATOR_AREAS[0], OPERATOR_AREAS[1]]);
    expect(shell.host.querySelector('main h1')?.textContent).toBe('Lista');
    expect(shell.items()[0].classList).toContain('crp-is-active');
  });
});

// Point 3: the shared slots of src/app/shared/portal-slots.ts and their outlet.
@Component({ selector: 'crp-test-block', template: '<p class="crp-test-block">{{ label() }} {{ reservation()?.id }}{{ reservationId() }}</p>' })
class BlockDouble { readonly label = input('Bloque'); readonly reservation = input<{ id: string }>(); readonly reservationId = input<string>(); }
@Component({ selector: 'crp-test-second', template: '<p class="crp-test-block">Segundo</p>' })
class SecondDouble {}
@Component({ selector: 'li[crpTestQuick]', template: 'Acción de prueba' })
class QuickDouble {}

const TEST_SLOT = new InjectionToken<readonly PortalSlot[]>('TEST_SLOT');
@Component({ selector: 'crp-test-host', imports: [PortalSlotOutlet],
  template: '<div class="slot"><ng-container *crpSlot="slot; inputs: { reservation: { id: \'RES-1\' }, unknown: 1 }" /></div>' })
class HostDouble { protected readonly slot = TEST_SLOT; }

async function hostWith(providers: Provider[]) {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(HostDouble);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('portalSlots', () => {
  it('declares the canonical tokens of the cut 3 stories, empty until a story contributes', () => {
    const tokens = [RESERVATION_DETAIL_BLOCKS, RESERVATION_ROW_ACTIONS, CHECKOUT_BLOCKS, TRANSFER_PAYMENT_LINES, PAYMENT_MANAGEMENT_ACTIONS,
      PAYMENTS_PAGE_PANELS, PAYMENTS_ROW_ACTIONS, CLIENT_QUICK_ACTIONS, CLIENT_NOTICES, RESERVATION_CARD_EXTRAS, RESERVATION_DETAIL_ACTIONS,
      RESERVATION_CARD_ACTIONS];
    expect(tokens.map((token) => token.toString())).toEqual([
      'RESERVATION_DETAIL_BLOCKS', 'RESERVATION_ROW_ACTIONS', 'CHECKOUT_BLOCKS', 'TRANSFER_PAYMENT_LINES', 'PAYMENT_MANAGEMENT_ACTIONS',
      'PAYMENTS_PAGE_PANELS', 'PAYMENTS_ROW_ACTIONS', 'CLIENT_QUICK_ACTIONS', 'CLIENT_NOTICES', 'RESERVATION_CARD_EXTRAS', 'RESERVATION_DETAIL_ACTIONS',
      'RESERVATION_CARD_ACTIONS',
    ].map((name) => `InjectionToken ${name}`));
  });

  it('draws nothing without contributions', async () => {
    const host = await hostWith([]);
    expect(host.querySelector('.slot')?.innerHTML.replace(/<!--.*?-->/g, '')).toBe('');
  });

  it('draws the available contributions by order, with only the inputs each one declares', async () => {
    const host = await hostWith([
      contribute(TEST_SLOT, { component: SecondDouble, order: 20 }),
      contribute(TEST_SLOT, { component: BlockDouble, order: 10 }),
      contribute(TEST_SLOT, { component: SecondDouble, order: 5, isAvailable: () => false }),
    ]);
    expect(Array.from(host.querySelectorAll('.crp-test-block'), (p) => p.textContent?.trim())).toEqual(['Bloque RES-1', 'Segundo']);
  });

  it('creates the host element the selector names, so a list contribution is a list item', async () => {
    const host = await hostWith([contribute(TEST_SLOT, { component: QuickDouble, order: 1 })]);
    expect(host.querySelector('.slot > li[crpTestQuick]')?.textContent).toBe('Acción de prueba');
  });
});

describe('theOutletsOfTheScreensInDevelop', () => {
  it('draws RESERVATION_DETAIL_BLOCKS after Servicios reservados of 10A and next to Ver detalle of 10C', async () => {
    TestBed.configureTestingModule({ providers: [contribute(RESERVATION_DETAIL_BLOCKS, { component: BlockDouble, order: 1 })] });
    const fixture = TestBed.createComponent(ReservationViewComponent);
    fixture.componentRef.setInput('reservation', reservationOf('RES-7'));
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.reservation-detail > .crp-operator-panel:last-of-type + crp-test-block')?.textContent?.trim()).toBe('Bloque RES-7');
    fixture.componentRef.setInput('fresh', true);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('.reservation-result .crp-form-actions crp-test-block')?.textContent?.trim()).toBe('Bloque RES-7');
  });

  const propsFor = (roles: string[], initialParams?: Record<string, string>): MountProps => ({
    apiClient: { request: vi.fn() } as never, session: { roles, open: () => undefined, close: () => undefined }, initialParams,
  });
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  const mountAs = (contributions: Provider[], roles: string[], initialParams?: Record<string, string>) => {
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mountWith(host, propsFor(roles, initialParams), (client: PortalApiClient) => [...demoSources(client), ...contributions]);
  };
  afterEach(() => { cleanup?.(); cleanup = undefined; host?.remove(); });
  const click = (selector: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();

  it('draws RESERVATION_ROW_ACTIONS in the Acción cell of screen 10, after Ver detalle', async () => {
    mountAs([contribute(RESERVATION_ROW_ACTIONS, { component: BlockDouble, order: 1 })], ['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    click('nav button', 'Reservas');
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
    const cell = host.querySelector('app-reservations-page [data-state="data"] tbody tr td:last-child')!;
    expect(cell.querySelector('button + crp-test-block')?.textContent?.trim()).toBe(`Bloque ${host.querySelector('.crp-reservation-code')?.textContent?.slice(1)}`);
  });

  it('draws CHECKOUT_BLOCKS in the main column of 21, after the payment method card', async () => {
    mountAs([contribute(CHECKOUT_BLOCKS, { component: SecondDouble, order: 1 })], ['FINAL_CUSTOMER'], { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' });
    await vi.waitFor(() => expect(host.querySelector('app-confirm-reservation-page [data-state="data"]')).toBeTruthy());
    const methodCard = host.querySelector('#self-service-method')!.closest('article')!;
    expect(methodCard.parentElement?.classList).toContain('crp-finish-main');
    expect(methodCard.nextElementSibling?.tagName).toBe('CRP-TEST-SECOND');
  });

  it('draws CLIENT_QUICK_ACTIONS in Acciones rápidas and CLIENT_NOTICES under Notificaciones of 17, which is absent without notices', async () => {
    mountAs([], ['FINAL_CUSTOMER']);
    await vi.waitFor(() => expect(host.querySelector('app-client-panel-page')).toBeTruthy());
    expect(host.textContent).not.toContain('Notificaciones');
    cleanup?.(); host.remove();

    mountAs([contribute(CLIENT_QUICK_ACTIONS, { component: QuickDouble, order: 1 }), contribute(CLIENT_NOTICES, { component: SecondDouble, order: 1 })], ['FINAL_CUSTOMER']);
    await vi.waitFor(() => expect(host.querySelector('app-client-panel-page')).toBeTruthy());
    expect(host.querySelector('.crp-panel-quick ul > li:last-child')?.matches('[crpTestQuick]')).toBe(true);
    const notices = host.querySelector('.crp-panel-layout + .crp-panel-notices');
    expect(notices?.querySelector('h2')?.textContent).toBe('Notificaciones');
    expect(notices?.querySelector('crp-test-second')).toBeTruthy();
    expect(notices?.nextElementSibling?.classList).toContain('crp-panel-featured');
  });

  it('draws RESERVATION_CARD_EXTRAS in each card of Mis reservas, under the departure line', async () => {
    mountAs([contribute(RESERVATION_CARD_EXTRAS, { component: BlockDouble, order: 1 })], ['FINAL_CUSTOMER']);
    await vi.waitFor(() => expect(host.querySelector('app-client-panel-page')).toBeTruthy());
    click('.crp-panel-card button', 'Ver mis reservas');
    await vi.waitFor(() => expect(host.querySelector('.self-service-panel [data-state="data"] li')).toBeTruthy());
    const card = host.querySelector('.self-service-card')!;
    expect(card.querySelector('.self-service-card-copy > p + crp-test-block')?.textContent?.trim())
      .toBe(`Bloque ${card.querySelector('strong')?.textContent?.split(' · ')[0]}`);
  });

  // 10A header: "Cancelar o modificar reserva" (013) sits before "Volver a reservas" (admin-detalle-reserva.html:34).
  it('draws RESERVATION_DETAIL_ACTIONS in the header of 10A, before Volver a reservas', async () => {
    mountAs([contribute(RESERVATION_DETAIL_ACTIONS, { component: BlockDouble, order: 1 })], ['TENANT_ADMINISTRATOR']);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    click('nav button', 'Reservas');
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
    const id = host.querySelector('.crp-reservation-code')?.textContent?.slice(1);
    click('app-reservations-page [data-state="data"] tbody tr td:last-child button', 'Ver detalle');
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page .crp-page-header crp-test-block')).toBeTruthy());
    const block = host.querySelector('app-reservations-page .crp-page-header crp-test-block')!;
    expect(block.textContent?.trim()).toBe(`Bloque ${id}`);
    expect(block.nextElementSibling?.textContent?.trim()).toBe('Volver a reservas');
  });

  // Mis reservas: "Responder propuesta" (018) closes the card (app.js:2694).
  it('draws RESERVATION_CARD_ACTIONS at the end of each card of Mis reservas', async () => {
    mountAs([contribute(RESERVATION_CARD_ACTIONS, { component: BlockDouble, order: 1 })], ['FINAL_CUSTOMER']);
    await vi.waitFor(() => expect(host.querySelector('app-client-panel-page')).toBeTruthy());
    click('.crp-panel-card button', 'Ver mis reservas');
    await vi.waitFor(() => expect(host.querySelector('.self-service-panel [data-state="data"] li')).toBeTruthy());
    const card = host.querySelector('.self-service-card')!;
    expect(card.lastElementChild?.tagName.toLowerCase()).toBe('crp-test-block');
    expect(card.lastElementChild?.textContent?.trim()).toBe(`Bloque ${card.querySelector('strong')?.textContent?.split(' · ')[0]}`);
  });
});

// A sub-screen opened from 10A (13 of 009, the change screen of 013) goes back with PortalNavigation.open('reservations', { reservation }).
describe('reservationsReopenTheDetailAReturnNames', () => {
  const listed = () => new (class extends ReservationsSource { override list() { return of([reservationOf('RES-6'), reservationOf('RES-7')]); } })();

  it('opens 10A of the reservation named by the navigation parameters, once listed', async () => {
    const navigation = new PortalNavigation();
    navigation.register(['reservations']);
    navigation.open('reservations', { reservation: 'RES-7' });
    const { element, settle } = await screenOf(ReservationsPageComponent, [...reservationProviders({ reservations: listed() }), { provide: PortalNavigation, useValue: navigation }]);
    await settle();
    expect(element.querySelector('.crp-page-header-title')?.textContent?.trim()).toBe('Detalle de reserva');
    expect(element.querySelector('.crp-reservation-hero')?.textContent).toContain('#RES-7');
  });

  it('shows the list when no reservation is named or the named one is not listed', async () => {
    const navigation = new PortalNavigation();
    navigation.register(['reservations']);
    navigation.open('reservations', { reservation: 'RES-404' });
    const { element, settle } = await screenOf(ReservationsPageComponent, [...reservationProviders({ reservations: listed() }), { provide: PortalNavigation, useValue: navigation }]);
    await settle();
    expect(element.querySelector('.crp-page-header-title')?.textContent?.trim()).toBe('Reservas');
  });
});

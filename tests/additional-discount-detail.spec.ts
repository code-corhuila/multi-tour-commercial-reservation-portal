import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ADDITIONAL_DISCOUNT_CONTRIBUTIONS, ADDITIONAL_DISCOUNT_DETAIL_BLOCK } from '../src/app/current-discounts/components/additional-discount-entries.component';
import { ADDITIONAL_DISCOUNT_AREA, AdditionalDiscountEligibility } from '../src/app/current-discounts/data/additional-discount-eligibility';
import { DemoAdditionalDiscountEligibility } from '../src/app/demo/current-discounts-demo';
import { PortalNavigation } from '../src/app/portal-navigation';
import { Reservation } from '../src/app/reservations/model/reservation';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { RESERVATION_DETAIL_BLOCKS, contribute } from '../src/app/shared/portal-slots';
import { ControllableReservations, reservationOf, reservationProviders, screenOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-004 amendment 2026-10-14, A.1 row 10A: the button "Aplicar descuento adicional" and the block "Decisión excepcional / Descuento adicional aplicado".
const DISCOUNT = { basisPoints: 1000, reason: 'Fidelización', appliedBy: 'Administrador demo', appliedAt: '2026-10-15T10:00:00-05:00', previousValueCents: 10_000_000, amountCents: 1_000_000 };
const wired: Provider[] = [{ provide: AdditionalDiscountEligibility, useValue: new DemoAdditionalDiscountEligibility() }, ...ADDITIONAL_DISCOUNT_CONTRIBUTIONS,
  contribute(RESERVATION_DETAIL_BLOCKS, ADDITIONAL_DISCOUNT_DETAIL_BLOCK)];
const worth = (id: string, over: Partial<Reservation> = {}) => reservationOf(id, { quote: { services: [], transportCents: 0, projectedCents: 10_000_000, discounts: [], discountCents: 0, finalCents: 9_000_000 }, ...over });

async function detailOf(reservation: Reservation, role: ActorRole = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation();
  navigation.register(['reservations', ADDITIONAL_DISCOUNT_AREA]);
  const source = new ControllableReservations();
  const screen = await screenOf(ReservationsPageComponent, [...reservationProviders({ role, reservations: source }), ...wired, { provide: PortalNavigation, useValue: navigation }]);
  source.inner.requests[0].reply([reservation]);
  await screen.settle();
  if (screen.button('Ver todas las reservas')) await screen.click('Ver todas las reservas');
  await screen.click('Ver detalle');
  const action = () => Array.from(screen.element.querySelectorAll('header button')).find((b) => b.textContent?.trim() === 'Aplicar descuento adicional') as HTMLButtonElement | undefined;
  const block = () => Array.from(screen.element.querySelectorAll('section')).find((s) => s.textContent?.includes('Decisión excepcional'));
  return { ...screen, navigation, action, block };
}

describe('theDetailOffersTheButtonOnlyToTheAdministratorOnAnEligibleReservation', () => {
  it.each(['PENDIENTE_DE_PAGO', 'CONFIRMADA'] as const)('offers "Aplicar descuento adicional" on a %s reservation and opens the screen of that reservation', async (status) => {
    const p = await detailOf(worth('RES-D', { status }));
    expect(p.action()?.classList).toContain('crp-page-header-action');
    expect(p.action()?.classList).toContain('crp-operator-outline');
    p.action()!.click();
    expect(p.navigation.selected()).toBe(ADDITIONAL_DISCOUNT_AREA);
    expect(p.navigation.params()).toEqual({ reservation: 'RES-D' });
  });

  it.each(['EN_EJECUCION', 'FINALIZADA', 'CANCELADA'] as const)('offers nothing on a %s reservation', async (status) => {
    expect((await detailOf(worth('RES-D', { status }))).action()).toBeUndefined();
  });

  it('offers no second discount on a reservation that already has one', async () => {
    expect((await detailOf(worth('RES-D', { additionalDiscount: DISCOUNT }))).action()).toBeUndefined();
  });

  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('offers %s no button, but keeps the block read only', async (role) => {
    const p = await detailOf(worth('RES-D', { additionalDiscount: DISCOUNT }), role as ActorRole);
    expect(p.action()).toBeUndefined();
    expect(p.block()).toBeTruthy();
  });

  it.each(['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('offers %s no button on an eligible reservation either', async (role) => {
    expect((await detailOf(worth('RES-E'), role as ActorRole)).action()).toBeUndefined();
  });
});

describe('theDetailDrawsTheAdditionalDiscountAppliedBlock', () => {
  it('shows the percentage, the reason, the previous value, the discounted value and the final value', async () => {
    const p = await detailOf(worth('RES-D', { additionalDiscount: DISCOUNT }));
    const block = p.block()!;
    expect(block.querySelector('.crp-operator-eyebrow')?.textContent).toBe('Decisión excepcional');
    expect(block.querySelector('h2')?.textContent).toBe('Descuento adicional aplicado');
    const rows = Array.from(block.querySelectorAll('dl > div'), (row) => [row.querySelector('dt')?.textContent?.trim(), row.querySelector('dd')?.textContent?.trim()]);
    expect(rows).toEqual([['Descuento adicional', '10%'], ['Motivo', 'Fidelización'], ['Valor anterior', '$100.000'], ['Valor descontado', '$10.000'], ['Valor final', '$90.000']]);
  });

  it('draws nothing for a reservation without an additional discount', async () => {
    expect((await detailOf(worth('RES-D'))).block()).toBeUndefined();
  });
});

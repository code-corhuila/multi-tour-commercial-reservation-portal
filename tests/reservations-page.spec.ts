import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoDeparturesStore, DemoReservationsStore, DemoReservationsWriter } from '../src/app/demo/reservations-demo';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ControllableReservations, StubDepartures, StubDiscounts, reservationOf, reservationProviders, screenOf } from './reservations.double';

const NEW = 'New reservation';

describe('everyScreenShowsOneOfTheFourStates (list)', () => {
  it('goes from loading to error with retry, to empty, and to data', async () => {
    const reservations = new ControllableReservations();
    const { element, settle, click } = await screenOf(ReservationsPageComponent, reservationProviders({ reservations }));
    expect(element.querySelector('[data-state="loading"]')).not.toBeNull();
    reservations.inner.requests[0].fail(); await settle();
    expect(element.querySelector('[data-state="error"]')).not.toBeNull();
    await click('Retry'); reservations.inner.requests[1].reply([]); await settle();
    expect(element.querySelector('[data-state="empty"]')?.textContent).toContain('No results');
  });
});

describe('readOnlyRolesAndUnknownRolesGetNoCreateAction', () => {
  it('lists reservations to every role but offers New reservation only to the administrator and the collaborator', async () => {
    for (const [role, offered] of [['TENANT_ADMINISTRATOR', true], ['OPERATIONAL_COLLABORATOR', true], ['MANAGER', false],
      ['ACCOUNTANT', false], ['ANALYST', false], ['READ_ONLY', false], ['SOMETHING_ELSE', false]] as const) {
      const reservations = new ControllableReservations();
      const { element, settle, button } = await screenOf(ReservationsPageComponent, reservationProviders({ role, reservations }));
      reservations.inner.requests[0].reply([reservationOf('r-1')]); await settle();
      expect(element.querySelector('[data-state="data"]')?.textContent).toContain('Lead Demo');
      expect(Boolean(button(NEW)), role).toBe(offered);
      expect(element.querySelector('form')).toBeNull();
      TestBed.resetTestingModule();
    }
  });
});

/** The page over the demo stores, with a controllable discount calculation standing in for HU-COM-004. */
async function overDemo() {
  const departures = new DemoDeparturesStore(), store = new DemoReservationsStore(), discounts = new StubDiscounts();
  discounts.lines = [{ name: 'Early bird', base: 'ORIGINAL_VALUE', amountCents: 1000 }];
  const open = departures.items.find((d) => d.state === 'PROGRAMADA' && d.openForReservations)!;
  const view = await screenOf(ReservationsPageComponent, reservationProviders({ reservations: store, discounts,
    writer: new DemoReservationsWriter(store, departures), departures: new StubDepartures(() => of(departures.items)) }));
  const create = async () => {
    await view.click(NEW);
    await view.choose('departureId', open.id);
    await view.tick('svc-Kayak'); await view.type('people', '2'); await view.party(); await view.payWith();
    await view.click('Registrar reserva');
  };
  return { ...view, discounts, open, create };
}

describe('createdReservationIsPendienteDePagoSinPagoWithNoSeatHeld', () => {
  it('closes the form and shows the reservation in Pendiente de pago, Sin pago, with no seat held and the tour conditions', async () => {
    const { element, create, open } = await overDemo();
    await create();
    expect(element.querySelector('form')).toBeNull();
    const result = element.querySelector('.crp-reservations-result')!.textContent!;
    for (const text of ['Pendiente de pago', 'Sin pago', 'sin cupo apartado hasta su primer pago']) expect(result).toContain(text);
    await click('Volver a reservas');
    expect(element.querySelectorAll('[data-state="data"] tbody tr')).toHaveLength(1);
  });
});

describe('detailShowsTheValuesAndDiscountsFixedAtCreation', () => {
  it('keeps the projected value, the final value and the discount after the discount is inactivated', async () => {
    const { element, create, discounts, click, settle } = await overDemo();
    await create(); await click('Ver detalle');
    const before = element.querySelector('.crp-reservations-detail')!.textContent;
    discounts.lines = [];
    await click('Volver a reservas');
    expect(element.querySelector('.crp-reservations-detail')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-state="data"] tbody button')!.click(); await settle();
    const detail = element.querySelector('.crp-reservations-detail');
    expect(detail?.textContent).toBe(before);
    expect(detail?.textContent).toContain('Early bird (on the original value)');
  });
});

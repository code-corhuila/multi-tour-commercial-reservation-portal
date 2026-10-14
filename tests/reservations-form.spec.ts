import { within } from '@testing-library/dom';
import { Subject, of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { Departure } from '../src/app/reservations/model/reservation';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { ControllableReservationsWriter, StubDepartures, StubDiscounts, departureOf, reservationOf, reservationProviders, screenOf } from './reservations.double';

async function openForm(over: Parameters<typeof reservationProviders>[0] = {}) {
  const writer = new ControllableReservationsWriter(), keys = new ControllableIdempotencyKeys(), discounts = new StubDiscounts();
  const view = await screenOf(ReservationFormComponent, reservationProviders({ writer, keys, discounts, ...over }));
  const created: unknown[] = [];
  view.fixture.componentInstance.created.subscribe((r) => created.push(r));
  const fill = async (people = '3', departure = 'dep-1') => {
    await view.choose('leadCustomerId', 'cus-1'); await view.choose('departureId', departure);
    await view.tick('svc-Kayak'); await view.type('people', people); await view.payWith();
  };
  return { ...view, writer, keys, discounts, created, fill };
}
const errorBeside = (element: HTMLElement, name: string) => {
  const id = element.querySelector(`[name="${name}"]`)!.getAttribute('aria-describedby');
  return id ? element.querySelector(`#${id}`)?.textContent ?? '' : '';
};

describe('departureSelectorOffersOnlyProgramadaAndOpenDepartures', () => {
  it('offers one departure at a time, only Programada and open, among labelled fields', async () => {
    const { element } = await openForm();
    const select = within(element).getByLabelText('Salida programada') as HTMLSelectElement;
    expect(select.multiple).toBe(false);
    expect(Array.from(select.options).map((o) => o.value).filter(Boolean)).toEqual(['dep-1', 'dep-4']);
    for (const label of ['Cliente titular', 'Tour', 'Cantidad total de viajeros']) expect(within(element).getByLabelText(label)).toBeTruthy();
    expect(within(element).queryByLabelText(/Closed/)).toBeNull();
  });
});

describe('missingMandatoryDataIsNamedBesideEachFieldAndNothingIsSent', () => {
  it('names the customer, the departure, the services and the people beside their fields', async () => {
    const { element, submit, writer } = await openForm();
    await submit();
    expect(errorBeside(element, 'leadCustomerId')).toContain('El cliente titular es obligatorio');
    expect(errorBeside(element, 'departureId')).toContain('La salida es obligatoria');
    expect(errorBeside(element, 'people')).toContain('La cantidad de viajeros es obligatoria');
    expect(errorBeside(element, 'serviceId')).toContain('El tour es obligatorio');
    expect(writer.calls).toHaveLength(0);
  });

  it('names only the lead customer when it is the one missing', async () => {
    const { element, choose, tick, type, payWith, submit, writer } = await openForm();
    await choose('departureId', 'dep-1'); await tick('svc-Kayak'); await type('people', '2'); await payWith(); await submit();
    expect(errorBeside(element, 'leadCustomerId')).toContain('El cliente titular es obligatorio');
    expect(errorBeside(element, 'people')).toBe('');
    expect(writer.calls).toHaveLength(0);
  });
});

describe('notEnoughCapacityCreatesNothingAndSaysSo', () => {
  it('blocks the submit when the people exceed the effective capacity of the departure', async () => {
    const { element, fill, submit, writer } = await openForm();
    await fill('3', 'dep-4'); await submit();
    expect(errorBeside(element, 'people')).toContain('No hay cupo suficiente');
    expect(writer.calls).toHaveLength(0);
  });

  it('shows the writer refusal for capacity beside the people field and creates nothing', async () => {
    const { element, fill, submit, writer, settle, created } = await openForm();
    await fill(); await submit();
    writer.calls[0].fail(apiError({ status: 409, code: 'insufficient-capacity' })); await settle();
    expect(errorBeside(element, 'people')).toContain('No hay cupo suficiente');
    expect(created).toHaveLength(0);
  });
});

describe('eachDiscountLineNamesItsBaseInTheOrderApplied', () => {
  it('shows services, transport per person, each discount with its base in order, projected and final value', async () => {
    const { element, fill, discounts, settle } = await openForm();
    discounts.lines = [{ name: 'Early bird', base: 'ORIGINAL_VALUE', amountCents: 1000 }, { name: 'Group', base: 'PREVIOUS_SUBTOTAL', amountCents: 500 }];
    await fill(); await settle();
    const breakdown = element.querySelector('.reservation-breakdown')!;
    expect(breakdown.textContent).toContain('Kayak'); expect(breakdown.textContent).toContain('$60');
    expect(breakdown.textContent).toContain('Transporte por persona'); expect(breakdown.textContent).toContain('$15');
    expect(Array.from(breakdown.querySelectorAll('[data-discount]')).map((d) => d.textContent?.trim()))
      .toEqual(['Early bird (sobre el valor original)', 'Group (sobre el subtotal anterior)']);
    expect(breakdown.querySelector('[data-value="projected"]')!.textContent).toContain('$75');
    expect(breakdown.querySelector('[data-value="final"]')!.textContent).toContain('$60');
    expect(discounts.bases.at(-1)).toBe(7497);
  });
});

describe('submitIsDisabledWhileASubmissionIsPending and aRetriedCreationReusesItsIdempotencyKey', () => {
  it('sends one creation for a double click, with the button disabled while it is pending', async () => {
    const { fill, submit, writer, button } = await openForm();
    await fill(); await submit(); await submit();
    expect(writer.calls).toHaveLength(1);
    expect(button('Registrar reserva')!.disabled).toBe(true);
    expect(writer.calls[0].command).toMatchObject({ leadCustomerId: 'cus-1', departureId: 'dep-1', serviceIds: ['svc-Kayak'], people: 3, paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER' });
    expect('quote' in writer.calls[0].command).toBe(false);
  });

  it('reuses the key after a failure, and a new form uses a new key', async () => {
    const { element, fill, submit, writer, settle, created, keys } = await openForm();
    await fill(); await submit();
    writer.calls[0].fail(apiError()); await settle();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('The change was refused.');
    await submit();
    expect(writer.calls[1].key).toBe(writer.calls[0].key);
    writer.calls[1].reply(reservationOf('r-1')); await settle();
    expect(created).toHaveLength(1);
    TestBed.resetTestingModule();
    const second = await openForm({ keys });
    await second.fill(); await second.submit();
    expect(second.writer.calls[0].key).not.toBe(writer.calls[0].key);
  });
});

describe('everyScreenShowsOneOfTheFourStates (form)', () => {
  it('shows loading, then an error with retry, then the form', async () => {
    let answers = new Subject<readonly Departure[]>();
    const departures = new StubDepartures(() => answers);
    const { element, settle, click } = await openForm({ departures });
    expect(element.querySelector('[data-state="loading"]')).not.toBeNull();
    answers.error(new Error('down')); await settle();
    expect(element.querySelector('[data-state="error"]')).not.toBeNull();
    answers = new Subject(); await click('Reintentar');
    answers.next([departureOf(1)]); answers.complete(); await settle();
    expect(element.querySelector('form[data-state="data"]')).not.toBeNull();
  });

  it('shows the empty state when no departure is open, and the error state when the source throws', async () => {
    const empty = await openForm({ departures: new StubDepartures(() => of([departureOf(1, { state: 'CANCELADA' })])) });
    expect(empty.element.querySelector('[data-state="empty"]')?.textContent).toContain('No hay salidas abiertas para reservas');
    TestBed.resetTestingModule();
    const failing = await openForm({ departures: new StubDepartures(() => throwError(() => new Error('x'))) });
    expect(failing.element.querySelector('[data-state="error"] button')).not.toBeNull();
  });
});

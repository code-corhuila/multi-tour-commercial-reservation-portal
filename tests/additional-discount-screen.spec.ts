import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ADDITIONAL_DISCOUNT_AREA, ADDITIONAL_DISCOUNT_MODE } from '../src/app/current-discounts/data/additional-discount-eligibility';
import { apiError } from './catalog-items-writer.double';
import { appliedOf, contextOf, openAdditionalDiscount } from './additional-discount.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-004 amendment 2026-10-14 (mockup PDR v1.9): admin-aplicar-descuento.html over a chosen reservation. AC-CD.5, AC-CD.6, AC-CD.7.
const ready = async (context = contextOf()) => { const page = await openAdditionalDiscount(); await page.withContext(context); return page; };
const fill = async (page: Awaited<ReturnType<typeof ready>>, value = '5', reason = 'Cliente frecuente') => { await page.type('value', value); await page.type('reason', reason); };
const submit = async (page: Awaited<ReturnType<typeof ready>>) => { page.submitButton().click(); await page.settle(); };
const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector), (node) => node.textContent?.trim());

describe('theScreenDrawsTheTextsAndThePanelsOfTheMockup', () => {
  it('draws the header, the access note, "Volver a reservas" and the two numbered panels', async () => {
    const page = await ready();
    expect(page.element.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe('Descuento adicional');
    expect(page.element.querySelector('h1')?.textContent?.trim()).toBe('Aplicar descuento');
    expect(page.element.querySelector('.crp-page-header-action')?.textContent?.trim()).toBe('Volver a reservas');
    expect(page.element.querySelector('.crp-access-note')?.textContent).toContain('Solo el Administrador del tenant autoriza descuentos adicionales. Se aplican después del descuento general vigente fijado en la reserva');
    expect(page.element.querySelector('.crp-access-note')?.textContent).toContain('devolución del 100 % por defecto o saldo a favor');
    expect(texts(page.element, '.crp-operator-panel > .crp-operator-eyebrow')).toEqual(['01. Reserva seleccionada', '02. Descuento adicional']);
    expect(texts(page.element, '.crp-operator-panel > h2')).toEqual(['Contexto de la reserva', 'Autorización']);
  });

  it('shows the six facts of the reservation, formatted, and the fields of panel 02', async () => {
    const page = await ready();
    expect(page.readOnly('Reserva')).toBe('#RES-1');
    expect(page.readOnly('Cliente')).toBe('Camila Ortega');
    expect(page.readOnly('Servicio')).toBe('Ruta Andina');
    expect(page.readOnly('Valor actual')).toBe('$100.000');
    expect(page.readOnly('Descuento general fijado')).toBe('$10.000 (fijado al crear la reserva)');
    expect(page.readOnly('Valores pagados y validados')).toBe('$40.000');
    expect(page.readOnly('Tope parametrizado')).toBe('20 % del valor vigente');
    expect(page.readOnly('Nuevo valor calculado')).toBe('$100.000');
    expect(page.readOnly('Excedente sobre lo pagado')).toBe('$0 (sin excedente)');
    expect(texts(page.element, 'form label')).toContain('Motivo (obligatorio)');
    expect(page.field('reason').getAttribute('placeholder')).toBe('Describe el motivo del descuento adicional (por ejemplo, fidelización)');
    expect(page.element.querySelector('.crp-additional-discount-note')?.textContent).toBe('El motivo y el responsable quedan asociados a la reserva.');
    expect(texts(page.element, 'form .crp-form-actions button')).toEqual(['Cancelar', 'Aplicar descuento']);
  });

  it('says "Sin descuento general" when the reservation has none', async () => {
    const page = await ready(contextOf({ generalDiscountCents: 0 }));
    expect(page.readOnly('Descuento general fijado')).toBe('Sin descuento general');
  });

  it('asks the port for the new value and the excess, and only formats the answer', async () => {
    const page = await ready();
    await page.type('value', '70');
    expect(page.contexts.previews).toEqual([]);
    await page.type('value', '15');
    expect(page.contexts.previews.at(-1)).toEqual({ id: 'RES-1', basisPoints: 1500 });
    expect(page.readOnly('Nuevo valor calculado')).toBe('$85.000');
    await page.type('value', '20');
    expect(page.contexts.previews.at(-1)).toEqual({ id: 'RES-1', basisPoints: 2000 });
    expect(page.readOnly('Nuevo valor calculado')).toBe('$80.000');
    expect(page.readOnly('Excedente sobre lo pagado')).toBe('$0 (sin excedente)');
    await page.type('value', '');
    expect(page.readOnly('Nuevo valor calculado')).toBe('$100.000');
  });

  it('opens Reservas in mode with "Volver a reservas" and "Cancelar", through the navigation', async () => {
    const page = await ready();
    page.element.querySelector<HTMLButtonElement>('.crp-page-header-action')!.click();
    expect(page.navigation.selected()).toBe('reservations');
    expect(page.navigation.params()).toEqual({ mode: ADDITIONAL_DISCOUNT_MODE });
    page.navigation.open(ADDITIONAL_DISCOUNT_AREA, { reservation: 'RES-1' });
    await fill(page);
    Array.from(page.element.querySelectorAll('form button')).find((b) => b.textContent?.trim() === 'Cancelar')!.dispatchEvent(new Event('click'));
    await page.settle();
    expect(page.navigation.selected()).toBe('reservations');
    expect(page.writer.calls).toHaveLength(0);
  });
});

describe('theAdministratorAppliesOneDiscountToAChosenReservation', () => {
  it('sends the reservation, the percentage in basis points and the reason, then confirms in Spanish', async () => {
    const page = await ready();
    await fill(page, '12.5', ' Cliente frecuente ');
    await submit(page);
    expect(page.writer.calls).toHaveLength(1);
    expect(page.writer.calls[0].command).toEqual({ reservationId: 'RES-1', percentageBasisPoints: 1250, reason: 'Cliente frecuente' });
    page.writer.calls[0].reply(appliedOf(page.writer.calls[0].command));
    await page.settle();
    expect(page.element.querySelector('[role="status"]')?.textContent)
      .toContain('Descuento adicional aplicado correctamente: el valor final se recalculó y quedaron registrados el motivo y el responsable.');
    expect(page.submitButton().disabled).toBe(true);
  });

  it('sends one request for a double click and disables submit while pending', async () => {
    const page = await ready();
    await fill(page);
    page.submitButton().click(); page.submitButton().click();
    await page.settle();
    expect(page.writer.calls).toHaveLength(1);
    expect(page.submitButton().disabled).toBe(true);
  });

  it('reuses the Idempotency-Key on a retry after an error, and uses a new one when the data change', async () => {
    const page = await ready();
    await fill(page);
    await submit(page);
    page.writer.calls[0].fail(apiError({ userMessage: 'Intenta de nuevo más tarde.' }));
    await page.settle();
    expect(page.element.textContent).toContain('Intenta de nuevo más tarde.');
    await submit(page);
    expect(page.writer.calls[1].key).toBe(page.writer.calls[0].key);
    page.writer.calls[1].fail(apiError());
    await page.settle();
    await fill(page, '6');
    await submit(page);
    expect(page.writer.calls[2].key).not.toBe(page.writer.calls[0].key);
  });
});

describe('aMissingReasonOrAPercentageOutOfRangeIsRefusedBesideTheField', () => {
  it('shows each error beside its field, focuses the first one and sends nothing', async () => {
    const page = await ready();
    document.body.append(page.element);
    await submit(page);
    expect(page.errorFor('reason')).toContain('El motivo es obligatorio');
    expect(page.errorFor('value')).toContain('valor positivo');
    expect(document.activeElement).toBe(page.field('value'));
    for (const value of ['0', '0.5', '-3', 'abc']) {
      await fill(page, value);
      await submit(page);
      expect(page.errorFor('value'), value).toContain('valor positivo');
      expect(page.errorFor('reason')).toBeFalsy();
    }
    await fill(page, '20.5');
    await submit(page);
    expect(page.errorFor('value')).toBe('El descuento adicional debe estar entre 1 % y el tope parametrizado de 20 %.');
    await fill(page, '5', '   ');
    (document.activeElement as HTMLElement).blur();
    await submit(page);
    expect(page.errorFor('reason')).toContain('El motivo es obligatorio');
    expect(document.activeElement).toBe(page.field('reason'));
    expect(page.writer.calls).toHaveLength(0);
    page.element.remove();
  });
});

describe('onlyTheAdministratorSeesTheButtonTheModeAndTheScreen', () => {
  for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'READ_ONLY'] as const) {
    it(`shows ${role} no form and asks the port nothing`, async () => {
      const page = await openAdditionalDiscount(role);
      expect(page.contexts.requests).toHaveLength(0);
      expect(page.element.querySelector('form')).toBeNull();
      expect(page.state()).toBe('denied');
      expect(page.element.textContent).toContain('No tienes acceso al descuento adicional.');
    });
  }
});

describe('theScreenShowsOneOfTheFourStates', () => {
  it('goes through loading, error with retry, data, and the not found case', async () => {
    const page = await openAdditionalDiscount();
    expect(page.state()).toBe('loading');
    expect(page.contexts.requests[0].id).toBe('RES-1');
    page.contexts.requests[0].fail(); await page.settle();
    expect(page.state()).toBe('error');
    Array.from(page.element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click(); await page.settle();
    expect(page.state()).toBe('loading');
    page.contexts.requests[1].reply(null); await page.settle();
    expect(page.state()).toBe('empty');
    expect(page.element.textContent).toContain('No se encontró la reserva seleccionada. Vuelve a Reservas e ingresa nuevamente por Aplicar descuento.');
    expect(page.element.querySelector('form')).toBeNull();
  });

  it('shows the state of a reservation that no longer admits the discount and offers no form', async () => {
    const page = await ready(contextOf({ eligible: false, stateLabel: 'Finalizada' }));
    expect(page.element.querySelector('[role="status"]')?.textContent).toContain('Esta reserva está en estado "Finalizada" y ya no admite modificaciones: no se puede aplicar un descuento adicional.');
    expect(page.element.querySelector('form')).toBeNull();
  });
});

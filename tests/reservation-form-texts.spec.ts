import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { COMMERCIAL_NAME } from '../src/app/shell-contract';
import { mountWith } from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { reservationProviders, screenOf } from './reservations.double';

// HU-COM-007 amendment 2026-10-14 against admin-crear-reserva.html (10B): the strip "Operador activo" and the texts of sections 02 and 04.
const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)).map((e) => e.textContent?.trim());
const openForm = (extra: unknown[] = []) => screenOf(ReservationFormComponent, [...reservationProviders(), ...extra]);

describe('theOperatorStripShowsTheCommercialNameOnlyWhenTheContainerSendsIt', () => {
  it('draws "Operador activo" with the name and its sentence', async () => {
    const { element } = await openForm([{ provide: COMMERCIAL_NAME, useValue: 'Travesía Natural' }]);
    const strip = element.querySelector('.crp-reservations-tenant-context')!;
    expect(texts(strip, 'span, strong, p')).toEqual(['Operador activo', 'Travesía Natural', 'Todos los catálogos, condiciones, cupos y valores se consultan en este contexto.']);
  });

  it('draws nothing when the container does not send it', async () => {
    const { element } = await openForm();
    expect(element.querySelector('.crp-reservations-tenant-context')).toBeNull();
    expect(element.textContent).not.toContain('Operador activo');
  });

  it('receives the commercial name from the mount properties of the container', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const request = async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } });
    const stop = mountWith(host, { apiClient: { request } as never, commercialName: 'Travesía Natural', session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    const create = async () => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Crear reserva');
    for (let i = 0; i < 100 && !(await create()); i++) await new Promise((r) => setTimeout(r, 20));
    (await create())!.click();
    for (let i = 0; i < 100 && !host.querySelector('.crp-reservations-tenant-context'); i++) await new Promise((r) => setTimeout(r, 20));
    expect(host.querySelector('.crp-reservations-tenant-context')?.textContent).toContain('Travesía Natural');
    stop(); host.remove();
  });
});

describe('theTextsOfSections02And04FollowTheMockup', () => {
  it('starts with 4 travelers, as the screen of the owner shows', async () => {
    const { element } = await openForm();
    expect(element.querySelector<HTMLInputElement>('[name="people"]')!.value).toBe('4');
  });

  it('says what the mockup says before a tour is chosen', async () => {
    const { element, field } = await openForm();
    expect(texts(element, '[name="serviceId"] option')[0]).toBe('Selecciona un tour');
    expect(texts(element, '[name="departureId"] option')[0]).toBe('Selecciona primero un tour');
    expect(field<HTMLSelectElement>('departureId').disabled).toBe(true);
    expect(texts(element, '[name="paymentType"] option')[0]).toBe('Selecciona primero un tour');
    expect(texts(element, '[name="paymentMethod"] option')[0]).toBe('Selecciona primero un tour');
    expect(element.querySelector('[data-conditions]')?.textContent).toContain('Selecciona un tour para consultar las condiciones parametrizadas.');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Selecciona un tour para consultar sus requisitos y valores.');
    expect(texts(element, '[name="serviceId"] option').slice(1)).toEqual(['Kayak', 'Lunch']);
    expect(element.textContent).toContain('La comida se muestra únicamente como incluida en el paquete del tour.');
    expect(element.textContent).toContain('que quedan fijados en la reserva al crearla.');
  });

  it('asks for the departure, then for the rest, then says the reservation is ready', async () => {
    const { element, tick, choose, payWith } = await openForm();
    await tick('svc-Kayak');
    expect(texts(element, '[name="departureId"] option')[0]).toBe('Selecciona una salida programada');
    expect(texts(element, '[name="paymentType"] option')[0]).toBe('Selecciona el tipo de pago');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Selecciona la salida programada: la reserva pertenece a una única salida.');
    await choose('departureId', 'dep-1'); await choose('leadCustomerId', 'cus-1');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Completa los campos obligatorios para registrar la reserva.');
    await payWith();
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('La reserva cumple las validaciones y está lista para registrarse. Quedará Pendiente de pago hasta cumplir la condición de confirmación.');
  });
});

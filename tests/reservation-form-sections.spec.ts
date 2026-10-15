import { Observable, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { COMMERCIAL_NAME } from '../src/app/shell-contract';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { DemoCustomersStore } from '../src/app/demo/customers-demo';
import { DemoDeparturesStore, DemoReservationsStore, DemoReservationsWriter } from '../src/app/demo/reservations-demo';
import { DemoReservationQuotes } from '../src/app/demo/reservation-quote-demo';
import { ControllableReservationsWriter, DEFAULT_SERVICES, PEOPLE, StubCatalog, StubCustomersDirectory, StubDiscounts, reservationProviders, screenOf } from './reservations.double';

// HU-COM-005 amendment 2026-10-14 against admin-crear-reserva.html (10B): sections 01 and 03 come through RESERVATION_FORM_SECTIONS.
const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)).map((e) => e.textContent?.trim());
const errorBeside = (element: HTMLElement, name: string) => {
  const id = element.querySelector(`[name="${name}"]`)!.getAttribute('aria-describedby');
  return id ? element.querySelector(`#${id}`)?.textContent?.trim() ?? '' : '';
};
async function openForm(over: Parameters<typeof reservationProviders>[0] = {}, extra: unknown[] = []) {
  const writer = new ControllableReservationsWriter(), customers = new StubCustomersDirectory();
  const view = await screenOf(ReservationFormComponent, [...reservationProviders({ writer, customers, ...over }), ...extra]);
  const ready = async (people = '2') => { await view.choose('departureId', 'dep-1'); await view.tick('svc-Kayak'); await view.type('people', people); await view.payWith(); };
  return { ...view, writer, customers, ready };
}

describe('theFormDrawsTheFourSectionsOfTheMockupInOrder', () => {
  it('draws 01 and 03 around 02 and 04, with the heading of each', async () => {
    const { element } = await openForm();
    expect(texts(element, '.crp-operator-panel .crp-operator-eyebrow')).toEqual(
      ['01. Cliente titular', '02. Tour, salida y viajeros', '03. Acompañantes', '04. Condiciones y pago', 'Valores calculados']);
    expect(texts(element, '.crp-operator-panel h2')).toEqual(
      ['Datos para asociar la reserva', 'Oferta seleccionada', 'Datos individuales requeridos', 'Reglas aplicables', 'Resumen de la reserva']);
  });

  it('has no select of customers: the titular is searched or typed', async () => {
    const { element, field } = await openForm();
    expect(element.querySelector('[name="leadCustomerId"]')).toBeNull();
    expect(element.textContent).toContain('Buscar cliente existente (nombre, documento o correo)');
    expect(field<HTMLInputElement>('customerSearch').placeholder).toBe('Escribe al menos 2 caracteres');
    expect(texts(element, '.crp-customers-titular label')).toEqual(['Buscar cliente existente (nombre, documento o correo)',
      'Nombre completo', 'Documento de identidad', 'Correo electrónico', 'Teléfono de contacto', 'Fecha de nacimiento']);
  });
});

describe('theTitularIsRegisteredFromTheFiveFieldsOrChosenFromTheSearch', () => {
  it('sends the five typed fields in the same command as the reservation', async () => {
    const { ready, party, submit, writer } = await openForm();
    await ready('1'); await party(); await submit();
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].command.lead).toEqual({ fullName: 'Titular Ficticio', document: 'DOC 9001', email: 'titular@example.test', phone: '300 000 9001', birthDate: '1990-01-01' });
    expect(writer.calls[0].command.leadCustomerId).toBeUndefined();
    expect(writer.calls[0].command.companions).toEqual([]);
  });

  it('searches from two characters on, and choosing a result fills the fields and links the reservation', async () => {
    const { element, field, type, click, customers, ready, submit, writer, settle } = await openForm();
    await type('customerSearch', 'c');
    expect(customers.searches).toEqual([]);
    await type('customerSearch', 'cami');
    expect(customers.searches).toEqual(['cami']);
    expect(texts(element, '[data-customer-results] button')).toEqual(['Camila Ortega · DOC 1001 · camila@example.test', 'Camilo Pinto · DOC 1002 · camilo@example.test · correo sin verificar']);
    await click('Camila Ortega · DOC 1001 · camila@example.test');
    expect(field<HTMLInputElement>('holderName').value).toBe('Camila Ortega');
    expect(field<HTMLInputElement>('holderDocument').value).toBe('DOC 1001');
    expect(field<HTMLInputElement>('holderEmail').value).toBe('camila@example.test');
    expect(field<HTMLInputElement>('holderPhone').value).toBe('300 000 0001');
    expect(field<HTMLInputElement>('holderBirth').value).toBe('01/05/1990');
    expect(element.textContent).toContain('Reserva vinculada al cliente existente Camila Ortega (camila@example.test).');
    await ready('1'); await submit();
    expect(writer.calls[0].command.leadCustomerId).toBe('cus-1');
    expect(writer.calls[0].command.lead).toBeUndefined();
    await settle();
  });

  it('unlinks the customer when the e-mail is changed by hand', async () => {
    const { element, type, click } = await openForm();
    await type('customerSearch', 'cami'); await click('Camila Ortega · DOC 1001 · camila@example.test');
    await type('holderEmail', 'otro@example.test');
    expect(element.textContent).not.toContain('Reserva vinculada');
  });

  it('shows the four states of the search: loading, empty, error with retry and data', async () => {
    const { element, type, click, customers, settle } = await openForm();
    const pending = new Map<string, (value: readonly never[]) => void>();
    customers.answer = (text) => new Observable((s) => { pending.set(text, (v) => { s.next(v); s.complete(); }); });
    await type('customerSearch', 'zz');
    expect(element.querySelector('[data-state="loading"]')?.textContent).toContain('Buscando clientes…');
    pending.get('zz')!([]); await settle();
    expect(element.querySelector('[data-state="empty"]')?.textContent).toContain('Sin coincidencias: se registrará como cliente nuevo.');
    customers.answer = () => { throw new Error('down'); };
    await type('customerSearch', 'zzz');
    expect(element.querySelector('[data-state="error"]')).toBeTruthy();
    customers.answer = (text) => of(PEOPLE.filter((p) => p.fullName.includes(text)));
    await click('Reintentar');
    expect(element.querySelector('[data-state="error"]')).toBeNull();
  });
});

describe('theOperatorCompanionHasThreeFieldsAndTheCustomerCompanionHasFive', () => {
  it('asks one companion per traveler beyond the titular, with three fields each', async () => {
    const { element, type } = await openForm();
    expect(element.querySelector<HTMLInputElement>('[name="people"]')!.value).toBe('4');
    expect(texts(element, '[data-companion-count]')).toEqual(['3 acompañantes requeridos']);
    await type('people', '2');
    expect(texts(element, '[data-companion-count]')).toEqual(['1 acompañante requerido']);
    await type('people', '4');
    const cards = Array.from(element.querySelectorAll('.crp-customers-companion'));
    expect(cards).toHaveLength(3);
    expect(texts(cards[0], 'strong')).toEqual(['Acompañante 1']);
    expect(texts(cards[0], 'label')).toEqual(['Nombre completo', 'Documento de identidad', 'Fecha de nacimiento']);
    expect(cards[0].querySelectorAll('input')).toHaveLength(3);
    expect(element.textContent).toContain('La cantidad total de viajeros determina los acompañantes que deben registrarse. Los documentos no pueden repetirse dentro de la misma reserva.');
    await type('people', '1');
    expect(texts(element, '[data-companion-count]')).toEqual(['No requiere acompañantes']);
    expect(element.querySelectorAll('.crp-customers-companion')).toHaveLength(0);
  });

  it('keeps what was typed for a companion when the number of travelers grows', async () => {
    const { element, type } = await openForm();
    await type('companionName-0', 'Ana Ficticia'); await type('people', '3');
    expect(element.querySelector<HTMLInputElement>('[name="companionName-0"]')!.value).toBe('Ana Ficticia');
  });

  it('sends the companions with the three fields, in the same command', async () => {
    const { ready, party, submit, writer } = await openForm();
    await ready('3'); await party(); await submit();
    expect(writer.calls[0].command.companions).toEqual([
      { fullName: 'Acompañante Ficticio 1', document: 'DOC 9101', birthDate: '1995-03-04' }, { fullName: 'Acompañante Ficticio 2', document: 'DOC 9102', birthDate: '1995-03-04' }]);
  });
});

describe('theBirthDateIsTypedAsDdMmAaaaAndTravelsAsIso', () => {
  it('shows a text field with the placeholder dd/mm/aaaa for the titular and for each companion', async () => {
    const { field } = await openForm();
    for (const name of ['holderBirth', 'companionBirth-0']) {
      expect(field<HTMLInputElement>(name).type, name).toBe('text');
      expect(field<HTMLInputElement>(name).placeholder, name).toBe('dd/mm/aaaa');
    }
  });

  it('sends the dates as ISO, and accepts a date in the future (that is AC-PC.13)', async () => {
    const { ready, party, type, submit, writer } = await openForm();
    await ready('2'); await party(); await type('holderBirth', '15/03/1990'); await type('companionBirth-0', '01/01/2999'); await submit();
    expect(writer.calls[0].command.lead!.birthDate).toBe('1990-03-15');
    expect(writer.calls[0].command.companions![0].birthDate).toBe('2999-01-01');
  });

  it('refuses a date that does not exist or is not dd/mm/aaaa, beside the field, and sends nothing', async () => {
    const { element, ready, party, type, submit, writer } = await openForm();
    await ready('2'); await party();
    for (const bad of ['31/02/1990', '1990-03-15', '15/13/1990', 'abc', '1/1/90']) {
      await type('holderBirth', bad); await type('companionBirth-0', bad); await submit();
      expect(errorBeside(element, 'holderBirth'), bad).toBe('Escribe una fecha válida (dd/mm/aaaa).');
      expect(errorBeside(element, 'companionBirth-0'), bad).toBe('Escribe una fecha válida (dd/mm/aaaa).');
    }
    expect(writer.calls).toHaveLength(0);
  });
});

describe('aRepeatedDocumentIsRefusedBesideTheFieldAndNothingIsSent', () => {
  it('refuses a companion document equal to the titular one, ignoring spaces and case', async () => {
    const { element, ready, party, type, submit, writer, button } = await openForm();
    await ready('2'); await party('DOC 9001'); await type('companionDocument-0', 'doc9001');
    expect(errorBeside(element, 'companionDocument-0')).toBe('Este documento ya está en la reserva.');
    expect(button('Registrar reserva')!.disabled).toBe(true);
    await submit();
    expect(writer.calls).toHaveLength(0);
  });

  it('refuses two companions with the same document', async () => {
    const { element, ready, party, type } = await openForm();
    await ready('3'); await party(); await type('companionDocument-1', 'DOC 9101');
    expect(errorBeside(element, 'companionDocument-1')).toBe('Este documento ya está en la reserva.');
  });

  it('names each missing datum beside its field after the submit, and sends nothing', async () => {
    const { element, ready, submit, writer, type } = await openForm();
    await ready('2');
    expect(errorBeside(element, 'holderName')).toBe('');
    await submit();
    for (const name of ['holderName', 'holderDocument', 'holderEmail', 'holderPhone', 'holderBirth', 'companionName-0', 'companionDocument-0', 'companionBirth-0']) expect(errorBeside(element, name), name).toBe('Obligatorio.');
    await type('holderEmail', 'sin-arroba'); await submit();
    expect(errorBeside(element, 'holderEmail')).toBe('Escribe un correo válido.');
    expect(writer.calls).toHaveLength(0);
  });
});

describe('theOperatorStripShowsTheCommercialNameOnlyWhenTheContainerSendsIt', () => {
  it('draws "Operador activo" with the name and its sentence', async () => {
    const { element } = await openForm({}, [{ provide: COMMERCIAL_NAME, useValue: 'Travesía Natural' }]);
    const strip = element.querySelector('.crp-reservations-tenant-context')!;
    expect(texts(strip, 'span, strong, p')).toEqual(['Operador activo', 'Travesía Natural', 'Todos los catálogos, condiciones, cupos y valores se consultan en este contexto.']);
  });

  it('draws nothing when the container does not send it', async () => {
    const { element } = await openForm();
    expect(element.querySelector('.crp-reservations-tenant-context')).toBeNull();
    expect(element.textContent).not.toContain('Operador activo');
  });
});

describe('theTextsOfSections02And04FollowTheMockup', () => {
  it('says what the mockup says before a tour is chosen', async () => {
    const { element, field } = await openForm();
    expect(texts(element, '[name="serviceId"] option')[0]).toBe('Selecciona un tour');
    expect(texts(element, '[name="departureId"] option')[0]).toBe('Selecciona primero un tour');
    expect(field<HTMLSelectElement>('departureId').disabled).toBe(true);
    expect(texts(element, '[name="paymentType"] option')[0]).toBe('Selecciona primero un tour');
    expect(texts(element, '[name="paymentMethod"] option')[0]).toBe('Selecciona primero un tour');
    expect(element.querySelector('[data-conditions]')?.textContent).toContain('Selecciona un tour para consultar las condiciones parametrizadas.');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Selecciona un tour para consultar sus requisitos y valores.');
    expect(element.textContent).not.toContain('Selecciona una opción');
    expect(texts(element, '[name="serviceId"] option').slice(1)).toEqual(['Kayak', 'Lunch']);
  });

  it('asks for the departure, then for the rest, then says the reservation is ready', async () => {
    const { element, tick, choose, type, payWith, party } = await openForm();
    await tick('svc-Kayak');
    expect(texts(element, '[name="departureId"] option')[0]).toBe('Selecciona una salida programada');
    expect(texts(element, '[name="paymentType"] option')[0]).toBe('Selecciona el tipo de pago');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Selecciona la salida programada: la reserva pertenece a una única salida.');
    await choose('departureId', 'dep-1');
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('Completa los campos obligatorios para registrar la reserva.');
    await type('people', '1'); await party(); await payWith();
    expect(element.querySelector('[data-feedback]')?.textContent).toContain('La reserva cumple las validaciones y está lista para registrarse. Quedará Pendiente de pago hasta cumplir la condición de confirmación.');
  });
});

describe('aCustomerRegisteredByHandIsFoundAndChosenInTheReservationForm', () => {
  const demo = () => {
    const customers = new DemoCustomersStore(), departures = new DemoDeparturesStore(), store = new DemoReservationsStore();
    const quotes = new DemoReservationQuotes(departures, new StubCatalog(DEFAULT_SERVICES), new StubDiscounts());
    return { customers, writer: new DemoReservationsWriter(store, departures, quotes, customers), open: departures.items[0] };
  };
  const lead = { fullName: 'Valentina Ficticia', document: '1.234.567.890', email: 'valentina@example.test', phone: '300 000 7777', birthDate: '1993-07-21' };

  it('finds the typed titular afterwards, by name, document or e-mail, in the same store as the three seeded ones', async () => {
    const { customers, writer, open } = demo();
    expect((await firstValueFrom(customers.search('camila'))).map((c) => c.fullName)).toEqual(['Camila Ortega (demo)']);
    const created = await firstValueFrom(writer.create({ lead, companions: [], departureId: open.id, serviceIds: ['svc-Kayak'], people: 1 }, 'k-1'));
    expect(created.leadCustomerName).toBe('Valentina Ficticia');
    for (const text of ['valent', '1234567', 'VALENTINA@example']) expect((await firstValueFrom(customers.search(text))).map((c) => c.fullName), text).toEqual(['Valentina Ficticia']);
  });

  it('registers the titular once when the same key is retried, and names a chosen customer from the store', async () => {
    const { customers, writer, open } = demo();
    const command = { lead, departureId: open.id, serviceIds: ['svc-Kayak'], people: 1 };
    await firstValueFrom(writer.create(command, 'k-2')); await firstValueFrom(writer.create(command, 'k-2'));
    expect(await firstValueFrom(customers.search('valent'))).toHaveLength(1);
    const chosen = await firstValueFrom(writer.create({ leadCustomerId: 'demo-cus-2', departureId: open.id, serviceIds: ['svc-Kayak'], people: 1 }, 'k-3'));
    expect(chosen.leadCustomerName).toBe('Andrés Pinto (demo)');
  });
});

describe('theSidebarHasNoTitularAndCompanionsItem', () => {
  it('keeps the area as code but out of the menu', () => {
    const area = PORTAL_AREAS.find((a) => a.key === 'customers');
    expect(area).toBeTruthy();
    expect(area!.menu).toBe(false);
  });
});

import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CUSTOMER_COMPANIONS_COPY as C } from '../src/app/shared/customer-companions-copy';
import { CustomerCompanionsSource, CustomerCompanionsWriter, COMPANIONS_AREA } from '../src/app/customers/data/customer-companions-ports';
import { BLANK_CUSTOMER_COMPANION, CustomerCompanion, ageText, companionIssues } from '../src/app/shared/customer-companions';
import { CustomerCompanionsPageComponent } from '../src/app/customers/pages/customer-companions-page.component';
import { PORTAL_AREAS, PORTAL_AREA_LIST } from '../src/app/portal-areas';
import { customerCompanionsDemoProviders } from '../src/app/demo/customer-companions-demo';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { PaymentMethodsSource, ReservationRequester, ReservationSelectionSource, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { SELF_SERVICE_TEXT as T } from '../src/app/self-service-reservation/self-service-copy';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { TourImages } from '../src/app/shared/tour-photo';
import { DemoTourImages } from '../src/app/demo/tour-photo-demo';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { COMPANION_A, COMPANION_B, ControllableCompanionsWriter, HOLDER_DOCUMENT, StaticCompanionsSource } from './customer-companions.double';
import { ControllableMyReservationsSource, ControllablePaymentMethods, CustomerAs, METHODS, RecordingRequester, SELECTION, quoteOf, reservationFor, selectionAt } from './self-service-reservation.double';

const TODAY = '2026-10-15';
const clock = { now: () => Date.parse(`${TODAY}T17:00:00Z`) } as Clock;
const FUTURE = '2027-01-01';
const MISSING = (n: number) => `Completa nombre, documento, fecha de nacimiento y contacto de emergencia del acompañante ${n}.`;
const FUTURE_TEXT = (n: number) => `La fecha de nacimiento del acompañante ${n} no puede ser futura.`;
const REPEATED = 'Hay un documento repetido: el documento del titular y de cada acompañante debe ser único dentro de la reserva.';

const ALL_FIELDS: readonly (keyof CustomerCompanion)[] = ['fullName', 'document', 'birthDate', 'phone', 'emergency'];
const field = (root: HTMLElement, key: keyof CustomerCompanion, index: number) => root.querySelector<HTMLInputElement>(`[name="companion-${key}-${index}"]`)!;
const type = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };
const buttonNamed = (root: HTMLElement, name: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);
const message = (root: HTMLElement) => root.querySelector('[data-companions-feedback]')?.textContent?.trim() ?? '';

async function openConfirm(people = 3) {
  const methods = new ControllablePaymentMethods();
  const requester = new RecordingRequester();
  TestBed.configureTestingModule({ providers: [
    { provide: Clock, useValue: clock },
    { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') },
    { provide: ReservationSelectionSource, useValue: selectionAt({ ...SELECTION, people }) },
    { provide: PaymentMethodsSource, useValue: methods },
    { provide: SelectionQuoteSource, useValue: quoteOf() },
    { provide: ReservationRequester, useValue: requester },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: TourImages, useValue: new DemoTourImages() },
  ] });
  const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  methods.requests.at(-1)!.reply(METHODS); await settle();
  const element: HTMLElement = fixture.nativeElement;
  const fillCommon = async () => {
    const select = element.querySelector('select') as HTMLSelectElement;
    select.value = 'BANK_TRANSFER'; select.dispatchEvent(new Event('change'));
    for (const box of Array.from(element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) box.click();
    // The titular is required on screen 21 (DP-RS5); the companions are typed by each test.
    for (const [key, value] of Object.entries({ name: 'Titular Ficticio', document: HOLDER_DOCUMENT, phone: '300 000 0000', email: 'titular@example.invalid', birthdate: '1990-04-12' })) type(element.querySelector<HTMLInputElement>('#crp-holder-' + key)!, value);
    await settle();
  };
  const fillCompanion = async (index: number, data: CustomerCompanion) => { for (const key of ALL_FIELDS) type(field(element, key, index), data[key]); await settle(); };
  const confirm = async () => { buttonNamed(element, T.confirm)!.click(); await settle(); };
  return { element, requester, settle, fillCommon, fillCompanion, confirm };
}

async function openScreen25(options: { reservations?: ReturnType<typeof reservationFor>[] | 'fail'; param?: string; saved?: CustomerCompanion[] } = {}) {
  const mine = new ControllableMyReservationsSource();
  const writer = new ControllableCompanionsWriter();
  const keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [
    { provide: Clock, useValue: clock },
    { provide: MyReservationsSource, useValue: mine },
    { provide: CustomerCompanionsSource, useValue: new StaticCompanionsSource({ holderDocument: HOLDER_DOCUMENT, companions: options.saved ?? [] }) },
    { provide: CustomerCompanionsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: PortalNavigation, useFactory: () => { const nav = new PortalNavigation(); nav.register([COMPANIONS_AREA, CLIENT_AREA.panel]); if (options.param) nav.open(COMPANIONS_AREA, { reservation: options.param }); return nav; } },
  ] });
  const fixture = TestBed.createComponent(CustomerCompanionsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const answer = async () => {
    if (options.reservations === 'fail') mine.requests.at(-1)!.fail(); else mine.requests.at(-1)!.reply(options.reservations ?? []);
    await settle();
  };
  const fillCompanion = async (index: number, data: CustomerCompanion) => { for (const key of ALL_FIELDS) type(field(element, key, index), data[key]); await settle(); };
  const save = async () => { buttonNamed(element, C.save)!.click(); await settle(); };
  return { fixture, element, mine, writer, keys, settle, state, answer, fillCompanion, save };
}

describe('theCustomerCompanionErrorsUseTheMockupTexts', () => {
  it('names the first companion with a missing datum and the future birth date, as the mockup writes them', () => {
    const complete = [COMPANION_A, COMPANION_B];
    expect(companionIssues(complete, HOLDER_DOCUMENT, TODAY).message).toBeNull();
    expect(companionIssues([COMPANION_A, { ...COMPANION_B, emergency: ' ' }], HOLDER_DOCUMENT, TODAY).message).toBe(MISSING(2));
    expect(companionIssues([{ ...COMPANION_A, fullName: '' }, { ...COMPANION_B, document: '' }], HOLDER_DOCUMENT, TODAY).message).toBe(MISSING(1));
    expect(companionIssues([COMPANION_A, { ...COMPANION_B, birthDate: FUTURE }], HOLDER_DOCUMENT, TODAY).message).toBe(FUTURE_TEXT(2));
    expect(companionIssues([{ ...COMPANION_A, phone: '' }], HOLDER_DOCUMENT, TODAY).message).toBeNull();
    expect(C.missing(3)).toBe(MISSING(3));
    expect(ageText('2001-05-01', TODAY)).toBe('25 años');
    expect(ageText('2026-01-01', TODAY)).toBe('0 años');
    expect(ageText('2025-10-15', TODAY)).toBe('1 año');
    expect(ageText(FUTURE, TODAY)).toBe('');
  });
  it('screen 21 draws five fields per companion and refuses to confirm with a datum missing', async () => {
    const p = await openConfirm(3); await p.fillCommon();
    expect(p.element.querySelectorAll('[name^="companion-fullName-"]')).toHaveLength(2);
    for (const key of ALL_FIELDS) expect(field(p.element, key, 0), key).not.toBeNull();
    for (const label of ['Nombre completo', 'Documento de identidad', 'Fecha de nacimiento', 'Teléfono (opcional)', 'Contacto de emergencia']) expect(p.element.textContent).toContain(label);
    await p.confirm();
    expect(message(p.element)).toBe(MISSING(1));
    expect(p.requester.calls).toHaveLength(0);
    await p.fillCompanion(0, COMPANION_A); await p.confirm();
    expect(message(p.element)).toBe(MISSING(2));
    await p.fillCompanion(1, { ...COMPANION_B, birthDate: FUTURE }); await p.confirm();
    expect(message(p.element)).toBe(FUTURE_TEXT(2));
    expect(p.requester.calls).toHaveLength(0);
  });
  it('screen 21 sends the companions the contract has fields for once they are complete', async () => {
    const p = await openConfirm(3); await p.fillCommon();
    await p.fillCompanion(0, COMPANION_A); await p.fillCompanion(1, COMPANION_B); await p.confirm();
    expect(p.requester.calls).toHaveLength(1);
    expect(p.requester.calls[0].companions).toEqual([COMPANION_A, COMPANION_B]);
    expect(message(p.element)).toBe('');
  });
  it('screen 21 asks no companion for a reservation of one person', async () => {
    const p = await openConfirm(1);
    expect(p.element.querySelector('[name^="companion-"]')).toBeNull();
  });
  it('screen 25 uses the same texts and saves nothing while a datum is missing', async () => {
    const p = await openScreen25({ reservations: [reservationFor({ ...SELECTION, people: 3 })] }); await p.answer();
    await p.save();
    expect(message(p.element)).toBe(MISSING(1));
    await p.fillCompanion(0, COMPANION_A); await p.fillCompanion(1, { ...COMPANION_B, birthDate: FUTURE }); await p.save();
    expect(message(p.element)).toBe(FUTURE_TEXT(2));
    expect(p.writer.calls).toHaveLength(0);
  });
});

describe('aRepeatedDocumentIsRefusedOnTheCustomerScreens', () => {
  it('compares the titular and every companion without spaces, dots or case, and marks each repeated document', () => {
    expect(companionIssues([COMPANION_A, { ...COMPANION_B, document: 'demo 2001' }], HOLDER_DOCUMENT, TODAY)).toMatchObject({ message: REPEATED, documents: ['Este documento ya está en la reserva.', 'Este documento ya está en la reserva.'] });
    expect(companionIssues([{ ...COMPANION_A, document: 'demo.1003' }], HOLDER_DOCUMENT, TODAY)).toMatchObject({ message: REPEATED, documents: [C.repeatedBeside] });
    expect(companionIssues([COMPANION_A, COMPANION_B], HOLDER_DOCUMENT, TODAY).documents).toEqual([undefined, undefined]);
    expect(companionIssues([BLANK_CUSTOMER_COMPANION, BLANK_CUSTOMER_COMPANION], '', TODAY).documents).toEqual([undefined, undefined]);
  });
  it('screen 21 refuses two equal documents beside the field and sends nothing', async () => {
    const p = await openConfirm(3); await p.fillCommon();
    await p.fillCompanion(0, COMPANION_A); await p.fillCompanion(1, { ...COMPANION_B, document: COMPANION_A.document }); await p.confirm();
    expect(message(p.element)).toBe(REPEATED);
    const document = field(p.element, 'document', 1);
    expect(document.getAttribute('aria-invalid')).toBe('true');
    expect(p.element.querySelector(`#${document.getAttribute('aria-describedby')}`)?.textContent).toContain(C.repeatedBeside);
    expect(p.requester.calls).toHaveLength(0);
  });
  it('screen 25 refuses the document of the titular and sends nothing', async () => {
    const p = await openScreen25({ reservations: [reservationFor({ ...SELECTION, people: 2 })] }); await p.answer();
    await p.fillCompanion(0, { ...COMPANION_A, document: HOLDER_DOCUMENT }); await p.save();
    expect(message(p.element)).toBe(REPEATED);
    expect(field(p.element, 'document', 0).getAttribute('aria-invalid')).toBe('true');
    expect(p.writer.calls).toHaveLength(0);
  });
});

describe('screen25ShowsTheEmptyStateAndTheSavedMessage', () => {
  it('shows Sin reserva activa and the invitation to create one when the customer has no active reservation', async () => {
    const p = await openScreen25({ reservations: [reservationFor(SELECTION, 'RES-1')].map((r) => ({ ...r, reservationStatus: 'CANCELLED' })) });
    expect(p.state()).toBe('loading');
    await p.answer();
    expect(p.state()).toBe('empty');
    expect(p.element.textContent).toContain('Sin reserva activa');
    expect(p.element.textContent).toContain('Crea una reserva para habilitar este formulario.');
    expect(p.element.querySelector('form')).toBeNull();
    expect(p.element.querySelector('h1')?.textContent).toContain('Datos de acompañantes');
  });
  it('shows an error with a retry', async () => {
    const p = await openScreen25({ reservations: 'fail' }); await p.answer();
    expect(p.state()).toBe('error');
    buttonNamed(p.element, C.retry)!.click(); await p.settle();
    expect(p.state()).toBe('loading');
  });
  it('draws the reservation and a card per companion, the saved ones included', async () => {
    const p = await openScreen25({ reservations: [reservationFor({ ...SELECTION, people: 3 })], saved: [COMPANION_A] }); await p.answer();
    expect(p.state()).toBe('data');
    expect(p.element.textContent).toContain('Reserva activa');
    expect(p.element.textContent).toContain('Ruta Andina');
    expect(p.element.textContent).toContain('Reserva RES-1843. Completa los datos de 2 acompañantes.');
    expect(field(p.element, 'fullName', 0).value).toBe(COMPANION_A.fullName);
    expect(field(p.element, 'fullName', 1).value).toBe('');
    expect(p.element.textContent).toContain('25 años');
    for (const text of ['Guardar acompañantes', 'Volver a reservas', 'Volver a mis reservas']) expect(p.element.textContent).toContain(text);
  });
  it('opens the reservation named by the navigation parameter, and says a single traveler needs no companions', async () => {
    const p = await openScreen25({ param: 'RES-2', reservations: [reservationFor({ ...SELECTION, people: 3 }, 'RES-1'), reservationFor({ ...SELECTION, people: 1 }, 'RES-2')] }); await p.answer();
    expect(p.element.textContent).toContain('Reserva RES-2. Esta reserva no requiere acompañantes adicionales.');
    expect(p.element.textContent).toContain('Sin acompañantes por registrar');
    expect(p.element.textContent).toContain('Esta reserva fue creada para un solo viajero.');
  });
  it('saves once under one Idempotency-Key, reuses it on a retry and then says Acompañantes guardados.', async () => {
    const p = await openScreen25({ reservations: [reservationFor({ ...SELECTION, people: 3 })] }); await p.answer();
    await p.fillCompanion(0, COMPANION_A); await p.fillCompanion(1, COMPANION_B); await p.save();
    expect(p.writer.calls).toHaveLength(1);
    expect(p.writer.calls[0]).toMatchObject({ reservationId: 'RES-1843', companions: [COMPANION_A, COMPANION_B] });
    expect(buttonNamed(p.element, C.save)!.disabled).toBe(true);
    p.writer.calls[0].fail(); await p.settle();
    expect(message(p.element)).toBe(C.refused);
    await p.save();
    expect(p.writer.calls[1].key).toBe(p.writer.calls[0].key);
    p.writer.calls[1].reply(); await p.settle();
    expect(message(p.element)).toBe('Acompañantes guardados.');
    expect(p.keys.generated).toHaveLength(1);
  });
  it('is a customer area without a menu item, registered with the demo ports and absent from the real registry (decision D-7)', () => {
    expect(PORTAL_AREAS.some((a) => a.key === COMPANIONS_AREA)).toBe(false);
    TestBed.configureTestingModule({ providers: [{ provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') }, ...customerCompanionsDemoProviders()] });
    const area = TestBed.inject(PORTAL_AREA_LIST).find((a) => a.key === COMPANIONS_AREA)!;
    expect(area).toMatchObject({ menu: false, audience: 'customer', clientChrome: 'none' });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
    expect(TestBed.inject(PORTAL_AREA_LIST).length).toBe(PORTAL_AREAS.length + 1);
  });
});

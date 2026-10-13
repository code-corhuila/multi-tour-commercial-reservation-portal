import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import {
  PaymentMethodsSource,
  ReservationRequester,
  ReservationSelectionSource,
  SelectionQuoteSource,
} from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import {
  CustomerStanding,
  RESERVATION_FLOW,
  ReservationSelection,
  SELF_SERVICE_TEXT as T,
  selectionFromParams,
  selectionFromQuery,
  standingOf,
} from '../src/app/self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { MyReservationsPageComponent } from '../src/app/self-service-reservation/pages/my-reservations-page.component';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { tourPhoto } from '../src/app/shared/tour-photo';
import { CLIENT_AREA, PortalNavigation } from '../src/app/portal-navigation';
import { apiError, ControllableIdempotencyKeys } from './catalog-items-writer.double';
import {
  ControllableMyReservationsSource,
  ControllablePaymentMethods,
  CustomerAs,
  METHODS,
  noCapacity,
  quoteOf,
  RecordingRequester,
  reservationFor,
  SELECTION,
  selectionAt,
} from './self-service-reservation.double';

const buttonNamed = (root: HTMLElement, name: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);

async function openConfirm(options: { standing?: CustomerStanding; selection?: ReservationSelection | null; keys?: ControllableIdempotencyKeys; areas?: readonly string[] } = {}) {
  const customer = new CustomerAs(options.standing ?? 'FINAL_CUSTOMER');
  const methods = new ControllablePaymentMethods();
  const requester = new RecordingRequester();
  const keys = options.keys ?? new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: customer },
    { provide: ReservationSelectionSource, useValue: selectionAt(options.selection === undefined ? SELECTION : options.selection) },
    { provide: PaymentMethodsSource, useValue: methods },
    { provide: SelectionQuoteSource, useValue: quoteOf() },
    { provide: ReservationRequester, useValue: requester },
    { provide: IdempotencyKeys, useValue: keys },
    ...(options.areas ? [{ provide: PortalNavigation, useFactory: () => { const nav = new PortalNavigation(); nav.register(options.areas!); return nav; } }] : []),
  ] });
  const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const showMethods = async () => { methods.requests.at(-1)!.reply(METHODS); await settle(); };
  const choose = async (code: string) => {
    const select = element.querySelector('select') as HTMLSelectElement;
    select.value = code; select.dispatchEvent(new Event('change')); await settle();
  };
  const accept = async () => {
    for (const box of Array.from(element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) { box.click(); }
    await settle();
  };
  const fill = async (code = 'BANK_TRANSFER') => { await choose(code); await accept(); };
  const confirm = async () => { buttonNamed(element, T.confirm)!.click(); await settle(); };
  return { fixture, element, customer, methods, requester, keys, settle, state, showMethods, choose, accept, fill, confirm };
}

async function openPanel(standing: CustomerStanding = 'FINAL_CUSTOMER', areas?: readonly string[]) {
  const source = new ControllableMyReservationsSource();
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: new CustomerAs(standing) },
    { provide: MyReservationsSource, useValue: source },
    ...(areas ? [{ provide: PortalNavigation, useFactory: () => { const nav = new PortalNavigation(); nav.register(areas); return nav; } }] : []),
  ] });
  const fixture = TestBed.createComponent(MyReservationsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  return { fixture, element, source, settle, state };
}

describe('theSelectionTravelsInTheUrl (DP-RS1)', () => {
  it('reads departure, services and people from the query', () => {
    expect(selectionFromQuery('?departure=dep-1&services=svc-1,svc-2&people=2'))
      .toEqual({ departureId: 'dep-1', serviceIds: ['svc-1', 'svc-2'], people: 2 });
  });
  it('refuses an incomplete or malformed selection instead of guessing', () => {
    for (const query of ['', '?departure=d&people=2', '?services=s&people=2', '?departure=d&services=s',
      '?departure=d&services=s&people=0', '?departure=d&services=s&people=2.5', '?departure=d&services=s&people=x', '?departure=d&services=,&people=1']) {
      expect(selectionFromQuery(query), query).toBeNull();
    }
  });
});

describe('theCustomerStandingComesFromTheSessionRoles (DP-RS2)', () => {
  it('is a final customer, no session, or any other role', () => {
    expect(standingOf(['FINAL_CUSTOMER'])).toBe('FINAL_CUSTOMER');
    expect(standingOf([])).toBe('NO_SESSION');
    expect(standingOf(['TENANT_ADMINISTRATOR'])).toBe('OTHER');
    expect(standingOf(['SOMETHING_ELSE'])).toBe('OTHER');
  });
  it('asks the container to sign in through the function it is given, and fails closed by default', () => {
    let asked = 0;
    const context = customerContextFor([], () => { asked += 1; });
    context.requestSignIn();
    expect(context.standing).toBe('NO_SESSION');
    expect(asked).toBe(1);
    expect(TestBed.inject(CustomerContext).standing).toBe('OTHER');
  });
});

describe('everySelfServiceScreenShowsOneOfTheFourStates', () => {
  it('the confirmation: loading, error with retry, empty and data', async () => {
    const p = await openConfirm();
    expect(p.state()).toBe('loading');
    p.methods.requests[0].fail(); await p.settle();
    expect(p.state()).toBe('error');
    buttonNamed(p.element, T.retry)!.click(); await p.settle();
    expect(p.state()).toBe('loading');
    p.methods.requests[1].reply([]); await p.settle();
    expect(p.state()).toBe('empty');
    expect(p.element.textContent).toContain(T.noMethods);
    p.fixture.componentInstance.reload(); await p.showMethods();
    expect(p.state()).toBe('data');
  });
  it('the confirmation without a selection is empty and asks for nothing', async () => {
    const p = await openConfirm({ selection: null });
    expect(p.state()).toBe('empty');
    expect(p.element.textContent).toContain(T.noSelection);
    expect(p.methods.requests).toHaveLength(0);
  });
  it('the panel: loading, error with retry, empty and data', async () => {
    const p = await openPanel();
    expect(p.state()).toBe('loading');
    p.source.requests[0].fail(); await p.settle();
    expect(p.state()).toBe('error');
    buttonNamed(p.element, T.retry)!.click(); await p.settle();
    p.source.requests[1].reply([]); await p.settle();
    expect(p.state()).toBe('empty');
    p.fixture.componentInstance.reload(); p.source.requests[2].reply([reservationFor()]); await p.settle();
    expect(p.state()).toBe('data');
  });
  it('the panel keeps the newest request and drops the slower one', async () => {
    const p = await openPanel();
    p.fixture.componentInstance.reload();
    p.source.requests[1].reply([reservationFor(SELECTION, 'new-one')]);
    p.source.requests[0].reply([reservationFor(SELECTION, 'old-one')]); await p.settle();
    expect(p.element.textContent).toContain('new-one');
    expect(p.element.textContent).not.toContain('old-one');
    expect(p.source.requests[0].isOpen()).toBe(false);
  });
});

describe('confirmsTheSelectionAndCreatesAPendingPaymentReservation', () => {
  it('summarizes the selection, sends it with the method, and shows the values the service returned', async () => {
    const p = await openConfirm(); await p.showMethods();
    for (const shown of ['Ruta Andina', '18 sep 2026', '2 viajeros']) expect(p.element.textContent).toContain(shown);
    await p.fill(); await p.confirm();
    expect(p.requester.calls).toHaveLength(1);
    expect(p.requester.calls[0].selection).toEqual(SELECTION);
    expect(p.requester.calls[0].paymentMethod).toBe('BANK_TRANSFER');
    p.requester.calls[0].reply(reservationFor()); await p.settle();
    const created = p.element.querySelector('.self-service-created')!;
    for (const shown of [T.created, 'RES-1843', '$1.299.000', 'Pendiente de pago']) expect(created.textContent).toContain(shown);
    expect(created.querySelector('.crp-status.crp-is-pending')?.textContent?.trim()).toBe('Pendiente de pago');
    for (const raw of ['PENDING_PAYMENT', 'SIN_PAGO', '1299000.00']) expect(p.element.textContent).not.toContain(raw);
  });
  it('offers only the enabled payment methods', async () => {
    const p = await openConfirm(); await p.showMethods();
    const options = Array.from(p.element.querySelectorAll('option'), (o) => o.value).filter(Boolean);
    expect(options).toEqual(['BANK_TRANSFER', 'CASH_AT_OFFICE']);
  });
});

describe('aMissingFieldShowsItsErrorBesideItAndSubmitWaits', () => {
  it('creates nothing without a method and says so beside the field', async () => {
    const p = await openConfirm(); await p.showMethods();
    await p.confirm();
    expect(p.requester.calls).toHaveLength(0);
    const select = p.element.querySelector('select')!;
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(p.element.querySelector(`#${select.getAttribute('aria-describedby')}`)?.textContent).toContain(T.methodMissing);
    expect(p.element.querySelector(`label[for="${select.id}"]`)?.textContent).toContain(T.method);
    const box = p.element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(p.element.querySelector(`#${box.getAttribute('aria-describedby')}`)?.textContent).toContain(T.mustAccept);
  });
  it('creates nothing until both conditions are accepted', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER');
    p.element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await p.confirm();
    expect(p.requester.calls).toHaveLength(0);
    expect(p.element.textContent).toContain(T.mustAccept);
  });
  it('disables the confirmation while a request is pending', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill(); await p.confirm();
    expect(buttonNamed(p.element, T.confirm)!.disabled).toBe(true);
  });
});

describe('aRetriedConfirmationReusesItsIdempotencyKey', () => {
  it('a double click sends one request', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill();
    const button = buttonNamed(p.element, T.confirm)!;
    button.click(); button.click(); await p.settle();
    expect(p.requester.calls).toHaveLength(1);
  });
  it('a retry after an error sends the same key, and success makes no new key', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill();
    await p.confirm(); p.requester.calls[0].fail(apiError({ status: 503, userMessage: 'Try again later.' })); await p.settle();
    expect(p.element.textContent).toContain('Try again later.');
    await p.confirm();
    expect(p.requester.calls[1].idempotencyKey).toBe(p.requester.calls[0].idempotencyKey);
    p.requester.calls[1].reply(reservationFor()); await p.settle();
    expect(p.keys.generated.length).toBe(1);
  });
});

describe('aCreatedReservationCannotBeConfirmedAgain (audit S23, AC-RS.6)', () => {
  it('after success the confirm action is gone and a new submit sends nothing', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill(); await p.confirm();
    p.requester.calls[0].reply(reservationFor()); await p.settle();
    expect(buttonNamed(p.element, T.confirm)).toBeUndefined();
    p.element.querySelector('form')!.dispatchEvent(new Event('submit')); await p.settle();
    expect(p.requester.calls).toHaveLength(1);
    expect(p.keys.generated).toHaveLength(1);
  });

  it('shows the success state with Ver mis reservas, which opens Mis reservas', async () => {
    const p = await openConfirm({ areas: [CLIENT_AREA.reservations] }); await p.showMethods(); await p.fill(); await p.confirm();
    p.requester.calls[0].reply(reservationFor()); await p.settle();
    expect(p.element.querySelector('[role="status"].self-service-created')?.textContent).toContain('RES-1843');
    buttonNamed(p.element, 'Ver mis reservas')!.click(); await p.settle();
    expect(TestBed.inject(PortalNavigation).selected()).toBe(CLIENT_AREA.reservations);
  });
});

describe('aDepartureWithoutCapacityCreatesNothingAndSaysWhy (AC2)', () => {
  it('reports the refusal and shows no created reservation', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill(); await p.confirm();
    p.requester.calls[0].fail(noCapacity()); await p.settle();
    expect(p.element.querySelector('[role="alert"]')?.textContent).toContain(T.noCapacity);
    expect(p.element.textContent).not.toContain(T.created);
    expect(buttonNamed(p.element, T.confirm)!.disabled).toBe(false);
  });
  it('prefers the message the container decided, when there is one', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.fill(); await p.confirm();
    p.requester.calls[0].fail(noCapacity({ userMessage: 'Sold out for that date.' })); await p.settle();
    expect(p.element.querySelector('[role="alert"]')?.textContent).toContain('Sold out for that date.');
  });
});

describe('withoutSessionConfirmAsksToSignInAndKeepsTheSelection (AC-RS.2)', () => {
  it('asks the container to sign in, sends nothing, and the remounted screen still has the selection', async () => {
    const before = await openConfirm({ standing: 'NO_SESSION' }); await before.showMethods(); await before.fill();
    await before.confirm();
    expect(before.customer.signInRequests).toBe(1);
    expect(before.requester.calls).toHaveLength(0);
    expect(before.element.textContent).toContain(T.signIn);
    TestBed.resetTestingModule();
    const after = await openConfirm({ standing: 'FINAL_CUSTOMER' }); await after.showMethods();
    expect(after.element.textContent).toContain('Ruta Andina');
    expect(buttonNamed(after.element, T.confirm)).toBeDefined();
  });
});

describe('anInternalOrUnknownRoleIsNotOfferedTheConfirmation', () => {
  it('shows the selection read-only, with no confirm action', async () => {
    const p = await openConfirm({ standing: 'OTHER' }); await p.showMethods();
    expect(p.element.textContent).toContain('Ruta Andina');
    expect(buttonNamed(p.element, T.confirm)).toBeUndefined();
    expect(p.element.textContent).toContain(T.notCustomer);
  });
  it('does not read any reservation in the panel for another role', async () => {
    for (const standing of ['OTHER', 'NO_SESSION'] as const) {
      const p = await openPanel(standing);
      expect(p.source.requests).toHaveLength(0);
      expect(p.element.textContent).toContain(T.panelNotCustomer);
      TestBed.resetTestingModule();
    }
  });
});

describe('theScreensFollowTheAuthorizedMockups (finalizar-reserva, mis-reservas)', () => {
  it('the confirmation draws finalizar-reserva: topbar, holder, travelers, conditions, method, summary, help and bar', async () => {
    const p = await openConfirm(); await p.showMethods();
    const text = (selector: string) => p.element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(text('.crp-booking-topbar h1')).toBe('Finalizar reserva de tour');
    expect(text('.crp-finish-pill')).toBe('Selecciona el medio de pago habilitado para esta reserva.');
    expect(Array.from(p.element.querySelectorAll('.crp-finish-main h2'), (h) => h.textContent?.trim()))
      .toEqual(['Cliente titular', 'Viajeros', 'Condiciones de reserva', 'Medio de pago']);
    const holder = Array.from(p.element.querySelectorAll<HTMLInputElement>('.crp-finish-holder input'));
    expect(holder.map((input) => p.element.querySelector('label[for="' + input.id + '"]')?.textContent?.trim()))
      .toEqual(['Nombre completo', 'Documento de identidad', 'Teléfono', 'Correo electrónico', 'Fecha de nacimiento']);
    expect(holder.map((input) => input.type)).toEqual(['text', 'text', 'tel', 'email', 'date']);
    expect(text('.crp-finish-travelers')).toContain('1 acompañante requerido');
    expect(Array.from(p.element.querySelectorAll('.crp-finish-conditions li'), (li) => li.textContent?.trim())).toEqual([
      'La modificación o cancelación depende de las condiciones vigentes del tour.',
      'La disponibilidad y los valores se validan antes de registrar la reserva.',
    ]);
    const consents = Array.from(p.element.querySelectorAll('input[type="checkbox"]'), (box) => box.closest('label')?.textContent?.trim());
    expect(consents).toEqual(['Confirmo que acepto las condiciones aplicables a esta reserva.', 'Acepto los términos y condiciones.']);
    const summary = p.element.querySelector('.crp-finish-aside .self-service-summary')!;
    expect(summary.querySelector('h2')?.textContent?.trim()).toBe('Resumen de reserva');
    // demo-svc-1 is the Tatacoa desert: the sunset photo, the same as in the public offer.
    expect(summary.querySelector('.crp-finish-media img')?.getAttribute('src')).toBe('/assets/mountain-hero.jpg');
    expect(summary.querySelector('.self-service-summary-copy')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ruta Andina 18 sep 2026 2 viajeros');
    const rows = Array.from(summary.querySelectorAll('dt'), (dt) => (dt.textContent?.trim() ?? '') + ' ' + (dt.nextElementSibling?.textContent?.trim() ?? ''));
    expect(rows).toEqual(['Precio base $2.598.000', 'Descuentos aplicables -$519.600', 'Valor final $2.078.400']);
    expect(text('.crp-finish-help')).toBe('¿Necesitas ayuda? Asistencia comercial El equipo del operador puede ayudarte a continuar el proceso.');
    const bar = Array.from(p.element.querySelectorAll('.crp-booking-bar-pricing > div, .crp-booking-bar-selection'), (d) => d.textContent?.replace(/\s+/g, ' ').trim());
    expect(bar).toEqual(['Reserva Borrador', 'Total $2.078.400', 'Seleccionado 18 sep 2026 - 2 viajeros']);
    expect(p.element.querySelector('.crp-booking-bar button[type="submit"]')?.textContent?.trim()).toBe('Confirmar reserva');
    for (const absent of ['Método y plazo de pago', 'Abono', 'Pago total', 'Monto a abonar', 'Continuar al pago', 'demo-dep-7', 'demo-svc-1', '2026-09-18']) {
      expect(p.element.textContent).not.toContain(absent);
    }
  });

  it('the summary photo is the photo of the tour in the featured cards, and no photo leaves the neutral block', () => {
    expect(tourPhoto('svc-1')).toBe(tourPhoto('svc-1'));
    expect(new Set(['svc-1', 'svc-2', 'svc-3', 'svc-4', 'svc-5', 'svc-6'].map(tourPhoto)).size).toBeGreaterThan(1);
    expect(tourPhoto('')).toBeNull();
    expect(tourPhoto(undefined)).toBeNull();
    expect(tourPhoto('demo-svc-3')).toBe('/assets/destino-cascadas-de-iraka.jpg'); // Canotaje en el Río Suaza
  });

  it('Volver a fecha y viajeros reopens Reservar tour on the same tour', async () => {
    const navigation = new PortalNavigation();
    navigation.register([RESERVATION_FLOW.reserve, RESERVATION_FLOW.finish]);
    TestBed.configureTestingModule({ providers: [{ provide: PortalNavigation, useValue: navigation }] });
    const p = await openConfirm();
    buttonNamed(p.element, '← Volver a fecha y viajeros')!.click();
    expect(navigation.selected()).toBe(RESERVATION_FLOW.reserve);
    expect(navigation.params()).toEqual({ tour: 'demo-svc-1' });
  });
  it('the confirmation without a selection says so in Spanish', async () => {
    const p = await openConfirm({ selection: null });
    expect(p.element.textContent).toContain('No hay una reserva en curso. Vuelve a Explorar para seleccionar un tour.');
  });
  it('Mis reservas draws the header, the history and one card per reservation, never a code', async () => {
    const p = await openPanel(); p.source.requests[0].reply([reservationFor()]); await p.settle();
    expect(p.element.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe('Portal cliente');
    expect(p.element.querySelector('h1')?.textContent?.trim()).toBe('Mis reservas');
    expect(p.element.querySelector('h2')?.textContent?.trim()).toBe('Historial de reservas');
    const card = p.element.querySelector('.self-service-card')!;
    expect(card.querySelector('strong')?.textContent?.trim()).toBe('RES-1843 · Ruta Andina');
    expect(card.textContent).toContain('Salida: 18 sep 2026 · 06:30 · 2 viajeros');
    expect(card.querySelector('.crp-status.crp-is-pending')?.textContent?.trim()).toBe('Pendiente de pago');
    expect(card.textContent).toContain('Valor: $1.299.000');
    for (const raw of ['PENDING_PAYMENT', 'SIN_PAGO', 'demo-dep-7', '1299000', 'Saldo', 'Medio de pago', 'Responder propuesta']) expect(p.element.textContent).not.toContain(raw);
  });
  it('the confirmation uses the client cards of finalizar-reserva, never the operator classes', async () => {
    const c = await openConfirm(); await c.showMethods();
    expect(c.element.querySelector('[class*="crp-operator"]')).toBeNull();
    expect(c.element.querySelector('form .crp-finish-layout > .crp-finish-main > .crp-booking-card')).not.toBeNull();
    expect(c.element.querySelector('form .crp-finish-layout > aside.crp-finish-aside > .crp-booking-card.self-service-summary')).not.toBeNull();
    expect(c.element.querySelector('form .crp-booking-bar button[type="submit"].crp-primary')).not.toBeNull();
  });
  it('the confirmation stacks top bar, two-column body and bottom bar, never under a generic form grid', async () => {
    const c = await openConfirm(); await c.showMethods();
    const form = c.element.querySelector('form.self-service-confirm')!;
    expect(Array.from(form.children, (child) => child.classList[0])).toEqual(['crp-booking-topbar', 'crp-finish-content', 'crp-booking-bar']);
    expect(Array.from(form.querySelectorAll('.crp-finish-layout > *'), (column) => column.classList[0])).toEqual(['crp-finish-main', 'crp-finish-aside']);
    const css = readFileSync('src/styles/portal.css', 'utf8');
    const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';
    expect(rule('.crp-root .self-service-confirm')).toMatch(/display:\s*block;\s*margin:\s*0;/);
    expect(rule('.crp-root .crp-finish-content')).toMatch(/width:\s*min\(100%, 1100px\);\s*margin:\s*0 auto;\s*padding:\s*24px 0 144px;/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{[^@]*\.crp-root \.crp-finish-content \{ padding-bottom: 210px; \}/);
    expect(rule('.crp-root .crp-finish-layout')).toMatch(/grid-template-columns:\s*minmax\(0, 1\.6fr\) minmax\(260px, 1fr\)/);
  });
  it('Mis reservas uses the client classes in every state, never the operator ones', async () => {
    const p = await openPanel(); p.source.requests[0].fail(); await p.settle();
    expect(p.element.querySelector('[data-state="error"] button.crp-outline')).not.toBeNull();
    p.fixture.componentInstance.reload(); await p.settle(); p.source.requests.at(-1)!.reply([reservationFor()]); await p.settle();
    expect(p.element.querySelector('[class*="crp-operator"]')).toBeNull();
  });
  it('Mis reservas without reservations shows the empty text of the mockup', async () => {
    const p = await openPanel(); p.source.requests[0].reply([]); await p.settle();
    expect(p.element.textContent).toContain('Todavía no tienes reservas registradas. Explora el catálogo para crear la primera.');
  });
});

describe('theScreensAreSeparateAsInTheMockups (finalizar-reserva, mis-reservas; PR #361)', () => {
  it('Finalizar reserva is its own customer area and Mis reservas only lists', () => {
    const finish = PORTAL_AREAS.filter((area) => area.component === ConfirmReservationPageComponent);
    expect(finish).toHaveLength(1);
    expect(finish[0]).toMatchObject({ key: RESERVATION_FLOW.finish, label: 'Finalizar reserva', audience: 'customer', clientChrome: 'none' });
    expect(PORTAL_AREAS.find((area) => area.key === CLIENT_AREA.reservations)?.component).toBe(MyReservationsPageComponent);
  });

  it('the confirmation reads the selection Reservar tour opened it with, before the URL (DP-RS1)', async () => {
    const methods = new ControllablePaymentMethods();
    const navigation = new PortalNavigation();
    navigation.register([RESERVATION_FLOW.finish]);
    navigation.open(RESERVATION_FLOW.finish, { departure: 'dep-9', services: 'svc-3', people: '3' });
    const quotes: ReservationSelection[] = [];
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') },
      { provide: PortalNavigation, useValue: navigation },
      { provide: ReservationSelectionSource, useValue: selectionAt(null) },
      { provide: PaymentMethodsSource, useValue: methods },
      { provide: SelectionQuoteSource, useValue: { quote: (selection: ReservationSelection) => { quotes.push(selection); return quoteOf().quote(selection); } } },
      { provide: ReservationRequester, useValue: new RecordingRequester() },
      { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    ] });
    const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
    fixture.detectChanges(); await fixture.whenStable();
    expect(quotes).toEqual([{ departureId: 'dep-9', serviceIds: ['svc-3'], people: 3 }]);
    expect(selectionFromParams({})).toBeNull();
  });

  it('Mis reservas has no back link in the body: Volver al panel is in the compact header', async () => {
    const p = await openPanel('FINAL_CUSTOMER', [CLIENT_AREA.panel, CLIENT_AREA.reservations]);
    expect(p.element.textContent).not.toContain('Volver al panel');
  });

  it('Mis reservas sizes its header as mis-reservas.html: 48px title without margins, small dark-green eyebrow, 1rem description', () => {
    const css = readFileSync('src/styles/portal.css', 'utf8');
    const rule = (selector: string) => css.split(/\r?\n/).find((line) => line.startsWith(selector + ' {'))?.split('{')[1] ?? '';
    expect(rule('.crp-root .self-service-panel .crp-page-header-title')).toMatch(/font-size:\s*3rem/);
    expect(rule('.crp-root .self-service-panel .crp-page-header-title')).toMatch(/font-weight:\s*800/);
    expect(rule('.crp-root .self-service-panel .crp-page-header-eyebrow')).toMatch(/color:\s*#1f4d3d/);
    expect(rule('.crp-root .self-service-panel .crp-page-header-title')).toMatch(/margin:\s*0;/);
    expect(rule('.crp-root .self-service-panel .crp-page-header-desc')).toMatch(/font-size:\s*1rem;\s*line-height:\s*1\.65/);
    expect(rule('.crp-root .self-service-panel .crp-page-header-desc + .crp-page-header-desc')).toMatch(/margin-top:\s*8px;\s*color:\s*#17252b/);
  });
});

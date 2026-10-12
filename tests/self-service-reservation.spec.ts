import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IdempotencyKeys } from '../src/app/catalog/data/catalog-api.service';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import {
  PaymentMethodsSource,
  ReservationRequester,
  ReservationSelectionSource,
} from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import {
  CustomerStanding,
  ReservationSelection,
  SELF_SERVICE_TEXT as T,
  selectionFromQuery,
  standingOf,
} from '../src/app/self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { MyReservationsPageComponent } from '../src/app/self-service-reservation/pages/my-reservations-page.component';
import { apiError, ControllableIdempotencyKeys } from './catalog-items-writer.double';
import {
  ControllableMyReservationsSource,
  ControllablePaymentMethods,
  CustomerAs,
  METHODS,
  noCapacity,
  RecordingRequester,
  reservationFor,
  SELECTION,
  selectionAt,
} from './self-service-reservation.double';

const buttonNamed = (root: HTMLElement, name: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);

async function openConfirm(options: { standing?: CustomerStanding; selection?: ReservationSelection | null; keys?: ControllableIdempotencyKeys } = {}) {
  const customer = new CustomerAs(options.standing ?? 'FINAL_CUSTOMER');
  const methods = new ControllablePaymentMethods();
  const requester = new RecordingRequester();
  const keys = options.keys ?? new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: customer },
    { provide: ReservationSelectionSource, useValue: selectionAt(options.selection === undefined ? SELECTION : options.selection) },
    { provide: PaymentMethodsSource, useValue: methods },
    { provide: ReservationRequester, useValue: requester },
    { provide: IdempotencyKeys, useValue: keys },
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
  const confirm = async () => { buttonNamed(element, T.confirm)!.click(); await settle(); };
  return { fixture, element, customer, methods, requester, keys, settle, state, showMethods, choose, confirm };
}

async function openPanel(standing: CustomerStanding = 'FINAL_CUSTOMER') {
  const source = new ControllableMyReservationsSource();
  TestBed.configureTestingModule({ providers: [
    { provide: CustomerContext, useValue: new CustomerAs(standing) },
    { provide: MyReservationsSource, useValue: source },
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
  it('shows the selection, sends it with the method, and shows the values the service returned', async () => {
    const p = await openConfirm(); await p.showMethods();
    for (const shown of ['demo-dep-7', 'demo-svc-1', 'demo-svc-2']) expect(p.element.textContent).toContain(shown);
    await p.choose('BANK_TRANSFER'); await p.confirm();
    expect(p.requester.calls).toHaveLength(1);
    expect(p.requester.calls[0].selection).toEqual(SELECTION);
    expect(p.requester.calls[0].paymentMethod).toBe('BANK_TRANSFER');
    p.requester.calls[0].reply(reservationFor()); await p.settle();
    const text = p.element.textContent ?? '';
    for (const shown of [T.created, 'demo-res-1', '360000.00', 'PENDING_PAYMENT', 'SIN_PAGO']) expect(text).toContain(shown);
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
  });
  it('disables the confirmation while a request is pending', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER'); await p.confirm();
    expect(buttonNamed(p.element, T.confirm)!.disabled).toBe(true);
  });
});

describe('aRetriedConfirmationReusesItsIdempotencyKey', () => {
  it('a double click sends one request', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER');
    const button = buttonNamed(p.element, T.confirm)!;
    button.click(); button.click(); await p.settle();
    expect(p.requester.calls).toHaveLength(1);
  });
  it('a retry after an error sends the same key, and a new intention after success gets a new one', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER');
    await p.confirm(); p.requester.calls[0].fail(apiError({ status: 503, userMessage: 'Try again later.' })); await p.settle();
    expect(p.element.textContent).toContain('Try again later.');
    await p.confirm();
    expect(p.requester.calls[1].idempotencyKey).toBe(p.requester.calls[0].idempotencyKey);
    p.requester.calls[1].reply(reservationFor()); await p.settle();
    expect(p.keys.generated.length).toBe(2);
    expect(p.keys.generated[1]).not.toBe(p.requester.calls[0].idempotencyKey);
  });
});

describe('aDepartureWithoutCapacityCreatesNothingAndSaysWhy (AC2)', () => {
  it('reports the refusal and shows no created reservation', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER'); await p.confirm();
    p.requester.calls[0].fail(noCapacity()); await p.settle();
    expect(p.element.querySelector('[role="alert"]')?.textContent).toContain(T.noCapacity);
    expect(p.element.textContent).not.toContain(T.created);
    expect(buttonNamed(p.element, T.confirm)!.disabled).toBe(false);
  });
  it('prefers the message the container decided, when there is one', async () => {
    const p = await openConfirm(); await p.showMethods(); await p.choose('BANK_TRANSFER'); await p.confirm();
    p.requester.calls[0].fail(noCapacity({ userMessage: 'Sold out for that date.' })); await p.settle();
    expect(p.element.querySelector('[role="alert"]')?.textContent).toContain('Sold out for that date.');
  });
});

describe('withoutSessionConfirmAsksToSignInAndKeepsTheSelection (AC-RS.2)', () => {
  it('asks the container to sign in, sends nothing, and the remounted screen still has the selection', async () => {
    const before = await openConfirm({ standing: 'NO_SESSION' }); await before.showMethods(); await before.choose('BANK_TRANSFER');
    await before.confirm();
    expect(before.customer.signInRequests).toBe(1);
    expect(before.requester.calls).toHaveLength(0);
    expect(before.element.textContent).toContain(T.signIn);
    TestBed.resetTestingModule();
    const after = await openConfirm({ standing: 'FINAL_CUSTOMER' }); await after.showMethods();
    expect(after.element.textContent).toContain('demo-dep-7');
    expect(buttonNamed(after.element, T.confirm)).toBeDefined();
  });
});

describe('anInternalOrUnknownRoleIsNotOfferedTheConfirmation', () => {
  it('shows the selection read-only, with no confirm action', async () => {
    const p = await openConfirm({ standing: 'OTHER' }); await p.showMethods();
    expect(p.element.textContent).toContain('demo-dep-7');
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

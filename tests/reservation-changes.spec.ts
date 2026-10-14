import { readFileSync } from 'node:fs';
import { Injector, Provider, Type, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import {
  DemoCancellationQuote, DemoCancellationWriter, FixedClock, refundableAmount,
} from '../src/app/demo/reservation-changes-demo';
import {
  CancelCommand, CancellationOutcome, CancellationQuote, CancellationQuoteResult, CancellationWriter, cancellationChangeType,
} from '../src/app/reservation-changes/data/cancellation-ports';
import { RESERVATION_CHANGE_SCREEN, RESERVATION_CHANGE_TYPES } from '../src/app/reservation-changes/data/reservation-change-types';
import { ReservationChangeActionComponent } from '../src/app/reservation-changes/components/reservation-change-action.component';
import { ReservationChangeBlocksComponent } from '../src/app/reservation-changes/components/reservation-change-blocks.component';
import { RESERVATION_CHANGE_RETURN_DELAY, ReservationChangePageComponent } from '../src/app/reservation-changes/pages/reservation-change-page.component';
import { formatCop } from '../src/app/shared/format';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorContext } from '../src/app/shared/actor-context';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-013 (#179): cancel a reservation at the customer's request. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
const CONFIRMED = reservationOf('RES-A', { status: 'CONFIRMADA', seatHeld: true, validatedCents: 30_000_000, financialStatus: 'PARCIAL' });
const PENDING = reservationOf('RES-B');
const fixtures = () => new DemoReservationsStore([
  CONFIRMED, PENDING,
  reservationOf('RES-C', { status: 'EN_EJECUCION', seatHeld: true }), reservationOf('RES-D', { status: 'FINALIZADA', seatHeld: true }),
  reservationOf('RES-E', { status: 'CANCELADA' }), reservationOf('RES-F', { status: 'CONFIRMADA', seatHeld: true, reschedulingPending: true }),
]);
const demo = (store = fixtures(), penaltyPercent: number | null = null) => {
  const quotes = new DemoCancellationQuote(store, penaltyPercent);
  return { store, quotes, writer: new DemoCancellationWriter(store, quotes, new FixedClock(NOW), 'Colaborador operativo') };
};
const find = (store: DemoReservationsStore, id: string) => store.items.find((r) => r.id === id)!;

/** A writer that answers only when the test decides. */
class ControllableWriter extends CancellationWriter {
  readonly calls: { command: CancelCommand; reply: (o: CancellationOutcome) => void; fail: () => void }[] = [];
  override cancel(command: CancelCommand): Observable<CancellationOutcome> {
    const answers = new Subject<CancellationOutcome>();
    this.calls.push({ command, reply: (o) => { answers.next(o); answers.complete(); }, fail: () => answers.error(new Error('down')) });
    return answers;
  }
}
class ControllableQuote extends CancellationQuote {
  readonly requests: Subject<CancellationQuoteResult | null>[] = [];
  override quote(): Observable<CancellationQuoteResult | null> { const s = new Subject<CancellationQuoteResult | null>(); this.requests.push(s); return s; }
}

function providers(o: { role?: string; quotes?: CancellationQuote; writer?: CancellationWriter; code?: string; extra?: Provider[] } = {}) {
  const navigation = new PortalNavigation();
  navigation.register(['reservations', RESERVATION_CHANGE_SCREEN]);
  navigation.params.set({ reservation: o.code ?? 'RES-A' });
  const d = demo();
  return { navigation, list: [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'OPERATIONAL_COLLABORATOR') as never) },
    { provide: CancellationQuote, useValue: o.quotes ?? d.quotes },
    { provide: CancellationWriter, useValue: o.writer ?? d.writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
    { provide: RESERVATION_CHANGE_TYPES, multi: true, useFactory: cancellationChangeType },
    ...(o.extra ?? []),
  ] as Provider[] };
}

async function render<T>(component: Type<T>, list: Provider[], inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: list });
  const fixture = TestBed.createComponent(component);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const cause = () => host.querySelector<HTMLTextAreaElement>('textarea')!;
  const type = async (text: string) => { cause().value = text; cause().dispatchEvent(new Event('input')); await settle(); };
  const submit = async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  return { fixture, host, settle, button, cause, type, submit };
}
const page = (o: Parameters<typeof providers>[0] = {}) => { const p = providers(o); return render(ReservationChangePageComponent, p.list).then((s) => ({ ...s, ...p })); };

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('covers src/app/reservation-changes/ with no HTTP client, request or storage of its own', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/reservation-changes/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('cancelScreenShowsOneOfTheFourStates', () => {
  it('shows loading, error with a retry that asks again, empty when the reservation is unknown, and data', async () => {
    const quotes = new ControllableQuote();
    const s = await page({ quotes });
    expect(s.host.querySelector('h1')?.textContent).toBe('Cancelar o modificar reserva');
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    quotes.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    s.button('Reintentar')!.click(); await s.settle();
    expect(quotes.requests).toHaveLength(2);
    quotes.requests[1].next(null); await s.settle();
    expect(s.host.querySelector('[data-state="empty"]')?.textContent).toContain('No se encontró la reserva seleccionada.');
  });

  it('shows the data: Reserva, Cliente, Estado, Valores pagados y validados, Salida actual and Tratamiento económico read only', async () => {
    const s = await page();
    expect(s.host.querySelector('[data-state="data"]')).toBeTruthy();
    expect(Array.from(s.host.querySelectorAll<HTMLInputElement>('input[readonly]'), (i) => i.value)).toEqual([
      'RES-A', 'Lead Demo', 'Confirmada', '$300.000', 'Tour 1 · 07 nov 2026', 'Cancelación solicitada por el cliente: Pendiente de parametrización comercial.']);
  });
});

describe('tipoListsTheChangeTypesOfTheExtensionToken', () => {
  it('fills Tipo with every registered change type, Cancelación first', async () => {
    const other = { key: 'travelers', label: 'Modificación de viajeros', submit: () => of({ kind: 'registered' as const }) };
    const s = await page({ extra: [{ provide: RESERVATION_CHANGE_TYPES, multi: true, useValue: other }] });
    expect(Array.from(s.host.querySelectorAll('#crp-rc-type option'), (o) => o.textContent?.trim())).toEqual(['Cancelación', 'Modificación de viajeros']);
  });

  // HU-COM-012 AC-MD.9 (DP-MD5): a type that cannot be registered yet keeps "Registrar novedad" disabled and sends nothing.
  it('keeps Registrar novedad disabled for a type that is not submittable, and sends nothing', async () => {
    let sent = 0;
    const other = { key: 'travelers', label: 'Modificación de viajeros', submittable: false, submit: () => { sent += 1; return of({ kind: 'registered' as const }); } };
    const s = await page({ extra: [{ provide: RESERVATION_CHANGE_TYPES, multi: true, useValue: other }] });
    const select = s.host.querySelector('select')!;
    select.value = 'travelers'; select.dispatchEvent(new Event('change')); await s.settle();
    await s.type('El cliente cambia de acompañante');
    expect(s.button('Registrar novedad')?.disabled).toBe(true);
    await s.submit();
    expect(sent).toBe(0);
  });
});

describe('cancelActionOnlyForPendingOrConfirmed', () => {
  it('answers allowed only for Pendiente de pago and Confirmada', async () => {
    const { quotes } = demo();
    const answers = await Promise.all(['RES-A', 'RES-B', 'RES-C', 'RES-D', 'RES-E'].map((id) => firstValueFrom(quotes.quote(id))));
    expect(answers.map((a) => a?.eligibility)).toEqual(['allowed', 'allowed', 'in-execution', 'terminal', 'terminal']);
  });

  it('draws "Cancelar o modificar reserva" in the 10A header only for those states', async () => {
    const shown: Record<string, boolean> = {};
    for (const r of fixtures().items.slice(0, 5)) {
      const s = await render(ReservationChangeActionComponent, providers().list, { reservation: r });
      shown[r.id] = !!s.button('Cancelar o modificar reserva');
      TestBed.resetTestingModule();
    }
    expect(shown).toEqual({ 'RES-A': true, 'RES-B': true, 'RES-C': false, 'RES-D': false, 'RES-E': false });
  });
});

describe('cancelScreenOpenedOnATerminalReservationIsDisabled', () => {
  it.each([['RES-D', 'Finalizada'], ['RES-E', 'Cancelada'], ['RES-C', 'En ejecución']])('%s shows why and disables the form', async (code, label) => {
    const s = await page({ code });
    expect(s.host.querySelector('form [role="alert"]')?.textContent?.trim())
      .toBe(`Esta reserva está en estado "${label}" y ya no admite cancelación o modificación.`);
    expect(s.cause().disabled).toBe(true);
    expect(s.button('Registrar novedad')!.disabled).toBe(true);
  });
});

describe('registeredCancellationLeavesTheReservationCancelada', () => {
  it('turns the reservation Cancelada with its cause, user and instant, and the quote then answers terminal', async () => {
    const { store, quotes, writer } = demo();
    const outcome = await firstValueFrom(writer.cancel({ code: 'RES-B', cause: 'El cliente desiste del viaje', origin: 'customer', idempotencyKey: 'k1' }));
    expect(outcome.kind).toBe('registered');
    expect(find(store, 'RES-B').status).toBe('CANCELADA');
    expect(find(store, 'RES-B').cancellation).toEqual({ cause: 'El cliente desiste del viaje', by: 'Colaborador operativo', at: NOW, origin: 'customer' });
    expect((await firstValueFrom(quotes.quote('RES-B')))?.eligibility).toBe('terminal');
  });

  it('opens 10A after "Registrar novedad" with the reservation, once the pause ends', async () => {
    const gate = new Subject<void>();
    const s = await page({ code: 'RES-B', extra: [{ provide: RESERVATION_CHANGE_RETURN_DELAY, useValue: () => gate }] });
    await s.type('El cliente desiste del viaje'); await s.submit();
    expect(s.navigation.selected()).toBeUndefined();
    gate.next(); await s.settle();
    expect(s.navigation.selected()).toBe('reservations');
    expect(s.navigation.params()).toEqual({ reservation: 'RES-B' });
  });
});

// app.js setupOperatorCancelModifyReservation: the feedback line shows the registered text, the form is
// disabled, and the page returns to 10A after 1400 ms.
describe('registeredCancellationShowsTheMockupMessageBeforeReturningTo10A', () => {
  const pause = () => { const gate = new Subject<void>(); return { gate, extra: [{ provide: RESERVATION_CHANGE_RETURN_DELAY, useValue: () => gate }] }; };
  const status = (host: HTMLElement) => host.querySelector('.crp-reservation-changes-feedback[role="status"]')?.textContent?.trim();

  it('shows the pending refund message when payments were validated, with the form disabled', async () => {
    const { extra } = pause();
    const s = await page({ code: 'RES-A', extra });
    await s.type('Viaje aplazado'); await s.submit();
    expect(status(s.host)).toBe('Cancelación registrada. El valor a devolver queda pendiente de cálculo según la condición comercial parametrizada; podrás gestionarlo desde el detalle de la reserva.');
    expect(s.cause().disabled).toBe(true);
    expect(s.button('Registrar novedad')!.disabled).toBe(true);
    expect(s.navigation.selected()).toBeUndefined();
  });

  it('shows the no payments message when nothing was paid, then opens 10A', async () => {
    const { gate, extra } = pause();
    const s = await page({ code: 'RES-B', extra });
    await s.type('El cliente desiste del viaje'); await s.submit();
    expect(status(s.host)).toBe('Cancelación registrada: no hay valores pagados y validados que devolver, por lo que no se genera solicitud de devolución y la cancelación queda como cierre definitivo. El cupo se liberó.');
    gate.next(); await s.settle();
    expect(s.navigation.params()).toEqual({ reservation: 'RES-B' });
  });

  it('shows the mockup invitation while nothing is registered', async () => {
    const s = await page({ code: 'RES-B' });
    expect(status(s.host)).toBe('Completa el tipo y la causal para registrar la novedad.');
  });

  it('waits 1800 ms by default, as app.js does', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const done = vi.fn();
      TestBed.runInInjectionContext(() => inject(RESERVATION_CHANGE_RETURN_DELAY))().subscribe(done);
      vi.advanceTimersByTime(1799);
      expect(done).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(done).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('cancellationReleasesTheHeldSeat', () => {
  it('releases the seat held by the first payment', async () => {
    const { store, writer } = demo();
    await firstValueFrom(writer.cancel({ code: 'RES-A', cause: 'Viaje aplazado', origin: 'customer', idempotencyKey: 'k1' }));
    expect(find(store, 'RES-A').seatHeld).toBe(false);
  });
});

describe('emptyCauseIsShownBesideItsFieldAndNothingIsSent', () => {
  it('marks Causal, writes the error beside it, focuses it and calls no writer', async () => {
    const writer = new ControllableWriter();
    const s = await page({ writer });
    document.body.append(s.host);
    await s.type('   '); await s.submit();
    const error = s.host.querySelector('textarea + [role="alert"]')!;
    expect(error.textContent?.trim()).toBe('Completa el tipo y la causal de la cancelación o modificación.');
    expect(s.cause().getAttribute('aria-invalid')).toBe('true');
    expect(s.cause().getAttribute('aria-describedby')).toBe(error.id);
    expect(document.activeElement).toBe(s.cause());
    expect(writer.calls).toHaveLength(0);
    s.host.remove();
  });
});

describe('aRetriedCancellationReusesItsIdempotencyKey', () => {
  it('sends the same key after a failure, and disables the button while pending', async () => {
    const writer = new ControllableWriter();
    const s = await page({ writer });
    await s.type('Viaje aplazado'); await s.submit();
    expect(s.button('Registrar novedad')!.disabled).toBe(true);
    await s.submit();
    expect(writer.calls).toHaveLength(1);
    writer.calls[0].fail(); await s.settle();
    expect(s.host.querySelector('form [role="alert"]')?.textContent).toContain('No se pudo completar la solicitud.');
    await s.submit();
    expect(writer.calls.map((c) => c.command.idempotencyKey)).toEqual(['test-key-0000', 'test-key-0000']);
  });
});

describe('aClickAfterSuccessCreatesNoSecondCancellation', () => {
  it('answers the first outcome for a repeated key and refuses a new key, leaving one cancellation', async () => {
    const { store, writer } = demo();
    const first = await firstValueFrom(writer.cancel({ code: 'RES-A', cause: 'Primera', origin: 'customer', idempotencyKey: 'k1' }));
    const again = await firstValueFrom(writer.cancel({ code: 'RES-A', cause: 'Primera', origin: 'customer', idempotencyKey: 'k1' }));
    const other = await firstValueFrom(writer.cancel({ code: 'RES-A', cause: 'Segunda', origin: 'customer', idempotencyKey: 'k2' }));
    expect(again).toBe(first);
    expect(other).toMatchObject({ kind: 'refused', eligibility: 'terminal' });
    expect(find(store, 'RES-A').cancellation?.cause).toBe('Primera');
  });
});

describe('refundableIsValidatedMinusPenaltyPdrExample', () => {
  it('gives $150.000 for $300.000 validated and a 50 % penalty (PDR example, test data only)', () => {
    const r = refundableAmount([{ amountCents: 30_000_000, validated: true }], 50);
    expect(r).toEqual({ kind: 'amount', cents: 15_000_000, penaltyCents: 15_000_000 });
    expect(formatCop(15_000_000)).toBe('$150.000');
  });
});

describe('paymentsPendingValidationDoNotCount', () => {
  it('ignores a payment En validación and answers no-payments when none is validated', () => {
    expect(refundableAmount([{ amountCents: 30_000_000, validated: true }, { amountCents: 10_000_000, validated: false }], 50))
      .toEqual({ kind: 'amount', cents: 15_000_000, penaltyCents: 15_000_000 });
    expect(refundableAmount([{ amountCents: 10_000_000, validated: false }], 50)).toEqual({ kind: 'no-payments' });
    expect(refundableAmount([{ amountCents: 30_000_000, validated: true }], null)).toEqual({ kind: 'pending-policy' });
  });

  it('shows on the screen what the port answers: pending policy, or no payments', async () => {
    const withPayments = await page({ code: 'RES-A' });
    expect(withPayments.host.querySelector<HTMLInputElement>('#crp-rc-treatment')!.value).toContain('Pendiente de parametrización comercial');
    TestBed.resetTestingModule();
    const without = await page({ code: 'RES-B' });
    expect(without.host.querySelector<HTMLInputElement>('#crp-rc-treatment')!.value).toContain('No aplica: no hay valores pagados y validados en esta reserva; la cancelación es definitiva y no deja valores por tratar.');
  });
});

describe('refundableAboveZeroOpensTheCustomerCancellationDecision', () => {
  it('opens one decision at the clock instant when something is refundable, none otherwise', async () => {
    const { store, writer } = demo();
    await firstValueFrom(writer.cancel({ code: 'RES-A', cause: 'Viaje aplazado', origin: 'customer', idempotencyKey: 'k1' }));
    await firstValueFrom(writer.cancel({ code: 'RES-B', cause: 'Viaje aplazado', origin: 'customer', idempotencyKey: 'k2' }));
    expect(find(store, 'RES-A').financialDecision).toEqual({
      kind: 'CUSTOMER_CANCELLATION', baseAmountCents: 30_000_000, penaltyAmountCents: null, refundableCents: null, recognizedAt: NOW, outcome: null,
    });
    expect(find(store, 'RES-B').financialDecision).toBeUndefined();
    const full = demo(fixtures(), 100);
    await firstValueFrom(full.writer.cancel({ code: 'RES-A', cause: 'Viaje aplazado', origin: 'customer', idempotencyKey: 'k3' }));
    expect(find(full.store, 'RES-A').financialDecision).toBeUndefined();
  });
});

describe('reservationPendingReschedulingAnswerIsNotCancelled', () => {
  it('refuses with the text, disables the form and leaves the reservation unchanged', async () => {
    const s = await page({ code: 'RES-F' });
    expect(s.host.querySelector('form [role="alert"]')?.textContent?.trim())
      .toBe('Esta reserva tiene una propuesta de reprogramación pendiente de respuesta: el cliente debe rechazarla.');
    expect(s.button('Registrar novedad')!.disabled).toBe(true);
    const { store, writer } = demo();
    const outcome = await firstValueFrom(writer.cancel({ code: 'RES-F', cause: 'x', origin: 'customer', idempotencyKey: 'k1' }));
    expect(outcome).toMatchObject({ kind: 'refused', eligibility: 'rescheduling-pending' });
    expect(find(store, 'RES-F').status).toBe('CONFIRMADA');
    expect(find(store, 'RES-F').cancellation).toBeUndefined();
  });
});

describe('customerAreaHasNoCancelAction', () => {
  it('finds no change type, cancellation port or cancel screen in the customer area', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/self-service-reservation/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /reservation-changes|CancellationWriter|RESERVATION_CHANGE/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('readOnlyRolesGetNoCancelActionNorRefundLink', () => {
  const area = PORTAL_AREAS.find((a) => a.key === RESERVATION_CHANGE_SCREEN)!;
  const injectorAs = (role: string) => Injector.create({ providers: [
    { provide: PortalCapabilities, useValue: PortalCapabilities.for(role) }, { provide: ReservationsSource, useValue: fixtures() },
    { provide: CancellationQuote, useValue: demo().quotes }, { provide: CancellationWriter, useValue: demo().writer },
  ] });

  it('gives the change permission only to the Administrator and the Collaborator', () => {
    const roles = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'SOMEONE'];
    expect(roles.map((r) => PortalCapabilities.for(r).canRegisterChange())).toEqual([true, true, false, false, false, false, false]);
  });

  it('registers the screen as a sub-screen of Reservas that refuses the read-only roles', () => {
    expect(area).toMatchObject({ menu: false, parent: 'reservations', label: 'Cancelar o modificar reserva' });
    expect(['TENANT_ADMINISTRATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'SOMEONE'].map((r) => area.isAvailable!(injectorAs(r))))
      .toEqual([true, false, false, false, false]);
  });

  it.each(['MANAGER', 'ACCOUNTANT', 'ANALYST', 'SOMEONE'])('%s sees 10A without the button', async (role) => {
    const s = await render(ReservationChangeActionComponent, providers({ role }).list, { reservation: CONFIRMED });
    expect(s.host.querySelectorAll('button')).toHaveLength(0);
  });

  it('draws no "Gestionar devolución", refund or credit balance action in this feature', () => {
    // The copy file holds the mockup's registered messages, which only mention those words; no template or code draws an action.
    const code = listSourceFiles().filter((f) => f.startsWith('src/app/reservation-changes/') && !f.endsWith('reservation-changes-copy.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(code).not.toMatch(/Gestionar devolución|Autorizar|saldo a favor/i);
  });
});

describe('cancellationCopyIsSpanishWithoutRawCodesAndFormatted', () => {
  const cancelled = (over: Partial<Reservation>) => reservationOf('RES-A', { status: 'CANCELADA', cancellation: { cause: 'Viaje aplazado', by: 'Colaborador operativo', at: NOW }, ...over });
  const blocks = (r: Reservation) => render(ReservationChangeBlocksComponent, providers().list, { reservation: r });
  const words = (host: HTMLElement) => Array.from(host.querySelectorAll('p, h2, dt, dd'), (e) => e.textContent?.trim()).join(' ');

  it('shows "Historial · Cancelación registrada" with Causal and the date when nothing is refundable', async () => {
    const s = await blocks(cancelled({}));
    const text = words(s.host);
    expect(text).toContain('Historial Cancelación registrada Causal Viaje aplazado Fecha de registro 13 oct 2026');
    expect(text).not.toMatch(/CANCELADA|CUSTOMER_CANCELLATION|null|undefined/);
  });

  it('shows the decision block with "Valor potencial a devolver", pending or formatted', async () => {
    const decision = { kind: 'CUSTOMER_CANCELLATION' as const, baseAmountCents: 30_000_000, penaltyAmountCents: null, refundableCents: null, recognizedAt: NOW, outcome: null };
    const pending = await blocks(cancelled({ financialDecision: decision }));
    const text = words(pending.host);
    expect(text).toContain('Cancelación o modificación registrada Devolución pendiente de gestionar');
    expect(text).toContain('Causal Viaje aplazado Valor potencial a devolver Pendiente de parametrización comercial');
    expect(text).not.toContain('Historial');
    TestBed.resetTestingModule();
    const amount = await blocks(cancelled({ financialDecision: { ...decision, penaltyAmountCents: 15_000_000, refundableCents: 15_000_000 } }));
    expect(amount.host.textContent).toContain('$150.000');
  });

  it('draws nothing on 10C or for a reservation never cancelled', async () => {
    const fresh = await render(ReservationChangeBlocksComponent, providers().list, { reservation: cancelled({}), fresh: true });
    expect(fresh.host.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    const plain = await blocks(CONFIRMED);
    expect(plain.host.textContent?.trim()).toBe('');
  });
});


describe('wiresTheScreenAndTheBlocksInTheDemoBuild', () => {
  let host: HTMLElement;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); cleanup = undefined; host?.remove(); });
  const click = (selector: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();

  it('opens the screen from 10A, registers the cancellation and shows it in the shared store', async () => {
    host = document.createElement('div');
    document.body.append(host);
    cleanup = entry.mountWith(host, { apiClient: { request: vi.fn() } as never, session: { roles: ['OPERATIONAL_COLLABORATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
    const row = Array.from(host.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes('#RES-1839'))!;
    row.querySelector('button')!.click();
    await vi.waitFor(() => expect(host.querySelector('header')?.textContent).toContain('Cancelar o modificar reserva'));
    click('header button', 'Cancelar o modificar reserva');
    await vi.waitFor(() => expect(host.querySelector('textarea')).toBeTruthy());
    expect(host.querySelector('.crp-operator-nav .crp-is-active')?.textContent?.trim()).toBe('Reservas');
    const cause = host.querySelector('textarea')!;
    cause.value = 'El cliente desiste del viaje'; cause.dispatchEvent(new Event('input'));
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(host.querySelector('.crp-reservation-changes-feedback[role="status"]')?.textContent).toContain('Cancelación registrada.'));
    await vi.waitFor(() => expect(host.querySelector('app-reservations-page .crp-reservations-detail')).toBeTruthy(), { timeout: 4000 });
    const detail = host.querySelector('app-reservations-page')!;
    expect(detail.querySelector('h1')?.textContent).toBe('Detalle de reserva');
    expect(detail.querySelector('.crp-reservations-hero')?.textContent).toContain('#RES-1839');
    expect(detail.querySelector('.crp-reservations-hero .crp-operator-status')?.textContent?.trim()).toBe('Cancelada');
    expect(detail.textContent).toContain('Devolución pendiente de gestionar');
    expect(detail.querySelector('header')?.textContent).not.toContain('Cancelar o modificar reserva');
  });
});

describe('theChangeScreenReturnsTo10AOfItsReservation', () => {
  it.each(['Volver a la reserva', 'Volver'])('%s opens Reservas with { reservation } (base F-D4 reopens 10A)', async (label) => {
    const s = await page({ code: 'RES-B' });
    s.button(label)!.click(); await s.settle();
    expect(s.navigation.selected()).toBe('reservations');
    expect(s.navigation.params()).toEqual({ reservation: 'RES-B' });
  });
});

// HU-COM-013 / v1.9: admin-cancelar-modificar-reserva.html of the current mockup ("Cancelar o modificar reserva").
describe('cancelScreenFollowsTheCurrentMockupStructure', () => {
  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector), (e) => e.textContent?.trim());

  it('writes the header eyebrow, the access note and the two numbered panels of the mockup', async () => {
    const s = await page({ code: 'RES-A' });
    expect(s.host.querySelector('.crp-page-header-eyebrow')?.textContent?.trim()).toBe('RF-003A · RF-021 · Gestión de reserva');
    expect(s.host.querySelector('.crp-access-note')?.textContent?.trim()).toBe('Cada reserva contiene un único tour asociado a una única salida. El cliente no cancela ni modifica por autogestión: la novedad la registra el Colaborador operativo o el Administrador del tenant, con causal y trazabilidad. Cancelada es un estado terminal.');
    expect(texts(s.host, '.crp-operator-panel > .crp-operator-eyebrow')).toEqual(['01. Reserva', '02. Novedad']);
    expect(texts(s.host, '.crp-operator-panel > h2')).toEqual(['Contexto', 'Tipo, origen y causal']);
    expect(texts(s.host, 'label')).toEqual(['Reserva', 'Cliente', 'Estado', 'Valores pagados y validados', 'Salida actual', 'Tipo de novedad', 'Origen de la cancelación', 'Causal (obligatoria)', 'Tratamiento económico']);
    expect(s.host.querySelector('textarea')?.getAttribute('placeholder')).toBe('Describe la causal de la cancelación o modificación');
    expect(texts(s.host, '.crp-form-actions button')).toEqual(['Volver', 'Registrar novedad']);
    expect(s.host.textContent).not.toContain('Devolución');
  });

  it('lists the three origins of the cancellation with the mockup wording, the customer first', async () => {
    const s = await page({ code: 'RES-A' });
    expect(texts(s.host, '#crp-rc-origin option')).toEqual([
      'Solicitada por el cliente (aplica la penalidad vigente)',
      'Causa no atribuible al cliente (devolución del 100 %)',
      'Incumplimiento del pago (valores abonados en tratamiento pendiente)']);
  });

  it('hides the origin for a type that is not a cancellation', async () => {
    const other = { key: 'travelers', label: 'Modificación de servicio, salida o viajeros', showsRefundable: false, submit: () => of({ kind: 'registered' as const }) };
    const s = await page({ extra: [{ provide: RESERVATION_CHANGE_TYPES, multi: true, useValue: other }] });
    const type = s.host.querySelector<HTMLSelectElement>('#crp-rc-type')!;
    type.value = 'travelers'; type.dispatchEvent(new Event('change')); await s.settle();
    expect(s.host.querySelector('#crp-rc-origin')).toBeNull();
  });
});

describe('economicTreatmentFollowsTheOriginOfTheCancellation', () => {
  const treatment = (host: HTMLElement) => host.querySelector<HTMLInputElement>('#crp-rc-treatment')!.value;
  const choose = async (s: { host: HTMLElement; settle: () => Promise<void> }, origin: string) => {
    const select = s.host.querySelector<HTMLSelectElement>('#crp-rc-origin')!;
    select.value = origin; select.dispatchEvent(new Event('change')); await s.settle();
  };

  it('writes 100 % of the validated values for a cause not attributable to the customer and for non-payment', async () => {
    const s = await page({ code: 'RES-A' });
    await choose(s, 'not-attributable');
    expect(treatment(s.host)).toBe('Causa no atribuible al cliente: devolución del 100 % de $300.000 pagados y validados.');
    await choose(s, 'non-payment');
    expect(treatment(s.host)).toBe('Cancelación por incumplimiento del pago: devolución del 100 % de $300.000 pagados y validados.');
    await choose(s, 'customer');
    expect(treatment(s.host)).toBe('Cancelación solicitada por el cliente: Pendiente de parametrización comercial.');
  });

  it('writes the validated values minus the penalty of the port for the customer (PDR example, test data only)', async () => {
    const d = demo(fixtures(), 50);
    const s = await page({ code: 'RES-A', quotes: d.quotes, writer: d.writer });
    expect(treatment(s.host)).toBe('Cancelación solicitada por el cliente: $300.000 pagados y validados menos penalidad de $150.000 = $150.000 reembolsables.');
  });

  it('writes the no-payments text whatever the origin when nothing was validated', async () => {
    const s = await page({ code: 'RES-B' });
    await choose(s, 'not-attributable');
    expect(treatment(s.host)).toBe('No aplica: no hay valores pagados y validados en esta reserva; la cancelación es definitiva y no deja valores por tratar.');
  });

  it('sends the chosen origin with the cause and keeps it in the cancellation of the store', async () => {
    const writer = new ControllableWriter();
    const s = await page({ code: 'RES-A', writer });
    await choose(s, 'not-attributable');
    await s.type('Salida suspendida por lluvias'); await s.submit();
    expect(writer.calls[0].command).toMatchObject({ code: 'RES-A', cause: 'Salida suspendida por lluvias', origin: 'not-attributable' });
    TestBed.resetTestingModule();
    const d = demo();
    await firstValueFrom(d.writer.cancel({ code: 'RES-A', cause: 'Lluvias', origin: 'not-attributable', idempotencyKey: 'k1' }));
    expect(find(d.store, 'RES-A').cancellation).toMatchObject({ cause: 'Lluvias', origin: 'not-attributable' });
  });
});

describe('registeredCancellationMessageFollowsTheDeterminedValue', () => {
  const pause = () => ({ extra: [{ provide: RESERVATION_CHANGE_RETURN_DELAY, useValue: () => new Subject<void>() }] as Provider[] });
  const status = (host: HTMLElement) => host.querySelector('.crp-reservation-changes-feedback[role="status"]')?.textContent?.trim();

  it('names the determined value and the 24-hour decision when the port answers an amount', async () => {
    const d = demo(fixtures(), 50);
    const s = await page({ code: 'RES-A', quotes: d.quotes, writer: d.writer, ...pause() });
    await s.type('Viaje aplazado'); await s.submit();
    expect(status(s.host)).toBe('Cancelación registrada. Valor a devolver determinado: $150.000. El Administrador del tenant decide en 24 horas corridas (devolución del 100 % por defecto o saldo a favor); la devolución se ejecuta en máximo 5 días hábiles. Continúa desde el detalle de la reserva con Gestionar devolución.');
  });

  it('names the 100 % and the automatic authorization for a cause not attributable to the customer', async () => {
    const s = await page({ code: 'RES-A', ...pause() });
    const select = s.host.querySelector<HTMLSelectElement>('#crp-rc-origin')!;
    select.value = 'not-attributable'; select.dispatchEvent(new Event('change')); await s.settle();
    await s.type('Salida suspendida por lluvias'); await s.submit();
    expect(status(s.host)).toBe('Cancelación registrada. Valor a devolver: $300.000 (100 %, causa no atribuible al cliente), determinado y autorizado automáticamente; se ejecuta en máximo 5 días hábiles desde Solicitudes de devolución.');
  });
});

describe('aCorrectedCancellationAfterARefusalTravelsWithANewIdempotencyKey', () => {
  it('changes the key when the cause is corrected', async () => {
    const writer = new ControllableWriter();
    const s = await page({ writer });
    await s.type('Viaje aplazado'); await s.submit();
    writer.calls[0].fail(); await s.settle();
    await s.type('El cliente desiste'); await s.submit();
    const [first, second] = writer.calls.map((c) => c.command.idempotencyKey);
    expect(second).not.toBe(first);
  });
});

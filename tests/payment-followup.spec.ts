import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { NEVER, Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { DemoPaymentDeadlines, DemoPendingPayments, paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { DemoReservationsStore, reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods, selfServiceDemoProviders } from '../src/app/demo/self-service-reservation-demo';
import { PROOF_REVIEW_CONTRIBUTIONS } from '../src/app/payments/components/proof-review-actions.component';
import { PaymentDeadlineLineComponent } from '../src/app/payments/components/payment-deadline-line.component';
import { PAYMENT_FOLLOWUP_CONTRIBUTIONS, PendingPaymentRowsComponent } from '../src/app/payments/components/pending-payment-rows.component';
import {
  PaymentDeadlineReader, PaymentFollowupsWriter, PendingPaymentsSource, RegisterFollowupCommand,
} from '../src/app/payments/data/payment-followup-ports';
import { ProofReviewWriter } from '../src/app/payments/data/proof-review-ports';
import { PaymentFollowupPageComponent } from '../src/app/payments/pages/payment-followup-page.component';
import { PaymentsPageComponent } from '../src/app/payments/pages/payments-page.component';
import { TransferPaymentPageComponent } from '../src/app/payments/pages/transfer-payment-page.component';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { CustomerContext, customerContextFor } from '../src/app/self-service-reservation/data/customer-context';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { CHECKOUT_BLOCKS, PAYMENTS_TABLE_BODIES, PortalSlot, TRANSFER_PAYMENT_LINES } from '../src/app/shared/portal-slots';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-011 (spec 011-, tasks T-01 to T-06): the rows "Saldo pendiente" of 13, the sub-screen admin-registrar-seguimiento.html
// and the deadline sentence of 21 and 24, over the one reservations store of HU-COM-007.
// Seeded pending payment without a proof: RES-1842 (Laura Gómez, Pago total · Transferencia, $850.000, departure 07 nov 2026,
// deadline 16 oct 2026 09:00) and RES-1841 (Mateo Ríos, Abono · Efectivo, $418.000, departure 14 nov 2026, deadline 15 oct 2026
// 09:00 with a seeded extension to 18 oct 2026 09:00). RES-1833 and RES-1834 carry a proof En validación (HU-COM-010).
const TOTAL = 'RES-1842';
const EXTENDED = 'RES-1841';
const NOW = Date.parse('2026-10-13T09:00:00-05:00');
const FILES = ['src/app/payments/data/payment-followup-ports.ts', 'src/app/payments/payment-followup-copy.ts',
  'src/app/payments/components/pending-payment-rows.component.ts', 'src/app/payments/components/payment-deadline-line.component.ts',
  'src/app/payments/pages/payment-followup-page.component.ts', 'src/app/demo/payment-followup-demo.ts'];

class FixedClock extends Clock {
  constructor(public at = NOW) { super(); }
  override now(): number { return this.at; }
}
const actor = (role: string): ActorContext => new (class extends ActorContext { override readonly role = role as never; })();
function navigationWith(params: Record<string, string> = {}) {
  const navigation = new PortalNavigation();
  navigation.register(['payments', 'payments-followup', 'payments-validate']);
  navigation.params.set(params);
  return navigation;
}
type Setup = { role?: string; params?: Record<string, string>; clock?: Clock; keys?: IdempotencyKeys; extra?: unknown[] };
function providers({ role = 'TENANT_ADMINISTRATOR', params = {}, clock = new FixedClock(), keys = new ControllableIdempotencyKeys(), extra = [] }: Setup = {}) {
  return [
    { provide: ActorContext, useValue: actor(role) },
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: Clock, useValue: clock },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: PortalNavigation, useValue: navigationWith(params) },
    ...PAYMENT_FOLLOWUP_CONTRIBUTIONS,
    ...extra,
  ];
}
const store = () => TestBed.inject(ReservationsSource) as DemoReservationsStore;
const stored = async (id: string) => (await firstValueFrom(store().list())).find((r) => r.id === id)!;
const change = (id: string, over: Partial<Reservation>) => { store().items = store().items.map((r) => (r.id === id ? { ...r, ...over } : r)); };
const flat = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
/** A table row as its cells read, one space between cells. */
const cells = (row: Element) => Array.from(row.querySelectorAll('td')).map(flat).join(' ');
const following = (id = TOTAL, setup: Setup = {}) => screenOf(PaymentFollowupPageComponent, providers({ ...setup, params: { reservation: id } }));
const register = (c: RegisterFollowupCommand, key = 'k-1') => firstValueFrom(TestBed.inject(PaymentFollowupsWriter).register(c, key));
const deadline = (id: string) => firstValueFrom(TestBed.inject(PaymentDeadlineReader).deadlineOf(id));
const entriesOf = (contributions: readonly unknown[], slot: unknown) =>
  (contributions as { provide: unknown; useValue: PortalSlot }[]).filter((p) => p.provide === slot).map((p) => p.useValue);

/** A writer whose answers the test releases, so a second click lands while the first follow-up is pending. */
class HeldWriter extends PaymentFollowupsWriter {
  readonly calls: [RegisterFollowupCommand, string][] = [];
  readonly answers: Subject<Reservation>[] = [];
  override register(c: RegisterFollowupCommand, key: string): Observable<Reservation> {
    this.calls.push([c, key]); this.answers.push(new Subject<Reservation>()); return this.answers.at(-1)!;
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('the frame: area, ports, four states and texts (T-01)', () => {
  it('registers Registrar seguimiento as a sub-screen of Pagos, only for who may follow up and only with its ports', () => {
    const area = PORTAL_AREAS.find((a) => a.key === 'payments-followup')!;
    expect(area).toMatchObject({ label: 'Registrar seguimiento', component: PaymentFollowupPageComponent, menu: false, parent: 'payments' });
    TestBed.configureTestingModule({ providers: providers() });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: providers({ role: 'ANALYST' }) });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actor('TENANT_ADMINISTRATOR') }] });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(false);
  });

  it('theFollowupFilesDeclareNoHttpClientOfItsOwn', () => {
    for (const file of FILES) expect(readFileSync(file, 'utf8')).not.toMatch(/HttpClient|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  });

  it('everyFollowupScreenShowsOneOfTheFourStates', async () => {
    const answering = (answer: () => Observable<readonly Reservation[]>) => new (class extends ReservationsSource { calls = 0; override list() { this.calls++; return answer(); } })();
    const pageWith = (source: ReservationsSource) => { TestBed.resetTestingModule(); return following(TOTAL, { extra: [{ provide: ReservationsSource, useValue: source }] }); };
    expect((await pageWith(answering(() => NEVER))).element.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando…');
    const failing = answering(() => throwError(() => new Error('down')));
    const failed = await pageWith(failing);
    expect(failed.element.querySelector('[role="alert"][data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    await failed.click('Reintentar');
    expect(failing.calls).toBe(2);
    TestBed.resetTestingModule();
    expect((await following('RES-1999')).element.querySelector('[data-state="empty"]')?.textContent?.trim())
      .toBe('No se encontró el pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Registrar seguimiento.');
    TestBed.resetTestingModule();
    const { element } = await following();
    expect(element.querySelector('form[data-state="data"]')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Registrar seguimiento');
  });

  it('followupTextsAreSpanishWithFormattedMoneyAndNoRawCodes', async () => {
    const { element } = await following();
    const text = flat(element);
    for (const fixed of ['Control de cobro', '01. Contexto del pago', 'Estado actual de la reserva', '02. Seguimiento', 'Registrar contacto', 'Nota de seguimiento (obligatoria)',
      'Registra la nota de seguimiento para dejar constancia del contacto con el cliente.', 'Volver a pagos', 'Trazabilidad', 'Historial de seguimientos',
      'Aún no se han registrado seguimientos para esta reserva.']) expect(text).toContain(fixed);
    const value = (label: string) => {
      const field = Array.from(element.querySelectorAll('label')).find((l) => l.textContent?.trim() === label)!;
      return element.querySelector<HTMLInputElement>(`#${field.htmlFor}`)!.value;
    };
    expect(['Reserva', 'Cliente', 'Modalidad de pago', 'Valor recibido', 'Saldo pendiente', 'Estado actual', 'Plazo/límite vigente'].map(value))
      .toEqual(['#RES-1842', 'Laura Gómez (demo)', 'Pago total · Transferencia', '$0', '$850.000', 'Sin pago', '16 oct 2026 · 09:00']);
    expect(element.querySelector('textarea')?.getAttribute('placeholder')).toBe('Describe el contacto realizado con el cliente y el resultado');
    expect(Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Fecha', 'Hora', 'Actor', 'Nota']);
    expect(text).not.toMatch(/PENDIENTE_DE_PAGO|SIN_PAGO|BANK_TRANSFER|TOTAL\b|undefined|null|NaN/);
  });
});

describe('the effective deadline (T-02, T-04)', () => {
  it('effectiveDeadlineIsTheLowerOfDeadlineAndDepartureStart', async () => {
    const clock = new FixedClock();
    TestBed.configureTestingModule({ providers: providers({ clock }) });
    expect(await deadline(TOTAL)).toEqual({ dueAt: '2026-10-16T09:00:00-05:00', departureStartsAt: '2026-11-07T00:00:00-05:00' });
    // RES-1839 has no seeded deadline: the demo fixes 72 hours (DP-PP1) the first time; its departure starts on 14 nov 2026.
    clock.at = Date.parse('2026-11-12T09:00:00-05:00');
    expect(await deadline('RES-1839')).toEqual({ dueAt: '2026-11-14T00:00:00-05:00', departureStartsAt: '2026-11-14T00:00:00-05:00' });
    expect((await stored('RES-1839')).deadline).toEqual({ dueAt: '2026-11-15T09:00:00-05:00' });
    clock.at = NOW;
    expect((await deadline('RES-1839'))?.dueAt).toBe('2026-11-14T00:00:00-05:00');
    expect(await deadline('RES-1999')).toBeNull();
    expect(DemoPaymentDeadlines.prototype).toBeInstanceOf(PaymentDeadlineReader);
  });

  it('aSeededExtensionIsReflectedInTheEffectiveDeadline', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    expect((await deadline(EXTENDED))?.dueAt).toBe('2026-10-18T09:00:00-05:00');
    change(EXTENDED, { deadline: { dueAt: '2026-10-15T09:00:00-05:00', extendedUntil: '2026-11-20T09:00:00-05:00' } });
    expect((await deadline(EXTENDED))?.dueAt).toBe('2026-11-14T00:00:00-05:00');
  });

  it('customerSeesTheEffectiveDeadlineOfOwnReservationOn21And24', async () => {
    const lines = entriesOf(PAYMENT_FOLLOWUP_CONTRIBUTIONS, TRANSFER_PAYMENT_LINES), blocks = entriesOf(PAYMENT_FOLLOWUP_CONTRIBUTIONS, CHECKOUT_BLOCKS);
    expect(lines.map((e) => [e.component, e.order])).toEqual([[PaymentDeadlineLineComponent, 10]]);
    expect(blocks.map((e) => [e.component, e.order])).toEqual([[PaymentDeadlineLineComponent, 20]]);
    const view = await screenOf(TransferPaymentPageComponent, [...providers({ role: 'READ_ONLY', params: { reservation: TOTAL, type: 'TOTAL', amount: '85000000' } }),
      ...selfServiceDemoProviders(), ...PROOF_REVIEW_CONTRIBUTIONS, { provide: CustomerContext, useValue: customerContextFor(['FINAL_CUSTOMER'], () => undefined) }]);
    const sentences = Array.from(view.element.querySelectorAll('.crp-transfer-proof p')).map(flat);
    expect(sentences.slice(-2)).toEqual(['Plazo máximo de revisión: 24 horas.', 'Ningún plazo de pago supera el inicio de la salida, 07 nov 2026 · 00:00.']);
    TestBed.resetTestingModule();
    const line = await screenOf(PaymentDeadlineLineComponent, providers());
    expect(flat(line.element)).toBe('');
    line.fixture.componentRef.setInput('reservation', { reservationId: EXTENDED });
    await line.settle();
    expect(flat(line.element)).toBe('Ningún plazo de pago supera el inicio de la salida, 14 nov 2026 · 00:00.');
  });
});

describe('following up (T-03)', () => {
  it('followupWithoutNoteIsShownBesideTheFieldAndNothingIsSaved', async () => {
    const { element, submit, type } = await following();
    await type('note', '   ');
    await submit();
    const note = element.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!;
    expect(note.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector(`#${note.getAttribute('aria-describedby')}`)?.textContent?.trim()).toBe('Registra una nota de seguimiento antes de guardar.');
    expect((await stored(TOTAL)).followups ?? []).toEqual([]);
  });

  it('eachFollowupIsAppendedWithDateTimeAndActor', async () => {
    const { element, submit, type } = await following();
    await type('note', 'Llamada al cliente: pagará el viernes');
    await submit();
    expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe('Seguimiento registrado correctamente.');
    await type('note', 'Correo enviado con los datos bancarios');
    await submit();
    expect((await stored(TOTAL)).followups).toEqual([
      { note: 'Llamada al cliente: pagará el viernes', actorLabel: 'Administrador del tenant (demo)', contactedAt: '2026-10-13T09:00:00-05:00' },
      { note: 'Correo enviado con los datos bancarios', actorLabel: 'Administrador del tenant (demo)', contactedAt: '2026-10-13T09:00:00-05:00' },
    ]);
    expect(Array.from(element.querySelectorAll('tbody tr')).map(cells)).toEqual([
      '13 oct 2026 09:00 Administrador del tenant (demo) Llamada al cliente: pagará el viernes',
      '13 oct 2026 09:00 Administrador del tenant (demo) Correo enviado con los datos bancarios',
    ]);
    expect(flat(element)).not.toContain('Aún no se han registrado seguimientos para esta reserva.');
  });

  it('followupWithCustomerReplyLeavesTheDeadlineUnchanged', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const before = await deadline(TOTAL), stamped = (await stored(TOTAL)).deadline;
    await register({ reservationId: TOTAL, note: 'El cliente respondió que pagará la próxima semana' });
    expect(await deadline(TOTAL)).toEqual(before);
    expect((await stored(TOTAL)).deadline).toEqual(stamped);
    expect((await stored(TOTAL)).status).toBe('PENDIENTE_DE_PAGO');
  });

  it('aClickAfterSuccessRecordsNoSecondFollowup', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const first = await register({ reservationId: TOTAL, note: 'Llamada' }, 'k-1');
    expect(await register({ reservationId: TOTAL, note: 'Llamada' }, 'k-1')).toBe(first);
    expect((await stored(TOTAL)).followups).toHaveLength(1);
    TestBed.resetTestingModule();
    const { element, submit, type, button } = await following();
    await type('note', 'Llamada');
    await submit();
    await submit();
    expect((await stored(TOTAL)).followups).toHaveLength(1);
    expect(element.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!.value).toBe('');
    expect(button('Registrar seguimiento')?.disabled).toBe(false);
  });

  it('aRetriedFollowupReusesItsIdempotencyKey', async () => {
    const writer = new HeldWriter(), keys = new ControllableIdempotencyKeys();
    const { submit, type, settle } = await following(TOTAL, { keys, extra: [{ provide: PaymentFollowupsWriter, useValue: writer }] });
    await type('note', 'Llamada');
    await submit();
    await submit();
    expect(writer.calls).toHaveLength(1);
    writer.answers[0].error({ status: 503 });
    await settle();
    await submit();
    expect(writer.calls.map(([, key]) => key)).toEqual([keys.generated[0], keys.generated[0]]);
    writer.answers[1].next({ ...(await stored(TOTAL)), followups: [{ note: 'Llamada', actorLabel: 'Administrador del tenant (demo)', contactedAt: '2026-10-13T09:00:00-05:00' }] });
    writer.answers[1].complete();
    await settle();
    await type('note', 'Llamada');
    await submit();
    expect(writer.calls[2][1]).not.toBe(keys.generated[0]);
  });
});

describe('what counts as payment, and who cancels (T-05)', () => {
  it('reservationWithProofInValidationIsNotListedAsExpiring', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const listed = async () => (await firstValueFrom(TestBed.inject(PendingPaymentsSource).list())).map((r) => r.id);
    expect(await listed()).toEqual([TOTAL, EXTENDED]);
    await firstValueFrom(TestBed.inject(ProofReviewWriter).decide({ reservationId: 'RES-1833', paymentId: 'RES-1833-P1', decision: 'RECHAZADO', verifiedAmountCents: 0, reason: 'Imagen ilegible' }, 'k-r'));
    expect(await listed()).toEqual([TOTAL, EXTENDED, 'RES-1833']);
    change(EXTENDED, { payments: [{ id: 'P1', method: 'CASH_AT_OFFICE', amountCents: 10_000_000, proofName: null, proofStatus: 'SIN_COMPROBANTE', registeredBy: 'Caja (demo)' }] });
    change(TOTAL, { payments: [{ id: 'P1', method: 'BANK_TRANSFER', amountCents: 10_000_000, proofName: 'x.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)' }] });
    expect(await listed()).toEqual(['RES-1833']);
    expect(DemoPendingPayments.prototype).toBeInstanceOf(PendingPaymentsSource);
  });

  it('portalNeverCancelsAReservationByItself', () => {
    for (const file of FILES) expect(readFileSync(file, 'utf8')).not.toMatch(/CANCELADA|setInterval|setTimeout|status:\s*'/);
  });

  it('paidReservationShowsOnlyTheHistory', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    change(TOTAL, { balanceCents: 0, validatedCents: 85_000_000, status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO',
      followups: [{ note: 'Pago confirmado por el cliente', actorLabel: 'Colaborador operativo (demo)', contactedAt: '2026-10-12T16:45:00-05:00' }] });
    const kept = store().items;
    TestBed.resetTestingModule();
    const { element } = await following(TOTAL, { extra: [{ provide: ReservationsSource, useValue: new DemoReservationsStore(kept) }] });
    expect(flat(element)).toContain('Esta reserva ya está pagada: solo puedes consultar el historial de seguimientos existente.');
    expect(element.querySelector('textarea')).toBeNull();
    expect(Array.from(element.querySelectorAll('label')).map((l) => l.textContent?.trim())).not.toContain('Plazo/límite vigente');
    expect(Array.from(element.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Volver a pagos', 'Volver a pagos']);
    expect(Array.from(element.querySelectorAll('tbody tr')).map(cells)).toEqual(['12 oct 2026 16:45 Colaborador operativo (demo) Pago confirmado por el cliente']);
    await expect(register({ reservationId: TOTAL, note: 'Otra nota' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('the rows of 13 and the roles (T-06)', () => {
  const payments = (role = 'TENANT_ADMINISTRATOR') => screenOf(PaymentsPageComponent, providers({ role }));
  const pendingRows = (element: HTMLElement) => Array.from(element.querySelectorAll('tbody[crppendingpaymentrows] tr'));

  it('pendingRowsCarryRegistrarSeguimientoAndNoValidarSoporte', async () => {
    expect(entriesOf(PAYMENT_FOLLOWUP_CONTRIBUTIONS, PAYMENTS_TABLE_BODIES).map((e) => e.component)).toEqual([PendingPaymentRowsComponent]);
    const { element, settle } = await payments();
    const bodies = Array.from(element.querySelectorAll('table tbody'));
    expect(bodies).toHaveLength(2);
    expect(bodies[1].hasAttribute('crppendingpaymentrows')).toBe(true);
    expect(pendingRows(element).map(cells)).toEqual([
      '#RES-1842 Laura Gómez (demo) Pago total · Transferencia $850.000 Saldo pendiente Registrar seguimiento',
      '#RES-1841 Mateo Ríos (demo) Abono · Efectivo $418.000 Saldo pendiente Registrar seguimiento',
    ]);
    expect(flat(bodies[1])).not.toMatch(/Validar comprobante|Ver comprobante|En validación/);
    pendingRows(element)[0].querySelector('button')!.click();
    await settle();
    const navigation = TestBed.inject(PortalNavigation);
    expect(navigation.params()).toEqual({ reservation: TOTAL });
  });

  it('pendingRowActionIsAKeyboardReachableButton', async () => {
    const { element } = await payments();
    const button = pendingRows(element)[0].querySelector('button')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.tabIndex).toBe(0);
    expect(pendingRows(element)[0].hasAttribute('tabindex') || pendingRows(element)[0].hasAttribute('role')).toBe(false);
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO']) {
      expect(PortalCapabilities.for(role).canFollowUp()).toBe(role === 'OPERATIONAL_COLLABORATOR');
      TestBed.resetTestingModule();
      const view = await payments(role);
      expect(pendingRows(view.element)).toHaveLength(2);
      expect(pendingRows(view.element).some((tr) => tr.querySelector('button'))).toBe(role === 'OPERATIONAL_COLLABORATOR');
    }
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR').canFollowUp()).toBe(true);
  });

  it('the rows show loading, error with retry, and nothing when no reservation waits for payment', async () => {
    const answering = (answer: () => Observable<readonly Reservation[]>) => new (class extends PendingPaymentsSource { calls = 0; override list() { this.calls++; return answer(); } })();
    const rowsWith = (source: PendingPaymentsSource) => { TestBed.resetTestingModule(); return screenOf(PaymentsPageComponent, providers({ extra: [{ provide: PendingPaymentsSource, useValue: source }] })); };
    expect((await rowsWith(answering(() => NEVER))).element.querySelector('tbody[crppendingpaymentrows] [data-state="loading"]')?.textContent).toContain('Cargando…');
    const failing = answering(() => throwError(() => new Error('down')));
    const failed = await rowsWith(failing);
    expect(failed.element.querySelector('tbody[crppendingpaymentrows] [role="alert"]')?.textContent).toContain('No se pudo completar la solicitud.');
    await failed.click('Reintentar');
    expect(failing.calls).toBe(2);
    expect(pendingRows((await rowsWith(answering(() => of([])))).element)).toHaveLength(0);
  });

  it('theTableShowsTheEmptyTextOfHU010OnlyWhenNoProofAndNoPendingRowWait', async () => {
    // Spec 011-: the empty text of the table is HU-COM-010's, drawn once, only when neither the proofs nor the pending rows have one.
    const noProofs = { provide: PendingProofsSource, useValue: new (class extends PendingProofsSource { override list() { return of({ rows: [], overdueCount: 0 }); } })() };
    const noPending = { provide: PendingPaymentsSource, useValue: new (class extends PendingPaymentsSource { override list() { return of([]); } })() };
    const empty = 'No hay comprobantes por revisar.';
    const view = (extra: unknown[]) => { TestBed.resetTestingModule(); return screenOf(PaymentsPageComponent, providers({ extra })); };
    const both = (await view([noProofs, noPending])).element;
    expect(both.querySelector('tbody[crppendingpaymentrows] [data-state="empty"]')?.textContent?.trim()).toBe(empty);
    expect(flat(both).split(empty)).toHaveLength(2);
    expect(flat(await view([noProofs]).then((v) => v.element))).not.toContain(empty);
    expect(flat(await view([noPending]).then((v) => v.element))).not.toContain(empty);
    expect(flat(await view([]).then((v) => v.element))).not.toContain(empty);
  });
});

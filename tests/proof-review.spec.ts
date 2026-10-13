import { Component, Injector, Type, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { DemoProofReviewWriter, proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import {
  ProofManagementActionsComponent, ReviewLimitLineComponent,
} from '../src/app/payments/components/proof-review-actions.component';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { DecideProofCommand, PendingProofs, PendingProofsSource, ProofReviewWriter } from '../src/app/payments/data/proof-review-ports';
import { PaymentsPageComponent } from '../src/app/payments/pages/payments-page.component';
import { ValidateProofPageComponent } from '../src/app/payments/pages/validate-proof-page.component';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { PAYMENTS_PAGE_PANELS, PAYMENTS_ROW_ACTIONS, PAYMENTS_TABLE_BODIES, contribute } from '../src/app/shared/portal-slots';
import type { MountProps, PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-010 (spec 010-, tasks T-01 to T-07): "Pagos pendientes" and "Validar soporte" of screen 13, the links of 10, 10A and 13,
// and the review limit of 24, over the one reservations store of HU-COM-007 that HU-COM-009 writes.
// Seeded proofs En validación: RES-1834 (Abono · Transferencia, $300.000, $100.000 already validated, a $50.000 proof presented
// 2026-10-12 09:00) and RES-1833 (Abono · Transferencia, $300.000, a $100.000 proof presented 2026-10-13 09:00).
const VALIDATED = 'RES-1834';
const EXAMPLE = 'RES-1833';
const TOTAL = 'RES-1842';
const AT = (iso: string) => Date.parse(iso);
const NOW = AT('2026-10-13T09:00:00-05:00');
/** The reservations whose proof waits in the demo store; other stories may seed more of them (HU-COM-014 seeds RES-1840). */
const waitingIds = async () => (await firstValueFrom(TestBed.inject(PendingProofsSource).list())).rows.map((row) => row.reservation.id);

class FixedClock extends Clock {
  constructor(public at = NOW) { super(); }
  override now(): number { return this.at; }
}
const actor = (role: string, collaboratorMayValidateProofs = false): ActorContext => new (class extends ActorContext {
  override readonly role = role as never;
  override readonly collaboratorMayValidateProofs = collaboratorMayValidateProofs;
})();
const pdf = () => Object.defineProperty(new File(['x'], 'nuevo.pdf', { type: 'application/pdf' }), 'size', { value: 1024 });

function navigationWith(params: Record<string, string> = {}) {
  const navigation = new PortalNavigation();
  navigation.register(['payments', 'payments-validate', 'reservations']);
  navigation.params.set(params);
  return navigation;
}

type Setup = { role?: string; mayValidate?: boolean; params?: Record<string, string>; clock?: Clock; keys?: IdempotencyKeys; extra?: unknown[] };
function providers({ role = 'TENANT_ADMINISTRATOR', mayValidate = false, params = {}, clock = new FixedClock(), keys = new ControllableIdempotencyKeys(), extra = [] }: Setup = {}) {
  return [
    { provide: ActorContext, useValue: actor(role, mayValidate) },
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: Clock, useValue: clock },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: PortalNavigation, useValue: navigationWith(params) },
    ...extra,
  ];
}

const stored = async (id: string) => (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((r) => r.id === id)!;
const command = (over: Partial<DecideProofCommand> = {}): DecideProofCommand =>
  ({ reservationId: EXAMPLE, paymentId: `${EXAMPLE}-P1`, decision: 'APROBADO', verifiedAmountCents: 10_000_000, reason: 'Soporte legible', ...over });
const decide = (over: Partial<DecideProofCommand> = {}, key = 'k-1') => firstValueFrom(TestBed.inject(ProofReviewWriter).decide(command(over), key));
const refusal = (call: Promise<unknown>) => call.then(() => { throw new Error('accepted'); }, (e: { status: number; userMessage: string }) => e);
const flat = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ');

/** A writer whose answer the test releases, so a second click lands while the first decision is pending. */
class HeldWriter extends ProofReviewWriter {
  readonly calls: [DecideProofCommand, string][] = [];
  readonly answers: Subject<Reservation>[] = [];
  override decide(c: DecideProofCommand, key: string): Observable<Reservation> {
    this.calls.push([c, key]); this.answers.push(new Subject<Reservation>()); return this.answers.at(-1)!;
  }
}

const validating = (payment = `${EXAMPLE}-P1`, setup: Setup = {}) =>
  screenOf(ValidateProofPageComponent, providers({ ...setup, params: { reservation: payment.replace(/-P\d+$/, ''), payment } }));

afterEach(() => TestBed.resetTestingModule());

describe('the frame: areas, four states and texts (T-01)', () => {
  it('registers Pagos as a sidebar area and Validar soporte as its sub-screen, each only with the review ports', () => {
    const payments = PORTAL_AREAS.find((area) => area.key === 'payments')!, validate = PORTAL_AREAS.find((area) => area.key === 'payments-validate')!;
    expect(payments).toMatchObject({ label: 'Pagos', component: PaymentsPageComponent });
    expect(payments.menu).toBeUndefined();
    expect(validate).toMatchObject({ label: 'Validar soporte', component: ValidateProofPageComponent, menu: false, parent: 'payments' });
    TestBed.configureTestingModule({ providers: providers() });
    const injector = TestBed.inject(Injector);
    expect(payments.isAvailable!(injector)).toBe(true);
    expect(validate.isAvailable!(injector)).toBe(true);
  });

  it('everyReviewScreenShowsOneOfTheFourStates', async () => {
    const pagesWith = async (source: PendingProofsSource) => {
      TestBed.resetTestingModule();
      return screenOf(PaymentsPageComponent, providers({ extra: [{ provide: PendingProofsSource, useValue: source }] }));
    };
    const answering = (answer: () => Observable<PendingProofs>) => new (class extends PendingProofsSource { calls = 0; override list() { this.calls++; return answer(); } })();
    expect((await pagesWith(answering(() => NEVER))).element.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando…');
    const failing = answering(() => throwError(() => new Error('down')));
    const failed = await pagesWith(failing);
    expect(failed.element.querySelector('[role="alert"][data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    await failed.click('Reintentar');
    expect(failing.calls).toBe(2);
    const empty = await pagesWith(answering(() => of({ rows: [], overdueCount: 0 })));
    expect(empty.element.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No hay soportes por revisar.');
    // The mockup always draws the badge of Pagos pendientes, also when no proof waits.
    expect(empty.element.querySelector('.crp-operator-panel-head .crp-operator-status')?.textContent?.trim()).toBe('0 pendientes');
    TestBed.resetTestingModule();
    const seeded = await screenOf(PaymentsPageComponent, providers());
    expect(seeded.element.querySelectorAll('[data-state="data"] tbody tr')).toHaveLength((await waitingIds()).length);
    TestBed.resetTestingModule();
    const unknown = await validating('RES-1999-P1');
    expect(unknown.element.querySelector('[data-state="empty"]')?.textContent)
      .toContain('No se encontró el soporte de pago seleccionado. Vuelve a Pagos e ingresa nuevamente por Validar soporte.');
  });

  it('reviewTextsAreSpanishWithFormattedMoneyAndNoRawCodes', async () => {
    const { element } = await screenOf(PaymentsPageComponent, providers());
    const text = flat(element);
    expect(text).toContain('Control de cobro');
    expect(text).toContain('Pagos y devoluciones');
    expect(text).toContain('Confirma pagos sin perder trazabilidad.');
    expect(Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Reserva', 'Cliente', 'Modalidad', 'Valor pendiente', 'Estado', 'Acción']);
    const ofExample = Array.from(element.querySelectorAll('tbody tr')).find((tr) => tr.textContent?.includes(`#${EXAMPLE}`));
    const row = Array.from(ofExample?.querySelectorAll('td') ?? []).map((td) => td.textContent?.trim()).join(' ');
    expect(row).toMatch(/#RES-183[34] .+ \(demo\) Abono · Transferencia \$[23]00\.000 En validación/);
    expect(text).not.toMatch(/EN_VALIDACION|BANK_TRANSFER|PARTIAL|PENDIENTE_DE_PAGO|undefined|null|NaN/);
    TestBed.resetTestingModule();
    const page = await validating();
    const form = flat(page.element);
    expect(page.element.querySelector('h1')?.textContent?.trim()).toBe('Validar soporte');
    expect(form).toContain('Revisa el comprobante antes de decidir');
    expect(page.element.querySelector<HTMLInputElement>('#crp-proof-review-code')?.value).toBe(`#${EXAMPLE}`);
    expect(page.element.querySelector<HTMLInputElement>('#crp-proof-review-method')?.value).toBe('Abono · Transferencia');
    expect(page.element.querySelector<HTMLInputElement>('#crp-proof-review-status')?.value).toBe('En validación');
    expect(page.element.querySelector<HTMLInputElement>('[name="verifiedAmount"]')?.value).toBe('$100.000');
    expect(form).toContain('Motivo (obligatorio)');
    expect(form).toContain('Registra el motivo y decide si apruebas o rechazas el soporte.');
    expect(form).not.toMatch(/EN_VALIDACION|BANK_TRANSFER|PARTIAL/);
  });
});

describe('the decision form (T-02)', () => {
  it('rejectionKeepsActorDateTimeAndReason (AC-PV.1)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const before = await stored(EXAMPLE);
    const after = await decide({ decision: 'RECHAZADO', reason: 'Imagen ilegible' });
    expect(after.payments![0]).toMatchObject({ proofStatus: 'RECHAZADO', review: {
      decision: 'RECHAZADO', reason: 'Imagen ilegible', actorLabel: 'Administrador del tenant (demo)', decidedAt: new Date(NOW).toISOString() } });
    expect(after).toMatchObject({ status: before.status, financialStatus: before.financialStatus, balanceCents: before.balanceCents });
    expect(after.validatedCents ?? 0).toBe(before.validatedCents ?? 0);
    expect(await stored(EXAMPLE)).toEqual(after);
  });

  it('emptyReasonOrNonPositiveAmountIsShownBesideItsField (AC-PV.10)', async () => {
    const writer = new HeldWriter();
    const { element, click, type } = await screenOf(ValidateProofPageComponent, providers({
      params: { reservation: EXAMPLE, payment: `${EXAMPLE}-P1` }, extra: [{ provide: ProofReviewWriter, useValue: writer }] }));
    await click('Rechazar soporte');
    expect(element.querySelector('#crp-proof-review-reason-error')?.textContent?.trim()).toBe('Registra el motivo obligatorio antes de aprobar o rechazar el soporte.');
    expect(element.querySelector('[name="reason"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('[name="reason"]')?.getAttribute('aria-describedby')).toBe('crp-proof-review-reason-error');
    await type('reason', 'Monto revisado');
    await type('verifiedAmount', '0');
    await click('Aprobar soporte');
    expect(element.querySelector('#crp-proof-review-amount-error')?.textContent?.trim()).toBe('Registra un monto mayor a $0.');
    expect(element.querySelector('[name="verifiedAmount"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(writer.calls).toEqual([]);
  });

  it('aDoubleClickRecordsOneDecision, and a retry reuses its Idempotency-Key (AC-PV.10)', async () => {
    const writer = new HeldWriter(), keys = new ControllableIdempotencyKeys();
    const { button, click, type, settle } = await screenOf(ValidateProofPageComponent, providers({
      keys, params: { reservation: EXAMPLE, payment: `${EXAMPLE}-P1` }, extra: [{ provide: ProofReviewWriter, useValue: writer }] }));
    await type('reason', 'Soporte legible');
    button('Aprobar soporte')!.click(); button('Aprobar soporte')!.click(); await settle();
    expect(writer.calls).toHaveLength(1);
    expect(button('Aprobar soporte')!.disabled).toBe(true);
    writer.answers[0].error({ status: 500 }); await settle();
    await click('Aprobar soporte');
    expect(writer.calls.map(([, key]) => key)).toEqual([writer.calls[0][1], writer.calls[0][1]]);
    const r = await stored(EXAMPLE);
    writer.answers[1].next({ ...r, payments: r.payments!.map((p) => ({ ...p, proofStatus: 'APROBADO' as const })) }); await settle();
    await click('Aprobar soporte');
    expect(writer.calls).toHaveLength(2);
    expect(button('Aprobar soporte')!.disabled).toBe(true);
    expect(button('Rechazar soporte')!.disabled).toBe(true);
  });

  it('a decision in the demo store is recorded once per Idempotency-Key', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const first = await decide({}, 'same');
    expect(await decide({}, 'same')).toEqual(first);
    expect((await stored(EXAMPLE)).validatedCents).toBe(10_000_000);
  });

  it('theEditableValorRecibidoIsWrittenInPesosLikeTheMockupAndReadBack ($100.000)', async () => {
    const writer = new HeldWriter();
    const { element, click, type } = await screenOf(ValidateProofPageComponent, providers({
      params: { reservation: EXAMPLE, payment: `${EXAMPLE}-P1` }, extra: [{ provide: ProofReviewWriter, useValue: writer }] }));
    expect(element.querySelector<HTMLInputElement>('[name="verifiedAmount"]')?.value).toBe('$100.000');
    await type('reason', 'Soporte legible'); await click('Aprobar soporte');
    expect(writer.calls[0][0].verifiedAmountCents).toBe(10_000_000);
    TestBed.resetTestingModule();
    const edited = new HeldWriter();
    const again = await screenOf(ValidateProofPageComponent, providers({
      params: { reservation: EXAMPLE, payment: `${EXAMPLE}-P1` }, extra: [{ provide: ProofReviewWriter, useValue: edited }] }));
    await again.type('verifiedAmount', '$150.000'); await again.type('reason', 'Monto del extracto'); await again.click('Aprobar soporte');
    expect(edited.calls[0][0].verifiedAmountCents).toBe(15_000_000);
  });

  it('verifiedAmountIsReadInCents (0.07 is 7 cents)', async () => {
    const writer = new HeldWriter();
    const { click, type } = await screenOf(ValidateProofPageComponent, providers({
      params: { reservation: EXAMPLE, payment: `${EXAMPLE}-P1` }, extra: [{ provide: ProofReviewWriter, useValue: writer }] }));
    await type('verifiedAmount', '0.07'); await type('reason', 'Monto verificado en el extracto');
    await click('Aprobar soporte');
    expect(writer.calls[0][0]).toEqual({ reservationId: EXAMPLE, paymentId: `${EXAMPLE}-P1`, decision: 'APROBADO', verifiedAmountCents: 7, reason: 'Monto verificado en el extracto' });
  });

  it('aDecidedProofCannotBeDecidedAgain (AC-PV.9)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    await decide({ decision: 'RECHAZADO', reason: 'Imagen ilegible' }, 'k-1');
    const again = await refusal(decide({ decision: 'APROBADO' }, 'k-2'));
    expect(again.status).toBe(409);
    expect((await stored(EXAMPLE)).payments![0].proofStatus).toBe('RECHAZADO');
    TestBed.resetTestingModule();
    const { element, button } = await validating(`${VALIDATED}-P1`);
    expect(flat(element)).toContain('Este soporte ya fue validado. No se puede volver a decidir sobre el mismo intento.');
    expect(button('Aprobar soporte')!.disabled).toBe(true);
    expect(button('Rechazar soporte')!.disabled).toBe(true);
    expect(element.querySelector<HTMLTextAreaElement>('[name="reason"]')!.disabled).toBe(true);
  });

  it('answers each decision with the mockup sentence and draws the recalculated state', async () => {
    const { element, click, type } = await validating();
    await type('reason', 'Soporte legible'); await click('Aprobar soporte');
    expect(flat(element)).toContain('Soporte aprobado. La reserva y su situación financiera fueron recalculadas.');
    expect(element.querySelector<HTMLInputElement>('#crp-proof-review-status')?.value).toBe('Aprobado');
    TestBed.resetTestingModule();
    const rejected = await validating();
    await rejected.type('reason', 'Imagen ilegible'); await rejected.click('Rechazar soporte');
    expect(flat(rejected.element)).toContain('Soporte rechazado. La reserva conserva su estado y saldo pendiente.');
  });
});

describe('approval and confirmation (T-03)', () => {
  it('minimumPartialApprovedConfirmsWithAbonoRecibido (AC-PV.2: $100.000 of $300.000)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    expect((await stored(EXAMPLE)).quote.finalCents).toBe(30_000_000);
    const after = await decide({ verifiedAmountCents: 10_000_000 });
    expect(after).toMatchObject({ status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO', validatedCents: 10_000_000, balanceCents: 20_000_000 });
    expect(after.payments![0].review).toMatchObject({ decision: 'APROBADO', verifiedAmountCents: 10_000_000 });
  });

  it('fullPaymentConfirmsOnlyAtOneHundredPercent (Pago total)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const pay = (cents: number, key: string) => firstValueFrom(TestBed.inject(PaymentsWriter).register({ reservationId: TOTAL, amountCents: cents, proof: pdf() }, key));
    const first = await pay(30_000_000, 'p-1');
    const partly = await decide({ reservationId: TOTAL, paymentId: first.payments![0].id, verifiedAmountCents: 30_000_000 }, 'd-1');
    expect(partly).toMatchObject({ status: 'PENDIENTE_DE_PAGO', financialStatus: 'PARCIAL', validatedCents: 30_000_000, balanceCents: 55_000_000 });
    const second = await pay(55_000_000, 'p-2');
    const full = await decide({ reservationId: TOTAL, paymentId: second.payments![1].id, verifiedAmountCents: 55_000_000 }, 'd-2');
    expect(full).toMatchObject({ status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO', validatedCents: 85_000_000, balanceCents: 0 });
  });

  it('proofUnderValidationNeverConfirms (AC-PV.3)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const pending = await stored(EXAMPLE);
    expect(pending.payments![0]).toMatchObject({ proofStatus: 'EN_VALIDACION', amountCents: 10_000_000 });
    expect(pending).toMatchObject({ status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', balanceCents: 30_000_000 });
    expect(pending.validatedCents ?? 0).toBe(0);
  });
});

describe('rejection, retry and excess (T-04)', () => {
  it('rejectionLeavesValidatedPaymentsUntouched (AC-PV.4)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const before = await stored(VALIDATED);
    expect(before).toMatchObject({ status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO', validatedCents: 10_000_000, balanceCents: 20_000_000 });
    const after = await decide({ reservationId: VALIDATED, paymentId: `${VALIDATED}-P2`, decision: 'RECHAZADO', reason: 'Valor no coincide' });
    expect(after.payments![0]).toEqual(before.payments![0]);
    expect(after.payments![1].proofStatus).toBe('RECHAZADO');
    expect(after).toMatchObject({ status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO', validatedCents: 10_000_000, balanceCents: 20_000_000 });
  });

  it('rejectedAttemptStaysInHistoryAndANewProofIsDistinct (AC-PV.6)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    await decide({ decision: 'RECHAZADO', reason: 'imagen ilegible' });
    const again = await firstValueFrom(TestBed.inject(PaymentsWriter).register({ reservationId: EXAMPLE, amountCents: 10_000_000, proof: pdf() }, 'p-1'));
    expect(again.payments!.map((p) => [p.id, p.proofStatus])).toEqual([[`${EXAMPLE}-P1`, 'RECHAZADO'], [`${EXAMPLE}-P2`, 'EN_VALIDACION']]);
    const fixture = TestBed.createComponent(ProofManagementActionsComponent);
    fixture.componentRef.setInput('reservation', again); fixture.detectChanges();
    expect(flat(fixture.nativeElement)).toContain('Historial: En validación → Rechazado: imagen ilegible → En validación.');
  });

  it('approvalAppliesOnlyThePendingBalanceAndHandsTheExcess (AC-PV.8; the credit balance is HU-COM-017)', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const after = await decide({ verifiedAmountCents: 40_000_000 });
    expect(after).toMatchObject({ status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO', validatedCents: 30_000_000, balanceCents: 0 });
    expect((TestBed.inject(ProofReviewWriter) as DemoProofReviewWriter).handedExcess).toEqual([{ reservationId: EXAMPLE, amountCents: 10_000_000 }]);
  });
});

describe('the 24-hour mark (T-05)', () => {
  it('proofOver24HoursIsMarkedWithoutChangingState (AC-PV.5)', async () => {
    const clock = new FixedClock(AT('2026-10-13T08:59:00-05:00'));
    TestBed.configureTestingModule({ providers: providers({ clock }) });
    const before = await stored(VALIDATED);
    const early = await firstValueFrom(TestBed.inject(PendingProofsSource).list());
    expect(early.overdueCount).toBe(0);
    clock.at = NOW;
    const due = await firstValueFrom(TestBed.inject(PendingProofsSource).list());
    expect(due.overdueCount).toBe(1);
    expect(due.rows.map((row) => [row.reservation.id, row.payment.id, row.overdue])).toEqual(expect.arrayContaining([
      [VALIDATED, `${VALIDATED}-P2`, true], [EXAMPLE, `${EXAMPLE}-P1`, false]]));
    expect(await stored(VALIDATED)).toEqual(before);
  });

  it('paymentsTableShowsTheOverdueNotice', async () => {
    const { element } = await screenOf(PaymentsPageComponent, providers());
    expect(element.querySelector('.crp-operator-panel-head .crp-operator-status')?.textContent?.trim()).toBe(`${(await waitingIds()).length} pendientes`);
    expect(element.querySelector('.crp-access-note')?.textContent?.trim()).toBe('Hay 1 soporte(s) con revisión vencida. La marca no cambia el estado ni libera cupos.');
    const rows = Array.from(element.querySelectorAll('tbody tr')).map((tr) => flat(tr as HTMLElement));
    expect(rows.find((row) => row.includes(`#${VALIDATED}`))).toContain('En validación · Revisión vencida');
    expect(rows.find((row) => row.includes(`#${EXAMPLE}`))).not.toContain('Revisión vencida');
    TestBed.resetTestingModule();
    const early = await screenOf(PaymentsPageComponent, providers({ clock: new FixedClock(AT('2026-10-13T08:59:00-05:00')) }));
    expect(early.element.querySelector('.crp-access-note')).toBeNull();
  });
});

describe('the permission (T-06)', () => {
  it('answers canDecideProof from the one capabilities table: the Administrator, and the Collaborator only with the flag', () => {
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR').canDecideProof()).toBe(true);
    expect(PortalCapabilities.of(actor('OPERATIONAL_COLLABORATOR', true)).canDecideProof()).toBe(true);
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'ROL_DESCONOCIDO']) {
      expect(PortalCapabilities.of(actor(role)).canDecideProof(), role).toBe(false);
    }
    expect(PortalCapabilities.of(actor('MANAGER', true)).canDecideProof()).toBe(false);
  });

  it('withoutPermissionNoDecisionActionIsDrawnAndAForcedOneIsDenied (AC-PV.7)', async () => {
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST', 'ROL_DESCONOCIDO']) {
      const { element, button } = await validating(`${EXAMPLE}-P1`, { role });
      expect(element.querySelector('h1')?.textContent?.trim(), role).toBe('Ver soporte');
      expect(flat(element), role).toContain('Consulta del comprobante de pago');
      expect(element.querySelector('[name="reason"]'), role).toBeNull();
      expect(button('Aprobar soporte'), role).toBeUndefined();
      expect(button('Rechazar soporte'), role).toBeUndefined();
      expect(button('Volver a pagos'), role).toBeDefined();
      const forced = await refusal(decide());
      expect(forced.status, role).toBe(403);
      expect((await stored(EXAMPLE)).payments![0].proofStatus, role).toBe('EN_VALIDACION');
      TestBed.resetTestingModule();
      const list = await screenOf(PaymentsPageComponent, providers({ role }));
      expect(list.button('Validar soporte'), role).toBeUndefined();
      expect(list.button('Ver soporte'), role).toBeDefined();
      TestBed.resetTestingModule();
    }
    const allowed = await validating(`${EXAMPLE}-P1`, { role: 'OPERATIONAL_COLLABORATOR', mayValidate: true });
    expect(allowed.button('Aprobar soporte')).toBeDefined();
  });
});

describe('the actions of 13 and the text of 24 (T-07); the links of 10 and 10A are proof-review-links.spec.ts', () => {
  async function drawn<T>(component: Type<T>, reservation: Reservation | null, setup: Setup = {}) {
    TestBed.configureTestingModule({ providers: providers(setup) });
    const fixture = TestBed.createComponent(component);
    if (reservation) fixture.componentRef.setInput('reservation', reservation);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement, navigation = TestBed.inject(PortalNavigation);
    const press = (label: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!.click();
    return { element, navigation, press };
  }
  const reservation = async (id: string) => { TestBed.configureTestingModule({ providers: providers() }); const r = await stored(id); TestBed.resetTestingModule(); return r; };

  it('the 13 sub-screen leads Validar and Rechazar soporte to the decision page, only for a proof under validation (AC-PV.3)', async () => {
    const example = await reservation(EXAMPLE), plain = await reservation(TOTAL);
    const management = await drawn(ProofManagementActionsComponent, example);
    for (const label of ['Validar soporte', 'Rechazar soporte']) {
      management.navigation.selected.set(undefined);
      management.press(label);
      expect(management.navigation.selected(), label).toBe('payments-validate');
      expect(management.navigation.params(), label).toEqual({ reservation: EXAMPLE, payment: `${EXAMPLE}-P1` });
    }
    TestBed.resetTestingModule();
    expect((await drawn(ProofManagementActionsComponent, plain)).element.querySelectorAll('button')).toHaveLength(0);
    TestBed.resetTestingModule();
    const analyst = await drawn(ProofManagementActionsComponent, example, { role: 'ANALYST' });
    expect(analyst.element.querySelectorAll('button')).toHaveLength(0);
  });

  it('transferScreenShowsThe24HourReviewLimit (AC-PV.11)', async () => {
    const { element } = await drawn(ReviewLimitLineComponent, null);
    expect(element.textContent?.trim()).toBe('Plazo máximo de revisión: 24 horas.');
  });

  it('offers PAYMENTS_ROW_ACTIONS in the Acción cell and PAYMENTS_PAGE_PANELS after Pagos pendientes', async () => {
    @Component({ selector: 'crp-test-row', template: 'Fila {{ reservation()?.id }}' })
    class RowDouble { readonly reservation = input<Reservation>(); }
    @Component({ selector: 'crp-test-panel', template: '<section class="crp-operator-panel">Panel</section>' })
    class PanelDouble {}
    const { element } = await screenOf(PaymentsPageComponent, providers({ extra: [
      contribute(PAYMENTS_ROW_ACTIONS, { component: RowDouble, order: 1 }), contribute(PAYMENTS_PAGE_PANELS, { component: PanelDouble, order: 1 })] }));
    const cells = Array.from(element.querySelectorAll('tbody tr td:last-child button + crp-test-row')).map((cell) => cell.textContent?.trim());
    expect(cells.sort()).toEqual((await waitingIds()).map((id) => `Fila ${id}`).sort());
    expect(cells).toEqual(expect.arrayContaining([`Fila ${EXAMPLE}`, `Fila ${VALIDATED}`]));
    expect(element.querySelector('section.crp-operator-panel:has(table) + crp-test-panel')).not.toBeNull();
  });

  it('offers PAYMENTS_TABLE_BODIES after the proofs of Pagos pendientes, and draws the table for them when no proof waits', async () => {
    @Component({ selector: 'tbody[crpTestBody]', template: '<tr><td>Fila de seguimiento</td></tr>' })
    class BodyDouble {}
    const body = contribute(PAYMENTS_TABLE_BODIES, { component: BodyDouble, order: 1 });
    const { element } = await screenOf(PaymentsPageComponent, providers({ extra: [body] }));
    const bodies = Array.from(element.querySelectorAll('table tbody'));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].querySelectorAll('tr')).toHaveLength((await waitingIds()).length);
    expect(bodies[1].textContent?.trim()).toBe('Fila de seguimiento');
    TestBed.resetTestingModule();
    const none = new (class extends PendingProofsSource { override list() { return of({ rows: [], overdueCount: 0 }); } })();
    const only = await screenOf(PaymentsPageComponent, providers({ extra: [body, { provide: PendingProofsSource, useValue: none }] }));
    expect(only.element.querySelector('[data-state="empty"]')).toBeNull();
    expect(only.element.querySelector('[data-state="data"] table tbody[crptestbody]')?.textContent?.trim()).toBe('Fila de seguimiento');
    expect(only.element.querySelector('.crp-operator-panel-head .crp-operator-status')?.textContent?.trim()).toBe('0 pendientes');
    TestBed.resetTestingModule();
    const unavailable = contribute(PAYMENTS_TABLE_BODIES, { component: BodyDouble, order: 1, isAvailable: () => false });
    const empty = await screenOf(PaymentsPageComponent, providers({ extra: [unavailable, { provide: PendingProofsSource, useValue: none }] }));
    expect(empty.element.querySelector('[data-state="empty"]')?.textContent?.trim()).toBe('No hay soportes por revisar.');
  });

  it('the demo build draws Pagos in the sidebar and opens Validar soporte from its row', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const props: MountProps = { apiClient: { request: vi.fn() } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } };
    const cleanup = entry.mountWith(host, props, (client: PortalApiClient) => demoSources(client));
    const press = (selector: string, label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(selector)).find((b) => b.textContent?.trim() === label)!.click();
    try {
      await vi.waitFor(() => expect(Array.from(host.querySelectorAll('nav button')).map((b) => b.textContent?.trim())).toContain('Pagos'));
      press('nav button', 'Pagos');
      await vi.waitFor(() => expect(host.querySelector('app-payments-page [data-state="data"] tbody tr')).toBeTruthy());
      Array.from(host.querySelectorAll('app-payments-page tbody tr')).find((tr) => tr.textContent?.includes(`#${EXAMPLE}`))!.querySelector('button')!.click();
      await vi.waitFor(() => expect(host.querySelector('app-validate-proof-page h1')?.textContent?.trim()).toBe('Validar soporte'));
      expect(host.querySelector('nav button.crp-is-active')?.textContent?.trim()).toBe('Pagos');
    } finally { cleanup(); host.remove(); }
  });
});

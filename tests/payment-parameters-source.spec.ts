import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { DemoPaymentParametersStore, DemoPaymentParametersWriter } from '../src/app/demo/payment-parameters-demo';
import { DemoPaymentDeadlineExtender, DemoPaymentDeadlines } from '../src/app/demo/payment-followup-demo';
import { DemoProofReviewWriter, minimumPartial } from '../src/app/demo/proof-review-demo';
import { DemoCancellationQuote, FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { PaymentParametersSource, SaveParametersCommand } from '../src/app/payment-parameters/data/payment-parameters-ports';
import { SEED_PARAMETERS, minimumDepositCents } from '../src/app/payment-parameters/model/payment-parameters';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { Clock } from '../src/app/shared/clock';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { reservationOf } from './reservations.double';

// HU-COM-009 amendment v1.9, A.3 and AC-PY.12, AC-PY.17: the port PaymentParametersSource, its demo, and the three stories that read it
// (010- minimum deposit, 011- deadlines, 013- penalty) with the figures they already ran with. Invented data only.
const NOW = '2026-10-14T10:00:00-05:00';
const THREE_HUNDRED_THOUSAND = 30_000_000;
const user = new (class extends RegisteringUser { override label() { return 'Administrador del tenant (demo)'; } })();
const clock = () => new FixedClock(NOW);
const writerFor = (store: DemoPaymentParametersStore, role = 'TENANT_ADMINISTRATOR') => new DemoPaymentParametersWriter(store, PortalCapabilities.for(role), user, clock(), new Map());
const save = (writer: DemoPaymentParametersWriter, over: Partial<SaveParametersCommand> = {}, key = 'k1') =>
  firstValueFrom(writer.save({ tenant: {}, services: {}, reason: 'política comercial de temporada', ...over }, key));
const refusal = async (promise: Promise<unknown>) => promise.then(() => null, (e: { status: number; userMessage: string }) => e);
const view = (store: DemoPaymentParametersStore, services: string[] = ['Tour 1', 'Tour 2']) => firstValueFrom(store.read(services));

describe('thePaymentParametersSeedKeepsTheFiguresOfTheEarlierStories', () => {
  it('seeds the 72-hour wait, the 24-hour extension, a third as minimum deposit and no penalty policy', () => {
    expect(SEED_PARAMETERS).toMatchObject({ initialHoursTotal: 72, initialHoursDeposit: 72, extensionHours: 24, balanceHoursBefore: 24, cancellationPenaltyPercent: null });
    expect(minimumDepositCents(THREE_HUNDRED_THOUSAND, SEED_PARAMETERS.minDepositPercent)).toBe(10_000_000);
  });
  it('rounds the minimum deposit up to the next cent', () => {
    expect(minimumDepositCents(10_001, 30)).toBe(3001);
  });
});

describe('theMinimumDepositComesFromThePaymentParameters', () => {
  it('answers a third of the final value by default and the percentage the administrator saves afterwards', async () => {
    const store = new DemoPaymentParametersStore(), source: PaymentParametersSource = store;
    expect(await firstValueFrom(source.minimumDepositCents(THREE_HUNDRED_THOUSAND, 'Tour 1'))).toBe(10_000_000);
    await save(writerFor(store), { tenant: { minDepositPercent: 50 } });
    expect(await firstValueFrom(source.minimumDepositCents(THREE_HUNDRED_THOUSAND, 'Tour 1'))).toBe(15_000_000);
  });
  it('lets a service define its own percentage and clears it back to the tenant value with null', async () => {
    const store = new DemoPaymentParametersStore();
    await save(writerFor(store), { tenant: { minDepositPercent: 40 }, services: { 'Tour 2': { minDepositPercent: 25 } } });
    expect(await firstValueFrom(store.minimumDepositCents(THREE_HUNDRED_THOUSAND, 'Tour 2'))).toBe(7_500_000);
    expect(await firstValueFrom(store.minimumDepositCents(THREE_HUNDRED_THOUSAND, 'Tour 1'))).toBe(12_000_000);
    await save(writerFor(store), { services: { 'Tour 2': { minDepositPercent: null } } }, 'k2');
    expect(await firstValueFrom(store.minimumDepositCents(THREE_HUNDRED_THOUSAND, 'Tour 2'))).toBe(12_000_000);
  });
  it('is the minimum partial the stories of payments use, a third without parameters', async () => {
    const quote = { ...reservationOf('x').quote, finalCents: THREE_HUNDRED_THOUSAND }, parameters = new DemoPaymentParametersStore();
    expect(minimumPartial(reservationOf('RES-A', { quote }))).toBe(10_000_000);
    await save(writerFor(parameters), { tenant: { minDepositPercent: 50 } });
    expect(minimumPartial(reservationOf('RES-NEW', { quote }), parameters)).toBe(15_000_000);
  });
});

describe('onlyTheAdministratorSavesThePaymentParameters', () => {
  it('refuses every other role with 403 and changes nothing', async () => {
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'UNKNOWN']) {
      const store = new DemoPaymentParametersStore();
      expect((await refusal(save(writerFor(store, role), { tenant: { minDepositPercent: 50 } })))?.status).toBe(403);
      expect(store.config.tenant).toEqual({});
    }
  });
  it('lets only the Administrator ask for the capability', () => {
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR').canManagePaymentParameters()).toBe(true);
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY', 'UNKNOWN']) expect(PortalCapabilities.for(role).canManagePaymentParameters()).toBe(false);
  });
});

describe('parametersAreBoundedNeedAReasonAndLeaveAnAuditLine', () => {
  it('refuses an empty reason with the text of the mockup', async () => {
    const store = new DemoPaymentParametersStore();
    expect((await refusal(save(writerFor(store), { tenant: { minDepositPercent: 50 }, reason: '   ' })))?.userMessage).toBe('Registra el motivo del cambio de parámetros.');
  });
  it('refuses a value outside its bounds or not whole, naming the record and the field', async () => {
    const store = new DemoPaymentParametersStore();
    expect((await refusal(save(writerFor(store), { tenant: { initialHoursTotal: 721 } })))?.userMessage)
      .toBe('Predeterminado del tenant: Plazo inicial · pago total (h) debe ser un entero entre 1 y 720.');
    expect((await refusal(save(writerFor(store), { services: { 'Tour 1': { minDepositPercent: 0 } } }, 'k2')))?.userMessage)
      .toBe('Tour 1: Abono mínimo (% del valor final) debe ser un entero entre 1 y 100.');
    expect((await refusal(save(writerFor(store), { tenant: { extensionHours: 2.5 } }, 'k3')))?.status).toBe(409);
    expect(store.config.tenant).toEqual({});
  });
  it('accepts a penalty of 0 and of 100 and refuses 101', async () => {
    const store = new DemoPaymentParametersStore();
    await save(writerFor(store), { tenant: { cancellationPenaltyPercent: 0 } });
    await save(writerFor(store), { tenant: { cancellationPenaltyPercent: 100 } }, 'k2');
    expect((await refusal(save(writerFor(store), { tenant: { cancellationPenaltyPercent: 101 } }, 'k3')))?.status).toBe(409);
  });
  it('refuses a save that changes nothing', async () => {
    const store = new DemoPaymentParametersStore();
    await save(writerFor(store), { tenant: { minDepositPercent: 50 } });
    expect((await refusal(save(writerFor(store), { tenant: { minDepositPercent: 50 } }, 'k2')))?.userMessage).toBe('No hay cambios que guardar.');
  });
  it('leaves one audit line per changed record with who, when, why and the values before and after', async () => {
    const store = new DemoPaymentParametersStore();
    await save(writerFor(store), { tenant: { minDepositPercent: 50 }, services: { 'Tour 2': { cancellationPenaltyPercent: 20 } } });
    const { audit, lastChange } = await view(store);
    expect(audit).toEqual([
      { at: NOW, actor: 'Administrador del tenant (demo)', record: 'Predeterminado del tenant', reason: 'política comercial de temporada', previous: 'hereda el predeterminado', next: 'Abono mínimo (%): 50' },
      { at: NOW, actor: 'Administrador del tenant (demo)', record: 'Tour 2', reason: 'política comercial de temporada', previous: 'hereda el predeterminado', next: 'Penalidad (%): 20' },
    ]);
    expect(lastChange).toEqual({ at: NOW, actor: 'Administrador del tenant (demo)' });
  });
  it('shows the tenant row first and what applies to each service', async () => {
    const store = new DemoPaymentParametersStore();
    await save(writerFor(store), { tenant: { initialHoursTotal: 48 }, services: { 'Tour 1': { initialHoursTotal: 12 } } });
    const rows = (await view(store)).rows;
    expect(rows.map((r) => [r.scope, r.service, r.applied.initialHoursTotal])).toEqual([['tenant', 'Predeterminado del tenant', 48], ['service', 'Tour 1', 12], ['service', 'Tour 2', 48]]);
    expect(rows[1].own).toEqual({ initialHoursTotal: 12 });
  });
  it('answers the same view to the same Idempotency-Key and writes one audit line only', async () => {
    const store = new DemoPaymentParametersStore(), writer = writerFor(store);
    const first = await save(writer, { tenant: { minDepositPercent: 50 } }, 'same');
    const again = await save(writer, { tenant: { minDepositPercent: 60 } }, 'same');
    expect(again).toBe(first);
    expect(store.audit).toHaveLength(1);
    expect(store.config.tenant).toEqual({ minDepositPercent: 50 });
  });
});

describe('changedParametersApplyOnlyToNewReservations', () => {
  it('keeps the parameters the reservation was created with and gives a new one the current ones', async () => {
    const store = new DemoPaymentParametersStore([{ id: 'RES-OLD', tourName: 'Tour 1' }]);
    await save(writerFor(store), { tenant: { initialHoursTotal: 10, minDepositPercent: 50 } });
    expect(store.forReservation({ id: 'RES-OLD', tourName: 'Tour 1' })).toEqual(SEED_PARAMETERS);
    expect(store.forReservation({ id: 'RES-NEW', tourName: 'Tour 1' })).toMatchObject({ initialHoursTotal: 10, minDepositPercent: 50 });
    await save(writerFor(store), { tenant: { initialHoursTotal: 20 } }, 'k2');
    expect(store.forReservation({ id: 'RES-NEW', tourName: 'Tour 1' }).initialHoursTotal).toBe(10);
  });
});

describe('theDeadlinesOf011AndThePenaltyOf013ReadThePaymentParameters', () => {
  const pending = (over = {}) => new DemoReservationsStore([reservationOf('RES-N', { departureDate: '2026-12-31', ...over })]);

  it('fixes the initial wait of a reservation from the parameters of its payment type', async () => {
    const store = pending({ paymentType: 'PARTIAL' }), parameters = new DemoPaymentParametersStore();
    await save(writerFor(parameters), { tenant: { initialHoursDeposit: 10, initialHoursTotal: 20 } });
    const deadline = await firstValueFrom(new DemoPaymentDeadlines(store, { now: () => Date.parse(NOW) } as unknown as Clock, parameters).deadlineOf('RES-N'));
    expect(Date.parse(deadline!.dueAt)).toBe(Date.parse(NOW) + 10 * 3_600_000);
  });
  it('keeps the 72-hour wait without a store of parameters', async () => {
    const deadline = await firstValueFrom(new DemoPaymentDeadlines(pending(), { now: () => Date.parse(NOW) } as unknown as Clock).deadlineOf('RES-N'));
    expect(Date.parse(deadline!.dueAt)).toBe(Date.parse(NOW) + 72 * 3_600_000);
  });
  it('caps the single extension at the parameter', async () => {
    const parameters = new DemoPaymentParametersStore([]);
    await save(writerFor(parameters), { tenant: { extensionHours: 5 } });
    const store = pending(), extender = new DemoPaymentDeadlineExtender(store, PortalCapabilities.for('TENANT_ADMINISTRATOR'), user, { now: () => Date.parse(NOW) } as unknown as Clock, new Map(), parameters);
    expect((await refusal(firstValueFrom(extender.extend({ reservationId: 'RES-N', hours: 6 } as never, 'e1'))))?.userMessage).toBe('La ampliación no puede superar 5 h (parámetro de pago del tenant).');
    expect((await firstValueFrom(extender.extend({ reservationId: 'RES-N', hours: 5 } as never, 'e2'))).deadline?.extension?.hours).toBe(5);
  });
  it('keeps the pending-policy answer of 013- until a penalty is defined, then retains that percentage on new reservations', async () => {
    const store = new DemoReservationsStore([reservationOf('RES-P', { validatedCents: 10_000_000 }), reservationOf('RES-Q', { validatedCents: 10_000_000 })]);
    const parameters = new DemoPaymentParametersStore([{ id: 'RES-P', tourName: 'Tour 1' }]);
    const quote = new DemoCancellationQuote(store, undefined, parameters);
    expect((await firstValueFrom(quote.quote('RES-P')))?.refundable).toEqual({ kind: 'pending-policy' });
    await save(writerFor(parameters), { tenant: { cancellationPenaltyPercent: 20 } });
    expect((await firstValueFrom(quote.quote('RES-P')))?.refundable).toEqual({ kind: 'pending-policy' });
    expect((await firstValueFrom(quote.quote('RES-Q')))?.refundable).toEqual({ kind: 'amount', cents: 8_000_000, penaltyCents: 2_000_000 });
    expect((await firstValueFrom(new DemoCancellationQuote(store, 0, parameters).quote('RES-P')))?.refundable).toEqual({ kind: 'amount', cents: 10_000_000, penaltyCents: 0 });
  });
  it('confirms an Abono at the minimum the parameters give, as the approval of a proof does', async () => {
    const parameters = new DemoPaymentParametersStore([]);
    await save(writerFor(parameters), { tenant: { minDepositPercent: 50 } });
    const proof = (id: string) => ({ id: `${id}-P1`, method: 'BANK_TRANSFER', amountCents: 10_000_000, proofName: 'p.pdf', proofStatus: 'EN_VALIDACION' as const, registeredBy: 'Cliente (demo)', presentedAt: NOW, appliedCents: undefined });
    const fixture = (id: string) => reservationOf(id, { paymentType: 'PARTIAL', paymentMethod: 'BANK_TRANSFER', quote: { ...reservationOf('x').quote, finalCents: THREE_HUNDRED_THOUSAND }, balanceCents: THREE_HUNDRED_THOUSAND, payments: [proof(id)] as never });
    const store = new DemoReservationsStore([fixture('RES-X')]);
    const writer = new DemoProofReviewWriter(store, PortalCapabilities.for('TENANT_ADMINISTRATOR'), user, { now: () => Date.parse(NOW) } as unknown as Clock, new Map(), undefined, parameters);
    const decided = await firstValueFrom(writer.decide({ reservationId: 'RES-X', paymentId: 'RES-X-P1', decision: 'APROBADO', verifiedAmountCents: 10_000_000, reason: '' } as never, 'd1'));
    expect(decided.status).toBe('PENDIENTE_DE_PAGO');
    const seed = new DemoReservationsStore([fixture('RES-Y')]);
    const seedWriter = new DemoProofReviewWriter(seed, PortalCapabilities.for('TENANT_ADMINISTRATOR'), user, { now: () => Date.parse(NOW) } as unknown as Clock, new Map());
    expect((await firstValueFrom(seedWriter.decide({ reservationId: 'RES-Y', paymentId: 'RES-Y-P1', decision: 'APROBADO', verifiedAmountCents: 10_000_000, reason: '' } as never, 'd2'))).status).toBe('CONFIRMADA');
  });
});

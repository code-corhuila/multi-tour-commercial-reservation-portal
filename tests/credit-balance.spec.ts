import { readFileSync } from 'node:fs';
import { Injector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { DemoCreditBalanceSource, DemoCreditBalanceWriter } from '../src/app/demo/credit-balance-demo';
import { CreditBalance, CreditBalanceSource, CreditBalanceWriter } from '../src/app/credit-balance/data/credit-balance-ports';
import { CREDIT_BALANCE_TREATMENT_ACTION, CreditBalanceActionComponent } from '../src/app/credit-balance/components/credit-balance-action.component';
import { CREDIT_BALANCE_COPY } from '../src/app/credit-balance/credit-balance-copy';
import { PortalNavigation } from '../src/app/portal-navigation';
import { REFUND_SCREENS, RefundsSource } from '../src/app/refunds/data/refunds-ports';
import { RefundTreatmentPageComponent } from '../src/app/refunds/pages/refund-treatment-page.component';
import { Reservation } from '../src/app/reservations/model/reservation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { REFUND_TREATMENT_ACTIONS, contribute } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-017 (#183): record and apply a credit balance. Invented data only.
const NOW = '2026-10-13T09:30:00-05:00';
/** The refund facts of HU-COM-016 for a cancellation for non-payment (T1), not yet decided. */
const factsOf = (cents: number, recognizedAt: string): Reservation['refund'] => ({ origin: 'NON_PAYMENT', reason: 'Cancelada por falta de pago', amountCents: cents, recognizedAt });
/** Within its 24 hours: $1.200.000 validated, recognized 5 h 18 min before NOW. */
const OPEN = reservationOf('RES-A', { status: 'CANCELADA', validatedCents: 120_000_000, refund: factsOf(120_000_000, '2026-10-13T04:12:00-05:00') });
/** Past its 24 hours: the default refund of HU-COM-016 AC6 closed it. */
const PAST = reservationOf('RES-B', { status: 'CANCELADA', validatedCents: 50_000_000, refund: factsOf(50_000_000, '2026-10-12T08:00:00-05:00') });
/** No treatment at all. */
const PLAIN = reservationOf('RES-C', { balanceCents: 30_000_000 });
const fixtures = () => new DemoReservationsStore([OPEN, PAST, PLAIN]);
const demo = (role = 'TENANT_ADMINISTRATOR', store = fixtures(), tenant = 'tenant-demo') => ({
  store, source: new DemoCreditBalanceSource(store, new FixedClock(NOW)),
  writer: new DemoCreditBalanceWriter(store, new FixedClock(NOW), PortalCapabilities.for(role), tenant),
});

/** A writer that answers only when the test decides. */
class ControllableWriter extends CreditBalanceWriter {
  readonly calls: { key: string; reply: (b: CreditBalance) => void; fail: () => void }[] = [];
  override recordFromTreatment(_reservationId: string, key: string): Observable<CreditBalance> {
    const answers = new Subject<CreditBalance>();
    this.calls.push({ key, reply: (b) => { answers.next(b); answers.complete(); }, fail: () => answers.error({ status: 503 }) });
    return answers;
  }
  override recordExcess(): never { throw new Error('not used'); }
  override apply(): never { throw new Error('not used'); }
  override requestRefund(): never { throw new Error('not used'); }
}

function providers(o: { role?: string; source?: CreditBalanceSource; writer?: CreditBalanceWriter } = {}) {
  const d = demo(o.role);
  const keys = new ControllableIdempotencyKeys();
  return { d, keys, list: [
    { provide: ActorContext, useValue: actorAs((o.role ?? 'TENANT_ADMINISTRATOR') as never) },
    { provide: CreditBalanceSource, useValue: o.source ?? d.source },
    { provide: CreditBalanceWriter, useValue: o.writer ?? d.writer },
    { provide: IdempotencyKeys, useValue: keys },
  ] as Provider[] };
}

async function action(o: Parameters<typeof providers>[0] & { id?: string; decided?: boolean } = {}) {
  const p = providers(o);
  TestBed.configureTestingModule({ providers: p.list });
  const fixture = TestBed.createComponent(CreditBalanceActionComponent);
  let changed = 0;
  fixture.componentRef.setInput('reservationId', o.id ?? 'RES-A');
  if (o.decided !== undefined) fixture.componentRef.setInput('decided', o.decided);
  fixture.componentRef.setInput('changed', () => { changed += 1; });
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  return { ...p, fixture, host, settle, button, changed: () => changed };
}
const RECORD = 'Registrar saldo a favor del 100 %';
const linesOf = (store: DemoReservationsStore) => store.creditBalances;

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('covers src/app/credit-balance/ with no HTTP client, request or storage of its own', () => {
    const files = listSourceFiles().filter((f) => f.startsWith('src/app/credit-balance/'));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /\bHttpClient\b|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(withoutComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('creditBalanceButtonRecordsAPendingBalanceOfAllValidatedValues', () => {
  it('records a pending credit balance of $1.200.000 with the person and the date, shows it and closes the button', async () => {
    const s = await action();
    s.button(RECORD)!.click(); await s.settle();
    expect(linesOf(s.d.store)).toEqual([expect.objectContaining({ reservationId: 'RES-A', amountCents: 120_000_000, origin: 'TRATAMIENTO', status: 'PENDIENTE',
      recordedBy: 'Administrador del tenant', recordedAt: NOW, appliedTo: null })]);
    const result = s.host.querySelector('[data-state="data"]')!;
    expect(result.getAttribute('aria-live')).toBe('polite');
    expect(result.querySelector('.crp-operator-status')?.textContent?.trim()).toBe('Saldo a favor pendiente');
    expect(Array.from(result.querySelectorAll('dl div'), (d) => [d.querySelector('dt')?.textContent?.trim(), d.querySelector('dd')?.textContent?.trim()])).toEqual([
      ['Monto', '$1.200.000'], ['Responsable', 'Administrador del tenant'], ['Fecha', '13 oct 2026'],
    ]);
    expect(s.button(RECORD)).toBeUndefined();
    expect(s.changed()).toBe(1);
  });

  it('shows the recorded balance, not the button, when the treatment is opened again', async () => {
    const p = providers();
    await firstValueFrom(p.d.writer.recordFromTreatment('RES-A', 'k-1'));
    const s = await action({ source: p.d.source, writer: p.d.writer });
    expect(s.button(RECORD)).toBeUndefined();
    expect(s.host.querySelector('[data-state="data"] .crp-operator-status')?.textContent?.trim()).toBe('Saldo a favor pendiente');
  });
});

describe('recordingACreditBalanceCreatesNoRefund', () => {
  it('leaves the reservation untouched: no refund, no executed state, only the credit balance line', async () => {
    const d = demo();
    const before = d.store.items.find((r) => r.id === 'RES-A');
    const line = await firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-1'));
    expect(d.store.items.find((r) => r.id === 'RES-A')).toBe(before);
    expect(line.status).toBe('PENDIENTE');
    expect((d.store as unknown as { refunds?: unknown[] }).refunds ?? []).toEqual([]);
    expect(JSON.stringify(d.store.creditBalances)).not.toMatch(/Ejecutada|refund/i);
  });

  it('offers no no-outflow operation and no application until DP-CB2 and DP-CB1 (T-03)', () => {
    const d = demo();
    expect('recordFromNoOutflow' in d.writer).toBe(false);
    expect('apply' in d.writer).toBe(false);
  });
});

describe('creditBalanceTextsAreSpanishAndAmountsUseFormatCop', () => {
  it('writes the copy of the mockup with accents and no raw codes', async () => {
    expect(CREDIT_BALANCE_COPY).toMatchObject({ record: RECORD, pending: 'Saldo a favor pendiente', amount: 'Monto', owner: 'Responsable', date: 'Fecha',
      loading: 'Cargando…', failed: 'No se pudo completar la solicitud.', retry: 'Reintentar' });
    const s = await action();
    expect(s.button(RECORD)?.className).toContain('crp-operator-outline');
    s.button(RECORD)!.click(); await s.settle();
    expect(s.host.textContent).toContain('$1.200.000');
    expect(s.host.textContent).not.toMatch(/TRATAMIENTO|PENDIENTE|120000000|RES-A|T\d{2}:/);
  });
});

describe('onlyTheTreatmentCapabilityOffersTheCreditBalanceButton', () => {
  it('grants the capability to the Administrator only (DP-CB3)', () => {
    const roles = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY'];
    expect(roles.map((r) => PortalCapabilities.for(r).canRegisterCreditBalance())).toEqual([true, false, false, false, false, false]);
  });

  for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT']) {
    it(`offers nothing to ${role}, and the writer refuses a direct call`, async () => {
      const s = await action({ role });
      expect(s.host.textContent?.trim()).toBe('');
      await expect(firstValueFrom(s.d.writer.recordFromTreatment('RES-A', 'k-1'))).rejects.toMatchObject({ status: 403 });
      expect(linesOf(s.d.store)).toEqual([]);
    });
  }
});

describe('anUnknownRoleLeavesTheTreatmentReadOnly', () => {
  it('draws nothing for a role the table does not know', async () => {
    const s = await action({ role: 'SOMETHING_ELSE' });
    expect(PortalCapabilities.for('SOMETHING_ELSE').canRegisterCreditBalance()).toBe(false);
    expect(s.host.querySelector('button')).toBeNull();
  });
});

describe('aDecidedTreatmentNoLongerOffersTheCreditBalance', () => {
  it('offers nothing when the host page says the refund was decided', async () => {
    const s = await action({ decided: true });
    expect(s.button(RECORD)).toBeUndefined();
  });

  it('offers nothing past the 24 hours (default of HU-COM-016 AC6), and the writer refuses', async () => {
    const s = await action({ id: 'RES-B' });
    expect(s.button(RECORD)).toBeUndefined();
    expect(await firstValueFrom(s.d.source.treatmentOf('RES-B'))).toMatchObject({ open: false, recorded: null });
    await expect(firstValueFrom(s.d.writer.recordFromTreatment('RES-B', 'k-1'))).rejects.toMatchObject({ status: 409 });
  });

  it('offers nothing for a reservation without a treatment', async () => {
    const s = await action({ id: 'RES-C' });
    expect(s.button(RECORD)).toBeUndefined();
    expect(await firstValueFrom(s.d.source.treatmentOf('RES-C'))).toBeNull();
  });

  it('refuses a second credit balance with another key once one is recorded', async () => {
    const d = demo();
    await firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-1'));
    await expect(firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-2'))).rejects.toMatchObject({ status: 409 });
    expect(linesOf(d.store)).toHaveLength(1);
  });
});

describe('aRetriedClickReusesItsKeyAndRecordsOneCreditBalance', () => {
  it('shows loading, then the error with Reintentar, and the retry travels with the same key', async () => {
    const writer = new ControllableWriter();
    const s = await action({ writer });
    s.button(RECORD)!.click(); await s.settle();
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando…');
    s.button(RECORD)?.click(); await s.settle();
    expect(writer.calls).toHaveLength(1);
    writer.calls[0].fail(); await s.settle();
    const error = s.host.querySelector('[data-state="error"]')!;
    expect(error.textContent).toContain('No se pudo completar la solicitud.');
    expect(document.activeElement).toBe(error);
    s.button('Reintentar')!.click(); await s.settle();
    expect(writer.calls.map((c) => c.key)).toEqual([s.keys.generated[0], s.keys.generated[0]]);
    expect(s.keys.generated).toHaveLength(1);
  });

  it('answers the same line for the same key and keeps one credit balance', async () => {
    const d = demo();
    const first = await firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-1'));
    const again = await firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-1'));
    expect(again).toBe(first);
    expect(linesOf(d.store)).toHaveLength(1);
  });
});

describe('approvedExcessBecomesACreditBalanceAppliedToNothing', () => {
  it('applies $300.000 of an approved $500.000 and keeps $200.000 as a credit balance applied to no reservation', async () => {
    const d = demo();
    const split = await firstValueFrom(d.writer.recordExcess(PLAIN, 50_000_000, 'k-1'));
    expect(split).toMatchObject({ appliedCents: 30_000_000, pendingCents: 0 });
    expect(split.excess).toMatchObject({ reservationId: 'RES-C', amountCents: 20_000_000, origin: 'EXCEDENTE', status: 'PENDIENTE', appliedTo: null });
    expect(linesOf(d.store)).toEqual([split.excess]);
    expect(await firstValueFrom(d.writer.recordExcess(PLAIN, 50_000_000, 'k-1'))).toBe(split);
    expect(linesOf(d.store)).toHaveLength(1);
  });

  it('records nothing when the approved value does not exceed the pending one', async () => {
    const d = demo();
    expect(await firstValueFrom(d.writer.recordExcess(PLAIN, 10_000_000, 'k-1'))).toEqual({ appliedCents: 10_000_000, pendingCents: 20_000_000, excess: null });
    expect(linesOf(d.store)).toEqual([]);
  });
});

describe('everyCreditBalanceCarriesTheSessionTenant', () => {
  it('stamps the tenant of the session on every line, from a treatment or from an excess', async () => {
    const d = demo('TENANT_ADMINISTRATOR', fixtures(), 'tenant-a');
    await firstValueFrom(d.writer.recordFromTreatment('RES-A', 'k-1'));
    await firstValueFrom(d.writer.recordExcess(PLAIN, 50_000_000, 'k-2'));
    expect(linesOf(d.store).map((l) => l.tenant)).toEqual(['tenant-a', 'tenant-a']);
  });
});

describe('contributesToTheTreatmentPageOfHuCom016', () => {
  it('draws the button on the treatment page of RES-1821 ($1.200.000) and, once recorded, closes both buttons', async () => {
    const navigation = new PortalNavigation();
    navigation.register([REFUND_SCREENS.requests, REFUND_SCREENS.treatment, REFUND_SCREENS.detail]);
    navigation.params.set({ refund: 'RES-1821' });
    TestBed.configureTestingModule({ providers: [...demoSources({} as never), { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
      { provide: PortalNavigation, useValue: navigation }, contribute(REFUND_TREATMENT_ACTIONS, CREDIT_BALANCE_TREATMENT_ACTION)] });
    const fixture = TestBed.createComponent(RefundTreatmentPageComponent);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle();
    const host: HTMLElement = fixture.nativeElement;
    const buttons = () => Array.from(host.querySelectorAll('.crp-form-actions button'), (b) => b.textContent?.trim());
    expect(host.textContent).toContain('Valores abonados: $1.200.000');
    expect(buttons()).toEqual(['Registrar devolución del 100 %', RECORD]);
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === RECORD)!.click(); await settle();
    expect(buttons()).toEqual([]);
    expect(host.querySelector('app-credit-balance-action [data-state="data"]')?.textContent).toContain('$1.200.000');
    expect(await firstValueFrom(TestBed.inject(CreditBalanceSource).treatmentOf('RES-1820'))).toMatchObject({ open: false });
    expect((await firstValueFrom(TestBed.inject(RefundsSource).list())).map((r) => r.id)).not.toContain('RES-1821');
  });

  it('is contributed in mount-entry.ts only when the credit balance ports exist', () => {
    const entry = withoutComments(readFileSync('src/mount-entry.ts', 'utf8'));
    expect(entry).toContain('contribute(REFUND_TREATMENT_ACTIONS, CREDIT_BALANCE_TREATMENT_ACTION)');
    const available = CREDIT_BALANCE_TREATMENT_ACTION.isAvailable!;
    expect(available(Injector.create({ providers: [] }))).toBe(false);
    expect(available(Injector.create({ providers: [{ provide: CreditBalanceSource, useValue: demo().source }] }))).toBe(true);
  });
});

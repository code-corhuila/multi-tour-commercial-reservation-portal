import { Injector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { API_BASE } from '../src/app/http/api-paths';
import { ModificationApiHistory } from '../src/app/http/modification-api-sources';
import { MODIFICATION_HISTORY_BLOCK, ModificationHistoryComponent } from '../src/app/reservation-changes/travellers-modification/components/modification-history.component';
import { ModificationHistorySource, ModificationTrace } from '../src/app/reservation-changes/travellers-modification/data/modification-ports';
import { DemoModificationHistory } from '../src/app/demo/reservation-modification-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { sourceProviders } from '../src/app/sources';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { fakeClient, page } from './api-client.double';
import { reservationOf } from './reservations.double';

// HU-COM-012 AC-MD.6 (portal spec 012, RN-MD8): the modifications registered on a reservation, in 10A, with the original value, the recalculated
// value, the resulting balance, the cause and the user. The service holds them; the portal reads them and adds nothing up.
const path = `${API_BASE}/reservations/r-1/modifications?page=1&limit=100`;
const record = (over: Record<string, unknown> = {}) => ({ modificationId: 'm-1', reservationId: 'r-1', changeType: 'MODIFICATION', people: 2, originalFinalValueCents: 300000,
  newFinalValueCents: 200000, resultingPendingBalanceCents: 0, excessCents: 50000, seatDelta: -1, excessDecisionOpened: true, reservationStatus: 'PENDING_PAYMENT',
  paymentStatus: 'PARTIAL', reason: 'Un viajero menos', modifiedBy: 'u-1', modifiedAt: '2026-11-04T10:00:00-05:00', ...over });
const trace = (over: Partial<ModificationTrace> = {}): ModificationTrace => ({ reservationCode: 'r-1', originalCents: 42_500_000, recalculatedCents: 85_000_000,
  balanceCents: 85_000_000, differenceCents: 42_500_000, cause: 'Se suma un viajero', by: 'Colaborador operativo (demo)', at: '2026-10-12T15:30:00-05:00', decision: null, ...over });

describe('modificationHistoryOverTheApiClient', () => {
  it('reads the history of the reservation from the service and keeps its order, newest first', async () => {
    const { client, calls } = fakeClient({ ok: page([record({ modificationId: 'm-2', newFinalValueCents: 100000, modifiedAt: '2026-11-05T09:00:00-05:00' }), record()]) });
    const rows = await firstValueFrom(new ModificationApiHistory(client).list('r-1'));
    expect(calls).toEqual([{ path }]);
    expect(rows.map((r) => r.recalculatedCents)).toEqual([100000, 200000]);
    expect(rows[1]).toEqual({ reservationCode: 'r-1', originalCents: 300000, recalculatedCents: 200000, balanceCents: 0, differenceCents: -100000, cause: 'Un viajero menos',
      by: 'u-1', at: '2026-11-04T10:00:00-05:00', decision: { kind: 'MODIFICATION_EXCESS', excessCents: 50000, outcome: null } });
  });

  it('answers an empty history for a reservation the service does not know and hands any other failure to the page', async () => {
    const missing = fakeClient({ fail: { status: 404, code: 'NOT_FOUND', message: 'none', traceId: 't' } });
    expect(await firstValueFrom(new ModificationApiHistory(missing.client).list('r-1'))).toEqual([]);
    const denied = fakeClient({ fail: { status: 403, code: 'FORBIDDEN', message: 'no', traceId: 't' } });
    await expect(firstValueFrom(new ModificationApiHistory(denied.client).list('r-1'))).rejects.toMatchObject({ status: 403 });
  });

  it('is registered in the container build and in the demo build', () => {
    const withPort = (list: Provider[]) => list.some((p) => (p as { provide?: unknown }).provide === ModificationHistorySource);
    expect(withPort(sourceProviders(fakeClient().client))).toBe(true);
    expect(withPort(demoSources(fakeClient().client))).toBe(true);
  });
});

describe('modificationHistoryOfTheDemo', () => {
  it('lists the traces of the store for the reservation, newest first', async () => {
    const store = new DemoReservationsStore([]);
    store.modifications.push(trace({ at: '2026-10-12T15:30:00-05:00' }), trace({ reservationCode: 'other' }), trace({ at: '2026-10-14T09:00:00-05:00', cause: 'Otro viajero' }));
    const rows = await firstValueFrom(new DemoModificationHistory(store).list('r-1'));
    expect(rows.map((r) => r.cause)).toEqual(['Otro viajero', 'Se suma un viajero']);
  });

  it('carries one seeded modification on a demo reservation, so the screen shows data', async () => {
    TestBed.configureTestingModule({ providers: demoSources(fakeClient().client) });
    const source = TestBed.inject(ModificationHistorySource);
    const rows = await firstValueFrom(source.list('RES-1842'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ originalCents: 42_500_000, recalculatedCents: 85_000_000, balanceCents: 85_000_000 });
    expect(await firstValueFrom(source.list('RES-1841'))).toEqual([]);
  });
});

class Controllable extends ModificationHistorySource {
  readonly requests: Subject<readonly ModificationTrace[]>[] = [];
  override list(): Observable<readonly ModificationTrace[]> { const s = new Subject<readonly ModificationTrace[]>(); this.requests.push(s); return s; }
}
const rowsOf = (rows: readonly ModificationTrace[]): ModificationHistorySource => ({ list: () => of(rows) });

async function draw(source: ModificationHistorySource, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: [{ provide: ModificationHistorySource, useValue: source }] });
  const fixture = TestBed.createComponent(ModificationHistoryComponent);
  fixture.componentRef.setInput('reservation', reservationOf('r-1', {}));
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  return { host: fixture.nativeElement as HTMLElement, settle };
}

describe('modificationHistoryBlockShowsTheStates', () => {
  it('shows the columns and the formatted values of each registered modification', async () => {
    const s = await draw(rowsOf([trace()]));
    const text = Array.from(s.host.querySelectorAll('p, h2, td'), (e) => e.textContent?.trim()).join(' ');
    expect(Array.from(s.host.querySelectorAll('th'), (e) => e.textContent)).toEqual(['Fecha', 'Valor original', 'Valor recalculado', 'Saldo resultante', 'Causal', 'Registrado por']);
    expect(text).toContain('Historial Modificaciones registradas');
    expect(text).toContain('12 oct 2026 · 15:30 $425.000 $850.000 $850.000 Se suma un viajero Colaborador operativo (demo)');
    expect(text).not.toMatch(/undefined|null|NaN|MODIFICATION/);
  });

  it('shows loading, then an error with a retry that asks again, then the data', async () => {
    const source = new Controllable();
    const s = await draw(source);
    expect(s.host.querySelector('[data-state="loading"]')?.textContent).toContain('Cargando');
    source.requests[0].error(new Error('down')); await s.settle();
    expect(s.host.querySelector('[data-state="error"]')?.textContent).toContain('No se pudo completar la solicitud.');
    (s.host.querySelector('[data-state="error"] button') as HTMLButtonElement).click(); await s.settle();
    expect(source.requests).toHaveLength(2);
    source.requests[1].next([trace()]); await s.settle();
    expect(s.host.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('draws nothing when the reservation has no registered modification and nothing on 10C', async () => {
    expect((await draw(rowsOf([]))).host.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    expect((await draw(rowsOf([trace()]), { fresh: true })).host.textContent?.trim()).toBe('');
  });

  it('is offered only when the build supplies the history source', () => {
    TestBed.configureTestingModule({ providers: [] });
    expect(MODIFICATION_HISTORY_BLOCK.isAvailable?.(TestBed.inject(Injector))).toBe(false);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ModificationHistorySource, useValue: new Controllable() }] });
    expect(MODIFICATION_HISTORY_BLOCK.isAvailable?.(TestBed.inject(Injector))).toBe(true);
  });
});

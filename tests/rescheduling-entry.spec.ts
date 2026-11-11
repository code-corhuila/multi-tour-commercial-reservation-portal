import { Injector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalNavigation } from '../src/app/portal-navigation';
import { DemoDeparturesStore, DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { RESCHEDULING_SEEDS } from '../src/app/demo/rescheduling-seeds';
import { DemoReschedulingDeadlines, DemoReschedulingSource, DemoReschedulingWriter } from '../src/app/demo/rescheduling-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { Reservation } from '../src/app/reservations/model/reservation';
import { RESCHEDULING_AREA, ReschedulingSource, ReschedulingWriter } from '../src/app/rescheduling/data/rescheduling-ports';
import { RESCHEDULING_ENTRIES, ReschedulingBoxComponent, ReschedulingRowActionComponent } from '../src/app/rescheduling/components/rescheduling-entry.component';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { RESERVATION_DETAIL_ACTIONS, RESERVATION_DETAIL_BLOCKS, RESERVATION_ROW_ACTIONS } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 T-10 (AC-RP.14, DP-RP4 changed by the mockup PDR v1.9): the operator enters admin-reprogramar-reserva.html from the box "Gestionar la reprogramación" of 10A
// (RESERVATION_DETAIL_BLOCKS) and from the row action "Reprogramar" of 10 (RESERVATION_ROW_ACTIONS), and returns to that 10A. The header button of 2026-10-13 is gone.
const clock = new FixedClock('2026-10-13T09:30:00-05:00');
function setup(role: string, extra: readonly Reservation[] = []) {
  const store = new DemoReservationsStore([...RESCHEDULING_SEEDS, ...extra]);
  const source = new DemoReschedulingSource(store, new DemoDeparturesStore(), new DemoReschedulingDeadlines(clock));
  const navigation = new PortalNavigation();
  navigation.register(['reservations', RESCHEDULING_AREA]);
  TestBed.configureTestingModule({ providers: [
    { provide: ActorContext, useValue: actorAs(role as ActorRole) },
    { provide: ReschedulingSource, useValue: source },
    { provide: ReschedulingWriter, useValue: new DemoReschedulingWriter(source, clock, 'Colaborador operativo') },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
  ] as Provider[] });
  return { store, navigation };
}
async function entry(role: string, code: string, extra: readonly Reservation[] = [], row = false) {
  const s = setup(role, extra);
  const fixture = TestBed.createComponent(row ? ReschedulingRowActionComponent : ReschedulingBoxComponent);
  fixture.componentRef.setInput('reservation', s.store.items.find((r) => r.id === code)!);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return { ...s, host, button: () => host.querySelector('button') };
}

describe('withoutTheCapabilityOrWithAnUnknownRoleNoActionIsOffered', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'])('%s sees the box "Gestionar la reprogramación" in 10A of an open episode, and it opens the screen of that reservation', async (role) => {
    const s = await entry(role, 'RES-1828');
    expect(s.button()?.textContent?.trim()).toBe('Gestionar la reprogramación');
    expect(s.button()?.classList).toContain('crp-operator-primary');
    expect(s.button()?.classList).not.toContain('crp-page-header-action');
    s.button()!.click();
    expect(s.navigation.selected()).toBe(RESCHEDULING_AREA);
    expect(s.navigation.params()).toEqual({ reservation: 'RES-1828' });
  });

  it.each(['MANAGER', 'ANALYST', 'ACCOUNTANT', 'ROL_DESCONOCIDO'])('%s gets no entry', async (role) => {
    expect((await entry(role, 'RES-1828')).button()).toBeNull();
  });

  it('offers no entry for a reservation without an episode, nor for an episode already closed', async () => {
    expect((await entry('TENANT_ADMINISTRATOR', 'RES-T0', [reservationOf('RES-T0')])).button()).toBeNull();
    TestBed.resetTestingModule();
    const closed = { ...RESCHEDULING_SEEDS[1], id: 'RES-T1', status: 'CANCELADA' as const,
      reschedulingEpisode: { ...RESCHEDULING_SEEDS[1].reschedulingEpisode!, answer: { decision: 'NO_ALTERNATIVE' as const, at: clock.now(), by: 'Administrador' } } };
    expect((await entry('TENANT_ADMINISTRATOR', 'RES-T1', [closed])).button()).toBeNull();
  });

  it('draws "Reprogramar" after "Ver detalle" in 10 only for an open episode and the capability, and opens that reservation', async () => {
    const s = await entry('OPERATIONAL_COLLABORATOR', 'RES-1829', [], true);
    expect(s.button()?.textContent?.trim()).toBe('Reprogramar');
    s.button()!.click();
    expect(s.navigation.params()).toEqual({ reservation: 'RES-1829' });
    TestBed.resetTestingModule();
    expect((await entry('ANALYST', 'RES-1829', [], true)).button()).toBeNull();
  });

  it('is contributed to the blocks of 10A and the row actions of 10, not to the header, only with the rescheduling ports', () => {
    type Entry = { provide: unknown; multi: boolean; useValue: { component: unknown; isAvailable: (i: Injector) => boolean } };
    const entries = RESCHEDULING_ENTRIES as unknown as Entry[];
    expect(entries.map((e) => [e.provide, e.useValue.component])).toEqual([[RESERVATION_DETAIL_BLOCKS, ReschedulingBoxComponent], [RESERVATION_ROW_ACTIONS, ReschedulingRowActionComponent]]);
    expect(entries.some((e) => e.provide === RESERVATION_DETAIL_ACTIONS)).toBe(false);
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }] });
    expect(entries.every((e) => e.useValue.isAvailable(TestBed.inject(Injector)) === false)).toBe(true);
  });
});

describe('reschedulingTextsAreSpanishAndUseFormatCopAndFormatDate', () => {
  it('Volver a reservas returns to 10A of the same reservation', async () => {
    const s = setup('OPERATIONAL_COLLABORATOR');
    s.navigation.params.set({ reservation: 'RES-1828' });
    const fixture = TestBed.createComponent(ReschedulingPageComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Volver a reservas')!.click();
    expect(s.navigation.selected()).toBe('reservations');
    expect(s.navigation.params()).toEqual({ reservation: 'RES-1828' });
  });
});

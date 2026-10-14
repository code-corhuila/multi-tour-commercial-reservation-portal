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
import { RESCHEDULING_ENTRY, ReschedulingEntryComponent } from '../src/app/rescheduling/components/rescheduling-entry.component';
import { ReschedulingPageComponent } from '../src/app/rescheduling/pages/rescheduling-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { RESERVATION_DETAIL_ACTIONS } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-018 DP-RP4, decided by the owner on 2026-10-13 (PROPUESTO until the teacher confirms): the operator enters
// admin-reprogramar-reserva.html from the 10A header, through RESERVATION_DETAIL_ACTIONS, and returns to that 10A.
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
async function entry(role: string, code: string, extra: readonly Reservation[] = []) {
  const s = setup(role, extra);
  const fixture = TestBed.createComponent(ReschedulingEntryComponent);
  fixture.componentRef.setInput('reservation', s.store.items.find((r) => r.id === code)!);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const host: HTMLElement = fixture.nativeElement;
  return { ...s, host, button: () => host.querySelector('button') };
}

describe('withoutTheCapabilityOrWithAnUnknownRoleNoActionIsOffered', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR'])('%s sees "Propuesta de reprogramación" in 10A of an open episode, and it opens the screen of that reservation', async (role) => {
    const s = await entry(role, 'RES-1828');
    expect(s.button()?.textContent?.trim()).toBe('Propuesta de reprogramación');
    expect(s.button()?.classList).toContain('crp-page-header-action');
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

  it('is contributed to the 10A header after "Cancelar o modificar reserva" of HU-COM-013, only with the rescheduling ports', () => {
    const p = RESCHEDULING_ENTRY as { provide: unknown; multi: boolean; useValue: { component: unknown; order: number; isAvailable: (i: Injector) => boolean } };
    expect([p.provide, p.multi, p.useValue.component, p.useValue.order]).toEqual([RESERVATION_DETAIL_ACTIONS, true, ReschedulingEntryComponent, 0.5]);
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }] });
    expect(p.useValue.isAvailable(TestBed.inject(Injector))).toBe(false);
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

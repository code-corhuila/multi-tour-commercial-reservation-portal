import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PROOF_REVIEW_CONTRIBUTIONS, ProofDetailActionComponent, ProofRowLinkComponent } from '../src/app/payments/components/proof-review-actions.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { PortalSlot, RESERVATION_DETAIL_ACTIONS } from '../src/app/shared/portal-slots';
import type { MountProps, PortalApiClient } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { actorAs } from './actor-context.double';

// HU-COM-010, second pull request (spec 010-, tasks T-07, AC-PV.3): the "Validar soporte" links of 10 (RESERVATION_ROW_ACTIONS)
// and 10A (RESERVATION_DETAIL_ACTIONS). Seeded: RES-1833 has a $100.000 proof En validación; RES-1842 has none.
const EXAMPLE = 'RES-1833';
const TOTAL = 'RES-1842';
const flat = (element: HTMLElement) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

function providers(role = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation();
  navigation.register(['payments', 'payments-validate', 'reservations']);
  return [
    { provide: ActorContext, useValue: actorAs(role as never) },
    { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: PortalNavigation, useValue: navigation },
  ];
}
async function reservation(id: string): Promise<Reservation> {
  TestBed.configureTestingModule({ providers: providers() });
  const r = (await firstValueFrom(TestBed.inject(ReservationsSource).list())).find((x) => x.id === id)!;
  TestBed.resetTestingModule();
  return r;
}
async function drawn<T>(component: Type<T>, r: Reservation, role?: string) {
  TestBed.configureTestingModule({ providers: providers(role) });
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('reservation', r);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement, navigation = TestBed.inject(PortalNavigation);
  const press = (label: string) => Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!.click();
  return { element, navigation, press };
}

afterEach(() => TestBed.resetTestingModule());

describe('the Validar soporte links of 10 and 10A (T-07, second pull request)', () => {
  it('validateLinkAppearsOnlyForProofsUnderValidation (AC-PV.3)', async () => {
    const example = await reservation(EXAMPLE), plain = await reservation(TOTAL);
    const row = await drawn(ProofRowLinkComponent, example);
    expect(flat(row.element)).toBe('· Validar soporte');
    row.press('Validar soporte');
    expect(row.navigation.selected()).toBe('payments-validate');
    expect(row.navigation.params()).toEqual({ reservation: EXAMPLE, payment: `${EXAMPLE}-P1` });
    TestBed.resetTestingModule();
    expect(flat((await drawn(ProofRowLinkComponent, plain)).element)).toBe('');
    TestBed.resetTestingModule();
    const detail = await drawn(ProofDetailActionComponent, example);
    detail.press('Validar soporte');
    expect(detail.navigation.params()).toEqual({ reservation: EXAMPLE, payment: `${EXAMPLE}-P1` });
    TestBed.resetTestingModule();
    expect((await drawn(ProofDetailActionComponent, plain)).element.querySelector('button')).toBeNull();
    TestBed.resetTestingModule();
    expect(flat((await drawn(ProofRowLinkComponent, example, 'ANALYST')).element)).toBe('· Ver soporte');
  });

  it('orders Validar soporte of 10A explicitly after Cancelar o modificar reserva (order 0 of 013) and before later actions (order 1)', () => {
    const slot = (PROOF_REVIEW_CONTRIBUTIONS as { provide: unknown; useValue: PortalSlot }[]).find((p) => p.provide === RESERVATION_DETAIL_ACTIONS)!.useValue;
    expect(slot.order).toBeGreaterThan(0);
    expect(slot.order).toBeLessThan(1);
  });

  it('the demo build draws Validar soporte after Ver detalle in the row of 10', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const props: MountProps = { apiClient: { request: vi.fn() } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } };
    const cleanup = entry.mountWith(host, props, (client: PortalApiClient) => demoSources(client));
    try {
      await vi.waitFor(() => expect(host.querySelector('nav button')).toBeTruthy());
      Array.from(host.querySelectorAll<HTMLButtonElement>('nav button')).find((b) => b.textContent?.trim() === 'Reservas')!.click();
      await vi.waitFor(() => expect(host.querySelector('app-reservations-page [data-state="data"] tbody tr')).toBeTruthy());
      const row = Array.from(host.querySelectorAll('app-reservations-page tbody tr')).find((tr) => tr.textContent?.includes(`#${EXAMPLE}`))!;
      expect(row.querySelector('td:last-child')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Ver detalle · Validar soporte');
    } finally { cleanup(); host.remove(); }
  });
});

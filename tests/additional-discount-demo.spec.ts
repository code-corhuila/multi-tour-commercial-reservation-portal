import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoAdditionalDiscountContexts, DemoAdditionalDiscountWriter } from '../src/app/demo/current-discounts-demo';
import { DemoRefundsSource } from '../src/app/demo/refunds-demo';
import { DemoReservationsStore } from '../src/app/demo/reservations-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import * as entry from '../src/mount-entry';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { reservationOf } from './reservations.double';

// HU-COM-004 amendment 2026-10-14: the demo ports keep the additional discount on the reservation of the one store of HU-COM-007.
class Admin extends RegisteringUser { override label() { return 'Administrador demo'; } }
const worth = (finalCents: number, over = {}) => reservationOf('RES-A', { quote: { services: [], transportCents: 0, projectedCents: finalCents, discounts: [], discountCents: 0, finalCents }, balanceCents: finalCents, ...over });
const setup = (items = [worth(10_000_000, { validatedCents: 4_000_000, balanceCents: 6_000_000 }), worth(10_000_000, { id: 'RES-X', status: 'CANCELADA' })]) => {
  const store = new DemoReservationsStore(items);
  return { store, contexts: new DemoAdditionalDiscountContexts(store), writer: new DemoAdditionalDiscountWriter(store, new FixedClock('2026-10-15T10:00:00-05:00'), new Admin()) };
};
const refusal = async (answer: Promise<unknown>) => answer.then(() => null, (e: { status: number; code: string }) => e);

describe('theDemoContextAnswersWhatTheScreenFormats', () => {
  it('resolves the facts, the cap, the eligibility and the preview from the reservation', async () => {
    const { contexts } = setup();
    expect(await firstValueFrom(contexts.of('RES-A'))).toEqual({ reservationId: 'RES-A', customerName: 'Lead Demo', serviceName: 'Tour 1', currentValueCents: 10_000_000,
      generalDiscountCents: 0, paidCents: 4_000_000, capBasisPoints: 2000, eligible: true, stateLabel: 'Pendiente de pago' });
    expect(await firstValueFrom(contexts.of('RES-X'))).toMatchObject({ eligible: false, stateLabel: 'Cancelada' });
    expect(await firstValueFrom(contexts.of('NOPE'))).toBeNull();
    expect(await firstValueFrom(contexts.preview('RES-A', 1250))).toEqual({ newValueCents: 8_750_000, excessCents: 0 });
    expect(await firstValueFrom(contexts.preview('RES-A', 1))).toEqual({ newValueCents: 9_999_000, excessCents: 0 });
  });
});

describe('theDemoWriterStoresTheDiscountOnTheReservation', () => {
  it('lowers the final value and keeps the percentage, the reason, the person and the previous value', async () => {
    const { store, contexts, writer } = setup();
    const applied = await firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 1000, reason: 'Fidelización' }, 'k1'));
    expect(applied).toMatchObject({ reservationId: 'RES-A', percentageBasisPoints: 1000, reason: 'Fidelización', appliedBy: 'Administrador demo',
      appliedAt: '2026-10-15T10:00:00-05:00', previousValueCents: 10_000_000, amountCents: 1_000_000, newValueCents: 9_000_000, excessCents: 0 });
    const stored = store.items.find((r) => r.id === 'RES-A')!;
    expect(stored.quote.finalCents).toBe(9_000_000);
    expect(stored.additionalDiscount).toEqual({ basisPoints: 1000, reason: 'Fidelización', appliedBy: 'Administrador demo', appliedAt: '2026-10-15T10:00:00-05:00',
      previousValueCents: 10_000_000, amountCents: 1_000_000 });
    expect(await firstValueFrom(contexts.of('RES-A'))).toMatchObject({ eligible: false, currentValueCents: 9_000_000,
      applied: { basisPoints: 1000, appliedAt: '2026-10-15T10:00:00-05:00', appliedBy: 'Administrador demo' } });
  });

  it('records one discount per Idempotency-Key', async () => {
    const { store, writer } = setup();
    const command = { reservationId: 'RES-A', percentageBasisPoints: 1000, reason: 'Fidelización' };
    const first = await firstValueFrom(writer.register(command, 'k1'));
    expect(await firstValueFrom(writer.register(command, 'k1'))).toEqual(first);
    expect(store.items.find((r) => r.id === 'RES-A')!.quote.finalCents).toBe(9_000_000);
  });

  it('refuses a percentage above the cap, a closed reservation, an unknown one and a second discount', async () => {
    const { writer } = setup();
    expect(await refusal(firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 2001, reason: 'x' }, 'k1')))).toMatchObject({ status: 422, code: 'additional-discount-cap' });
    expect(await refusal(firstValueFrom(writer.register({ reservationId: 'RES-X', percentageBasisPoints: 500, reason: 'x' }, 'k2')))).toMatchObject({ status: 409, code: 'additional-discount-state' });
    expect(await refusal(firstValueFrom(writer.register({ reservationId: 'NOPE', percentageBasisPoints: 500, reason: 'x' }, 'k3')))).toMatchObject({ status: 404 });
    await firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 500, reason: 'x' }, 'k4'));
    expect(await refusal(firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 500, reason: 'y' }, 'k5')))).toMatchObject({ status: 409, code: 'additional-discount-already-applied' });
  });
});

describe('anExcessBelowWhatIsPaidOpensThePendingTreatment', () => {
  const clock = new FixedClock('2026-10-15T10:00:00-05:00');
  it('records the excess as a refund of origin lower value that waits for the 24-hour decision', async () => {
    const { store, writer } = setup([worth(10_000_000, { validatedCents: 9_000_000, balanceCents: 1_000_000 })]);
    const applied = await firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 2000, reason: 'Compensación por inconveniente' }, 'k1'));
    expect(applied).toMatchObject({ newValueCents: 8_000_000, excessCents: 1_000_000 });
    expect(store.items[0].refund).toMatchObject({ origin: 'LOWER_VALUE', amountCents: 1_000_000, recognizedAt: '2026-10-15T10:00:00-05:00',
      reason: 'Descuento adicional del 20 %: Compensación por inconveniente' });
    const refunds = await firstValueFrom(new DemoRefundsSource(store, clock).list());
    expect(refunds).toEqual([expect.objectContaining({ id: 'RES-A', state: 'PENDIENTE_DE_DECISION', amountCents: 1_000_000 })]);
  });

  it('opens no treatment when what is paid does not exceed the new value', async () => {
    const { store, writer } = setup();
    await firstValueFrom(writer.register({ reservationId: 'RES-A', percentageBasisPoints: 500, reason: 'Fidelización' }, 'k1'));
    expect(store.items[0].refund).toBeUndefined();
  });
});

describe('currentDiscountsAreWiredInTheMountEntry', () => {
  let host: HTMLElement; let cleanup: () => void;
  afterEach(() => { cleanup(); host.remove(); });
  it('reaches the screen through Descuentos, Buscar una reserva and Aplicar descuento, with the in-memory demo data', async () => {
    host = document.createElement('div'); document.body.append(host);
    const request = vi.fn(async () => ({ data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } }));
    cleanup = entry.mountWith(host, { apiClient: { request } as never, session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined } }, demoSources);
    await vi.waitFor(() => expect(host.querySelector('nav')).toBeTruthy());
    const press = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!.dispatchEvent(new Event('click'));
    expect(Array.from(host.querySelectorAll('nav button')).map((b) => b.textContent?.trim())).not.toContain('Descuentos vigentes');
    press('Descuentos');
    await vi.waitFor(() => expect(host.textContent).toContain('Buscar una reserva'));
    press('Buscar una reserva');
    await vi.waitFor(() => expect(host.textContent).toContain('Selecciona la reserva a la que deseas aplicar un descuento adicional.'));
    await vi.waitFor(() => expect(Array.from(host.querySelectorAll('tbody button')).some((b) => b.textContent?.trim() === 'Aplicar descuento')).toBe(true));
    Array.from(host.querySelectorAll('tbody button')).find((b) => b.textContent?.trim() === 'Aplicar descuento')!.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(host.textContent).toContain('Contexto de la reserva'));
    expect(host.querySelector('form')).not.toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PaymentDeadlineApiReader } from '../src/app/http/payments-api-sources';
import { PaymentDeadline, PaymentDeadlineReader } from '../src/app/payments/data/payment-followup-ports';
import { PaymentFollowupPageComponent } from '../src/app/payments/pages/payment-followup-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { Clock } from '../src/app/shared/clock';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { fakeClient } from './api-client.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-011 (code-corhuila/multi-tour-docs, issue 177), AC-PP.12 and AC-PP.11: a deadline the service froze (the departure was cancelled or interrupted
// for a cause not attributable to the customer) is read frozen, is not recomputed on the follow-up screen, and takes no extension.
const NOW = Date.parse('2026-10-13T09:00:00-05:00');
class FixedClock extends Clock { override now(): number { return NOW; } }
const FROZEN = 'Plazo congelado: la salida fue cancelada o interrumpida por una causa no atribuible al cliente (la reserva se gestiona con la reprogramación).';
const wire = { reservationId: 'r-1', kind: 'INITIAL', dueAt: '2026-11-10T09:00:00-05:00', departureStartsAt: '2026-11-12T06:30:00-05:00',
  effectiveDeadline: '2026-11-10T09:00:00-05:00', frozen: false };
const flat = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

class StubDeadlines extends PaymentDeadlineReader {
  constructor(private readonly answer: PaymentDeadline) { super(); }
  override deadlineOf() { return of(this.answer); }
}
function following(id: string, answer: PaymentDeadline, role = 'TENANT_ADMINISTRATOR') {
  const navigation = new PortalNavigation(); navigation.params.set({ reservation: id });
  return screenOf(PaymentFollowupPageComponent, [
    { provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(),
    { provide: PaymentDeadlineReader, useValue: new StubDeadlines(answer) },
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() }, { provide: Clock, useValue: new FixedClock() },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation },
  ]);
}
const deadlineField = (element: Element) => element.querySelector<HTMLInputElement>('#crp-payment-followup-deadline')!.value;

afterEach(() => TestBed.resetTestingModule());

describe('aFrozenDeadlineIsReadFromTheService', () => {
  it('hands the frozen mark of the service over and leaves it out when the deadline runs', async () => {
    const frozen = fakeClient({ ok: { ...wire, frozen: true, freezeCause: 'DEPARTURE_CANCELLED', remainingAtFreezeMinutes: 90 } });
    expect(await firstValueFrom(new PaymentDeadlineApiReader(frozen.client).deadlineOf('r-1')))
      .toEqual({ dueAt: wire.effectiveDeadline, departureStartsAt: wire.departureStartsAt, frozen: true });
    const running = fakeClient({ ok: wire });
    expect(await firstValueFrom(new PaymentDeadlineApiReader(running.client).deadlineOf('r-1'))).toEqual({ dueAt: wire.effectiveDeadline, departureStartsAt: wire.departureStartsAt });
  });
});

describe('aFrozenDeadlineIsNotRecomputedAndTakesNoExtension', () => {
  const running: PaymentDeadline = { dueAt: '2026-10-16T09:00:00-05:00', departureStartsAt: '2026-11-07T00:00:00-05:00' };

  it('writes the frozen sentence in "Plazo de pago vigente" instead of a date, and offers no "Ampliación del plazo"', async () => {
    const { element } = await following('RES-1842', { ...running, frozen: true });
    expect(deadlineField(element)).toBe(FROZEN);
    expect(flat(element)).not.toContain('Ampliación del plazo');
    expect(element.querySelector('[name="extensionHours"]')).toBeNull();
  });

  it('keeps the date and the extension panel when the deadline is not frozen', async () => {
    const { element } = await following('RES-1842', running);
    expect(deadlineField(element)).toBe('Vence el 16 oct 2026 · 09:00.');
    expect(element.querySelector('[name="extensionHours"]')).not.toBeNull();
  });

  it('still lets the follow-up note be recorded: talking is not paying and moves no deadline', async () => {
    const { element } = await following('RES-1842', { ...running, frozen: true });
    expect(element.querySelector('textarea')).not.toBeNull();
    expect(element.querySelector('button[type="submit"]')).not.toBeNull();
  });
});

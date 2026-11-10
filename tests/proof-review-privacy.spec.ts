import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { ValidateProofPageComponent } from '../src/app/payments/pages/validate-proof-page.component';
import { PROOF_REVIEW_TEXT } from '../src/app/payments/proof-review-copy';
import { PortalNavigation } from '../src/app/portal-navigation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { screenOf } from './reservations.double';

// HU-COM-010, DP-D10-5 (issue code-corhuila/multi-tour-docs#176): the reason is free text that may hold a name and travels to the event,
// so the reviewer is told, beside the field, not to type personal data.
const NOTICE = 'No escribas datos personales en el motivo (nombres, documentos, teléfonos o datos de salud): el motivo queda registrado y puede llegar al cliente.';

function screen(role: 'TENANT_ADMINISTRATOR' | 'ANALYST') {
  const navigation = new PortalNavigation();
  navigation.register(['payments', 'payments-validate']);
  navigation.params.set({ reservation: 'RES-1833', payment: 'RES-1833-P1' });
  return screenOf(ValidateProofPageComponent, [
    { provide: ActorContext, useValue: actorAs(role) },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation },
  ]);
}
afterEach(() => TestBed.resetTestingModule());

describe('reasonPrivacyNotice', () => {
  it('keeps the exact text in the copy file', () => {
    expect(PROOF_REVIEW_TEXT.reasonPrivacy).toBe(NOTICE);
  });

  it('draws the notice as one line of helper text right after the reason field', async () => {
    const { element } = await screen('TENANT_ADMINISTRATOR');
    const field = element.querySelector<HTMLTextAreaElement>('#crp-proof-review-reason')!;
    const notice = field.nextElementSibling!;
    expect(notice.textContent?.trim()).toBe(NOTICE);
    expect(notice.id).toBe('crp-proof-review-reason-privacy');
  });

  it('draws no notice where there is no reason field (read-only role)', async () => {
    const { element } = await screen('ANALYST');
    expect(element.querySelector('#crp-proof-review-reason')).toBeNull();
    expect(element.textContent).not.toContain('datos personales');
  });
});

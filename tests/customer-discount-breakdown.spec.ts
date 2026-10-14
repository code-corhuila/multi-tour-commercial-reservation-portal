import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscountRulesWriter } from '../src/app/discounts/data/discount-rules-writer';
import { ReservationQuoteSource } from '../src/app/reservations/data/reservation-quote-source';
import { PortalNavigation } from '../src/app/portal-navigation';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { PaymentMethodsSource, ReservationRequester, ReservationSelectionSource, SelectionQuoteSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { RESERVATION_FLOW, SelectionQuote } from '../src/app/self-service-reservation/model/self-service-reservation';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { sourceProviders } from '../src/app/sources.demo';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { ControllablePaymentMethods, CustomerAs, QUOTE, RecordingRequester, SELECTION, quoteOf, selectionAt } from './self-service-reservation.double';

// HU-COM-004 amendment v1.9, T-V19-3, AC-CD.3: the customer sees the lines in application order. DP-004-V19-3 PROPUESTO.
afterEach(() => TestBed.resetTestingModule());
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const QUOTED: SelectionQuote = { ...QUOTE, baseValueCents: 10_000_000, discountCents: 5_500_000, finalValueCents: 4_500_000, discountLines: [
  { order: 1, name: '10% de descuento', base: 'ORIGINAL_VALUE', amountCents: 1_000_000, subtotalCents: 9_000_000 },
  { order: 2, name: '50% de descuento', base: 'PREVIOUS_SUBTOTAL', amountCents: 4_500_000, subtotalCents: 4_500_000 }] };

async function confirm(quote: SelectionQuote) {
  const methods = new ControllablePaymentMethods(), navigation = new PortalNavigation(); navigation.register([RESERVATION_FLOW.reserve]);
  TestBed.configureTestingModule({ providers: [{ provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') }, { provide: ReservationSelectionSource, useValue: selectionAt(SELECTION) },
    { provide: PaymentMethodsSource, useValue: methods }, { provide: SelectionQuoteSource, useValue: quoteOf(quote) }, { provide: ReservationRequester, useValue: new RecordingRequester() },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() }, { provide: PortalNavigation, useValue: navigation }] });
  const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('theCustomerBreakdownShowsEveryLineInApplicationOrder', () => {
  it('lists each line with its order, base, amount and subtotal under Descuentos aplicables', async () => {
    const lines = Array.from((await confirm(QUOTED)).querySelectorAll('.self-service-breakdown li'), (li) => flat(li.textContent));
    expect(lines).toEqual(['1. 10% de descuento · sobre el valor original · -$100.000 · Subtotal $900.000',
      '2. 50% de descuento · sobre el subtotal anterior · -$450.000 · Subtotal $450.000']);
  });
  it('draws no list when the quote carries no line, and keeps the total row', async () => {
    const page = await confirm({ ...QUOTE, discountLines: undefined });
    expect(page.querySelector('.self-service-breakdown')).toBeNull(); expect(page.textContent).toContain('Descuentos aplicables');
  });
  it('shows in 21 the same lines, in the same order, as the quote of 10B for the same selection', async () => {
    TestBed.configureTestingModule({ providers: sourceProviders(undefined as never) });
    await firstValueFrom(TestBed.inject(DiscountRulesWriter).create({ tourId: 'demo-svc-2', startsOn: '2000-01-01', endsOn: '2999-12-31', priority: 8,
      calculationBase: 'PREVIOUS_SUBTOTAL', percentageBasisPoints: 2500, stackable: true }, 'k-breakdown'));
    const request = { departureId: 'demo-dep-2', serviceIds: ['demo-svc-2'], people: 1 };
    const quote = await firstValueFrom(TestBed.inject(ReservationQuoteSource).quote(request));
    const customer = await firstValueFrom(TestBed.inject(SelectionQuoteSource).quote(request));
    expect(customer.discountLines!.map((l) => [l.order, l.name, l.base, l.amountCents])).toEqual(quote.discounts.map((d, i) => [i + 1, d.name, d.base, d.amountCents]));
    expect(customer.discountLines!.at(-1)!.subtotalCents).toBe(quote.finalCents);
  });
});

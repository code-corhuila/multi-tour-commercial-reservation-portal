import { readFileSync } from 'node:fs';
import { firstValueFrom, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoDeparturesStore } from '../src/app/demo/reservations-demo';
import { DemoSelectionQuotes } from '../src/app/demo/self-service-reservation-demo';
import { ReservationQuoteSource } from '../src/app/reservations/data/reservation-quote-source';
import { Quote } from '../src/app/reservations/model/reservation';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import {
  PaymentMethodsSource, ReservationRequester, ReservationSelectionSource, SelectionQuoteSource, selectionSourceFor,
} from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ConfirmReservationPageComponent } from '../src/app/self-service-reservation/pages/confirm-reservation-page.component';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { mountWith } from '../src/mount-entry';
import { ControllablePaymentMethods, CustomerAs, METHODS, RecordingRequester, SELECTION, quoteOf, selectionAt } from './self-service-reservation.double';
import { listSourceFiles, withoutComments } from './source-files';

// Amendment 2026-10-13 of 008- (plan H-D9, H-D10, H-D11; task H-T3b).

describe('selfServiceReadsNoBrowserAddress', () => {
  it('reads no location and no global object under src/app/self-service-reservation', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/self-service-reservation/') && file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(withoutComments(readFileSync(file, 'utf8')), file).not.toMatch(/\blocation\b|globalThis/);
  });
});

describe('theSelectionArrivesWithTheAreaOrTheMountProperties', () => {
  let host: HTMLElement | undefined;
  let cleanup: (() => void) | undefined;
  afterEach(() => { cleanup?.(); host?.remove(); history.replaceState(null, '', '/'); });

  it('reads a complete selection from the mount parameters, and none from an incomplete one', () => {
    expect(selectionSourceFor({ departure: 'demo-dep-1', services: 'demo-svc-1,demo-svc-2', people: '2' }).current())
      .toEqual({ departureId: 'demo-dep-1', serviceIds: ['demo-svc-1', 'demo-svc-2'], people: 2 });
    expect(selectionSourceFor({ departure: 'demo-dep-1', people: '2' }).current()).toBeNull();
    expect(selectionSourceFor(undefined).current()).toBeNull();
  });

  it('opens Finalizar reserva with the selection of initialParams and ignores the address', async () => {
    history.replaceState(null, '', '/reserve?departure=demo-dep-9&services=demo-svc-9&people=9');
    host = document.createElement('div'); document.body.append(host);
    cleanup = mountWith(host, {
      apiClient: { request: vi.fn() } as never,
      session: { roles: ['FINAL_CUSTOMER'], open: () => undefined, close: () => undefined },
      initialParams: { departure: 'demo-dep-1', services: 'demo-svc-1', people: '2' },
    }, demoSources);
    await vi.waitFor(() => expect(host!.querySelector('app-confirm-reservation-page [data-state="data"]')).toBeTruthy());
    expect(host.querySelector('app-confirm-reservation-page')!.textContent).toContain('Tatacoa');
  });
});

describe('theConfirmationShowsTheQuoteOfTheSharedQuoteSource', () => {
  it('builds the summary of the selection from the quote source of HU-COM-007', async () => {
    const shared: Quote = { services: [{ name: 'Guianza', cents: 30_000_000 }], transportCents: 1_000_000, projectedCents: 31_000_000,
      discounts: [{ name: 'Temporada', base: 'ORIGINAL_VALUE', amountCents: 1_234_500 }], discountCents: 1_234_500, finalCents: 29_765_500 };
    const quotes = new (class extends ReservationQuoteSource { override quote() { return of(shared); } })();
    const summary = await firstValueFrom(new DemoSelectionQuotes(new DemoDeparturesStore(), quotes).quote({ departureId: 'demo-dep-1', serviceIds: ['x'], people: 2 }));
    expect(summary).toMatchObject({ tourName: 'Desierto de la Tatacoa al atardecer', baseValueCents: 31_000_000, discountCents: 1_234_500, finalValueCents: 29_765_500 });
  });

  it('keeps no value calculation of its own in the demo of the self-service flow', () => {
    const demo = withoutComments(readFileSync('src/app/demo/self-service-reservation-demo.ts', 'utf8'));
    expect(demo).not.toMatch(/\bquote\(\s*services|projectedCents\s*-\s*\w+\.finalCents/);
  });
});

describe('theHolderFieldsAreDrawnDisabledAndNothingIsSent', () => {
  it('draws the five holder fields disabled with the pending note, and the request carries none of them', async () => {
    const methods = new ControllablePaymentMethods(), requester = new RecordingRequester();
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') },
      { provide: ReservationSelectionSource, useValue: selectionAt(SELECTION) },
      { provide: PaymentMethodsSource, useValue: methods },
      { provide: SelectionQuoteSource, useValue: quoteOf() },
      { provide: ReservationRequester, useValue: requester },
    ] });
    const fixture = TestBed.createComponent(ConfirmReservationPageComponent);
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    await settle(); methods.requests.at(-1)!.reply(METHODS); await settle();
    const element: HTMLElement = fixture.nativeElement;
    const holder = Array.from(element.querySelectorAll<HTMLInputElement>('.crp-finish-holder input'));
    expect(holder).toHaveLength(5);
    expect(holder.every((input) => input.disabled)).toBe(true);
    expect(element.querySelector('.crp-finish-holder')!.textContent).toContain('Pendiente de definición');
    expect(element.querySelector('.crp-finish-holder')!.textContent).not.toContain('DP-RS5');
    const select = element.querySelector('select') as HTMLSelectElement;
    select.value = 'BANK_TRANSFER'; select.dispatchEvent(new Event('change'));
    element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.click());
    await settle();
    Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Confirmar reserva')!.click(); await settle();
    expect(requester.calls).toHaveLength(1);
    expect(Object.keys(requester.calls[0].selection).sort()).toEqual(['departureId', 'people', 'serviceIds']);
  });
});

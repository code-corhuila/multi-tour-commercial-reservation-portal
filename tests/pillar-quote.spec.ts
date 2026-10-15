import { readFileSync } from 'node:fs';
import { Observable, Subject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReservationFormComponent } from '../src/app/reservations/components/reservation-form.component';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { QuoteRequest, ReservationQuoteSource } from '../src/app/reservations/data/reservation-quote-source';
import { Quote } from '../src/app/reservations/model/reservation';
import { ReservationsPageComponent } from '../src/app/reservations/pages/reservations-page.component';
import { ControllableReservations, ControllableReservationsWriter, reservationOf, reservationProviders, screenOf } from './reservations.double';
import { listSourceFiles, withoutComments } from './source-files';

// Amendment 2026-10-13 of 007- (plan H-D7, H-D8; task H-T3a): the service quotes, the portal only shows.

/** A quote no formula of the portal would produce from the form's inputs, so the screen can only have read it. */
const SERVICE_QUOTE: Quote = {
  services: [{ name: 'Kayak', cents: 12_000_000 }], transportCents: 345_600, projectedCents: 12_345_600,
  discounts: [{ name: 'Temporada', base: 'ORIGINAL_VALUE', amountCents: 2_345_600 }], discountCents: 2_345_600, finalCents: 10_000_000,
};

class ControllableQuotes extends ReservationQuoteSource {
  readonly requests: { request: QuoteRequest; reply: (q: Quote) => void }[] = [];
  override quote(request: QuoteRequest): Observable<Quote> {
    const answer = new Subject<Quote>();
    this.requests.push({ request, reply: (q) => { answer.next(q); answer.complete(); } });
    return answer;
  }
}

async function openForm() {
  const quotes = new ControllableQuotes(), writer = new ControllableReservationsWriter();
  const view = await screenOf(ReservationFormComponent, [...reservationProviders({ writer }), { provide: ReservationQuoteSource, useValue: quotes }]);
  const fill = async (people = '3') => {
    await view.choose('departureId', 'dep-1');
    await view.tick('svc-Kayak'); await view.type('people', people); await view.party(); await view.payWith();
  };
  return { ...view, quotes, writer, fill };
}

describe('theFormShowsTheQuoteItsSourceReturnedAndComputesNothing', () => {
  it('asks the source for the selection and shows exactly the values it returned', async () => {
    const { element, fill, quotes, settle } = await openForm();
    await fill();
    expect(quotes.requests.at(-1)!.request).toEqual({ departureId: 'dep-1', serviceIds: ['svc-Kayak'], people: 3 });
    quotes.requests.at(-1)!.reply(SERVICE_QUOTE); await settle();
    const breakdown = element.querySelector('.crp-reservations-breakdown')!;
    expect(breakdown.querySelector('[data-value="projected"]')!.textContent).toContain('$123.456');
    expect(breakdown.querySelector('[data-value="final"]')!.textContent).toContain('$100.000');
    expect(element.textContent).toContain('-$23.456');
  });

  it('keeps the answer of the newest selection when an older one arrives late', async () => {
    const { element, fill, quotes, settle, type } = await openForm();
    await fill('3');
    const older = quotes.requests.at(-1)!;
    await type('people', '4');
    quotes.requests.at(-1)!.reply({ ...SERVICE_QUOTE, finalCents: 20_000_000 }); await settle();
    older.reply(SERVICE_QUOTE); await settle();
    expect(element.querySelector('[data-value="final"]')!.textContent).toContain('$200.000');
  });
});

describe('theCreateCommandCarriesNoValues', () => {
  it('sends the customer, the departure, the services and the people, and no value', async () => {
    const { fill, quotes, settle, submit, writer } = await openForm();
    await fill(); quotes.requests.at(-1)!.reply(SERVICE_QUOTE); await settle();
    await submit();
    expect(writer.calls).toHaveLength(1);
    expect(Object.keys(writer.calls[0].command).sort()).toEqual(['companions', 'departureId', 'lead', 'paymentMethod', 'paymentType', 'people', 'serviceIds']);
  });
});

describe('pendingBalanceAndBadgeComeFromTheReturnedReservation', () => {
  const partlyPaid = reservationOf('RES-9', { balanceCents: 7_000_000, quote: { ...SERVICE_QUOTE, finalCents: 9_000_000 } });

  it('shows the balance the reservation brings, not its final value, on the detail and right after creation', async () => {
    for (const fresh of [true, false]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const fixture = TestBed.createComponent(ReservationViewComponent);
      fixture.componentRef.setInput('reservation', partlyPaid); fixture.componentRef.setInput('fresh', fresh);
      fixture.detectChanges(); await fixture.whenStable();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.textContent).toContain('$70.000');
      expect(element.querySelector('.crp-operator-status')!.classList).toContain('crp-is-pending');
    }
  });

  it('writes the balance of each reservation in the Saldo column of the list', async () => {
    const reservations = new ControllableReservations();
    const { element, settle } = await screenOf(ReservationsPageComponent, reservationProviders({ reservations }));
    reservations.inner.requests.at(-1)!.reply([partlyPaid]); await settle();
    const row = element.querySelector('tbody tr')!;
    expect(row.children[4].textContent).toContain('$70.000');
    expect(row.querySelector('.crp-operator-status')!.classList).toContain('crp-is-pending');
  });
});

describe('reservationsFolderDefinesNoValueCalculation', () => {
  it('has no quote function and no arithmetic on rates, people or discounts under src/app/reservations', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/reservations/') && file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      expect(code, file).not.toMatch(/function\s+quote\b|\.reduce\(|Math\.max\(|\*\s*people\b|rateCents\s*\*/);
    }
  });
});

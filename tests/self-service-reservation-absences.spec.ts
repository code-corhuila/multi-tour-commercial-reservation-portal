import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CustomerContext } from '../src/app/self-service-reservation/data/customer-context';
import { MyReservationsSource } from '../src/app/self-service-reservation/data/my-reservations-source';
import { MyReservationsPageComponent } from '../src/app/self-service-reservation/pages/my-reservations-page.component';
import { listSourceFiles, withoutComments } from './source-files';
import { ControllableMyReservationsSource, CustomerAs, reservationFor, SELECTION } from './self-service-reservation.double';

// AC3 / RN-RS7: the customer's area offers no modify, cancel or reschedule (RF-014, Phase 1).
// It is an absence, so it is asserted on the screen and on every source of the feature (plan D-06).
const CHANGE_ACTIONS = /modif|cancel|reschedul|reprogram|postpone|amend|\bedit|aplazar/i;
// RN-RS1 / T-01: no sign-in or registration form of its own, no client, no storage, no token.
const OWN_SESSION = /password|passwd|contrase|credential|Authorization|Bearer|HttpClient|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|https?:\/\//i;

const FEATURE = 'src/app/self-service-reservation/';
const DEMO = 'src/app/demo/self-service-reservation-demo.ts';
const featureFiles = () => listSourceFiles().filter((file) => file.startsWith(FEATURE));
const code = (file: string) => withoutComments(readFileSync(file, 'utf8')).replace(/DestroyRef|takeUntilDestroyed/g, '');

describe('selfServiceSourcesDeclareNoModifyCancelOrRescheduleAction', () => {
  it('finds no change action in any source of the feature or its demo store', () => {
    const files = [...featureFiles(), DEMO];
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(code(file), file).not.toMatch(CHANGE_ACTIONS);
  });

  it('the panel depends on a source port only: no writer or requester reaches it', () => {
    const panel = code(`${FEATURE}pages/my-reservations-page.component.ts`);
    expect(panel).toMatch(/MyReservationsSource/);
    expect(panel).not.toMatch(/Writer|Requester|IdempotencyKeys/);
  });

  it('the detector rejects representative additions', () => {
    for (const sample of ['<button>Cancel</button>', 'modifyReservation()', 'reschedule(id)', 'cancelar', 'reprogramar', 'edit()']) {
      expect(sample, sample).toMatch(CHANGE_ACTIONS);
    }
  });
});

describe('myReservationsOffersNoModifyCancelOrReschedule', () => {
  it('lists the own reservations with state and values and renders no action at all', async () => {
    const source = new ControllableMyReservationsSource();
    TestBed.configureTestingModule({ providers: [
      { provide: CustomerContext, useValue: new CustomerAs('FINAL_CUSTOMER') },
      { provide: MyReservationsSource, useValue: source },
    ] });
    const fixture = TestBed.createComponent(MyReservationsPageComponent);
    fixture.detectChanges();
    source.requests[0].reply([reservationFor(), reservationFor(SELECTION, 'demo-res-2')]);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const data = element.querySelector('[data-state="data"]')!;
    expect(data.querySelectorAll('li, tbody tr').length).toBe(2);
    for (const shown of ['demo-res-1', 'demo-res-2', '360000.00', 'PENDING_PAYMENT', 'SIN_PAGO']) expect(element.textContent).toContain(shown);
    expect(element.querySelectorAll('button, a, form, input, select, textarea')).toHaveLength(0);
    expect(element.textContent).not.toMatch(CHANGE_ACTIONS);
  });
});

describe('selfServiceHasNoSignInClientOrStorageOfItsOwn', () => {
  it('finds none in the feature, its templates or its demo store', () => {
    for (const file of [...featureFiles(), DEMO]) expect(code(file), file).not.toMatch(OWN_SESSION);
  });

  it('the detector rejects a sign-in form and a client of its own', () => {
    for (const sample of ['<input type="password">', 'inject(HttpClient)', "localStorage.setItem('t', x)", "headers: { Authorization: 'Bearer x' }"]) {
      expect(sample, sample).toMatch(OWN_SESSION);
    }
  });
});

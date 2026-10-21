import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { ADDITIONAL_DISCOUNT_AREA } from '../src/app/current-discounts/data/additional-discount-eligibility';
import { AdditionalDiscountContext, AdditionalDiscountContexts, AdditionalDiscountPreview } from '../src/app/current-discounts/data/additional-discount-contexts';
import { AdditionalDiscountApplied, AdditionalDiscountCommand, AdditionalDiscountWriter } from '../src/app/current-discounts/data/additional-discount-writer';
import { AdditionalDiscountPageComponent } from '../src/app/current-discounts/pages/additional-discount-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

/** An invented reservation of 100.000 pesos after a 10.000 general discount, 40.000 paid, a 20 % cap. */
export const contextOf = (over: Partial<AdditionalDiscountContext> = {}): AdditionalDiscountContext => ({
  reservationId: 'RES-1', customerName: 'Camila Ortega', serviceName: 'Ruta Andina', currentValueCents: 10_000_000, generalDiscountCents: 1_000_000,
  paidCents: 4_000_000, capBasisPoints: 2000, eligible: true, stateLabel: 'Pendiente de pago', ...over,
});

export class ControllableContexts extends AdditionalDiscountContexts {
  readonly requests: { id: string; reply: (context: AdditionalDiscountContext | null) => void; fail: () => void }[] = [];
  readonly previews: { id: string; basisPoints: number }[] = [];
  /** 1 basis point of 100.000 pesos is 10 pesos; the port, not the view, resolves the new value and the excess. */
  override preview(id: string, basisPoints: number): Observable<AdditionalDiscountPreview> {
    this.previews.push({ id, basisPoints });
    const newValueCents = 10_000_000 - basisPoints * 1_000;
    return of({ newValueCents, excessCents: Math.max(4_000_000 - newValueCents, 0) });
  }
  override of(id: string): Observable<AdditionalDiscountContext | null> {
    return new Observable((subscriber) => {
      this.requests.push({ id, reply: (context) => { subscriber.next(context); subscriber.complete(); }, fail: () => subscriber.error(new Error('unavailable')) });
    });
  }
}

export class ControllableAdditionalDiscountWriter extends AdditionalDiscountWriter {
  readonly calls: { command: AdditionalDiscountCommand; key: string; reply: (stored: AdditionalDiscountApplied) => void; fail: (error: unknown) => void }[] = [];
  override register(command: AdditionalDiscountCommand, key: string): Observable<AdditionalDiscountApplied> {
    const answers = new Subject<AdditionalDiscountApplied>();
    this.calls.push({ command, key, reply: (stored) => { answers.next(stored); answers.complete(); }, fail: (error) => answers.error(error) });
    return answers;
  }
}
export const appliedOf = (command: AdditionalDiscountCommand, over: Partial<AdditionalDiscountApplied> = {}): AdditionalDiscountApplied =>
  ({ ...command, appliedBy: 'Administrador demo', appliedAt: '2026-10-15T10:00:00-05:00', previousValueCents: 10_000_000, amountCents: 500_000, newValueCents: 9_500_000, excessCents: 0, ...over });

/** Opens the sub-screen "Aplicar descuento" with { reservation } as the shell does, and answers the context when the test says so. */
export async function openAdditionalDiscount(role: ActorRole = 'TENANT_ADMINISTRATOR', reservation = 'RES-1') {
  const contexts = new ControllableContexts(), writer = new ControllableAdditionalDiscountWriter(), keys = new ControllableIdempotencyKeys();
  const navigation = new PortalNavigation();
  navigation.register(['reservations', ADDITIONAL_DISCOUNT_AREA]);
  navigation.open(ADDITIONAL_DISCOUNT_AREA, { reservation });
  TestBed.configureTestingModule({ providers: [{ provide: AdditionalDiscountContexts, useValue: contexts }, { provide: AdditionalDiscountWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: keys }, { provide: ActorContext, useValue: actorAs(role) }, { provide: PortalNavigation, useValue: navigation }] });
  const fixture = TestBed.createComponent(AdditionalDiscountPageComponent);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const field = (name: string) => element.querySelector<HTMLInputElement | HTMLTextAreaElement>(`form [name="${name}"]`)!;
  const type = async (name: string, value: string) => { field(name).value = value; field(name).dispatchEvent(new Event('input')); await settle(); };
  const submitButton = () => element.querySelector<HTMLButtonElement>('form button[type="submit"]')!;
  const errorFor = (name: string) => element.querySelector(`[id="${field(name).getAttribute('aria-describedby')}"]`)?.textContent;
  /** The value of the read-only field whose label is `label`. */
  const readOnly = (label: string) => {
    const node = Array.from(element.querySelectorAll('label')).find((l) => l.textContent?.trim() === label);
    return element.querySelector<HTMLInputElement>(`#${node?.getAttribute('for')}`)?.value;
  };
  const withContext = async (context = contextOf()) => { contexts.requests[0].reply(context); await settle(); };
  return { fixture, element, contexts, writer, keys, navigation, settle, state, field, type, submitButton, errorFor, readOnly, withContext };
}

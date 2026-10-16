import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { AuthorizableReason, AuthorizableReasons } from '../src/app/current-discounts/data/authorizable-reasons';
import { AuthorizableReasonsPanelComponent } from '../src/app/current-discounts/components/authorizable-reasons-panel.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

export const reasonsOf = (...names: string[]): readonly AuthorizableReason[] => names.map((reason) => ({ reason, removable: names.length > 1 }));

type Change = { kind: 'add' | 'remove'; reason: string; key: string; reply: (items: readonly AuthorizableReason[]) => void; fail: (error: unknown) => void };

/** A port that answers only when the test decides. */
export class ControllableReasons extends AuthorizableReasons {
  readonly requests: { reply: (items: readonly AuthorizableReason[]) => void; fail: () => void }[] = [];
  readonly changes: Change[] = [];
  override list(): Observable<readonly AuthorizableReason[]> {
    return new Observable((subscriber) => {
      this.requests.push({ reply: (items) => { subscriber.next(items); subscriber.complete(); }, fail: () => subscriber.error(new Error('unavailable')) });
    });
  }
  private change(kind: Change['kind'], reason: string, key: string): Observable<readonly AuthorizableReason[]> {
    const answers = new Subject<readonly AuthorizableReason[]>();
    this.changes.push({ kind, reason, key, reply: (items) => { answers.next(items); answers.complete(); }, fail: (error) => answers.error(error) });
    return answers;
  }
  override add(reason: string, key: string) { return this.change('add', reason, key); }
  override remove(reason: string, key: string) { return this.change('remove', reason, key); }
}

/** Opens the panel as the Descuentos page draws it, and answers the list when the test says so. */
export async function openReasons(role: ActorRole = 'TENANT_ADMINISTRATOR') {
  const port = new ControllableReasons(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [{ provide: AuthorizableReasons, useValue: port }, { provide: IdempotencyKeys, useValue: keys },
    { provide: ActorContext, useValue: actorAs(role) }] });
  const fixture = TestBed.createComponent(AuthorizableReasonsPanelComponent);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const state = () => element.querySelector('[data-state]')?.getAttribute('data-state');
  const field = () => element.querySelector<HTMLInputElement>('input[name="reason"]')!;
  const type = async (value: string) => { field().value = value; field().dispatchEvent(new Event('input')); await settle(); };
  const submit = async () => { element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle(); };
  const items = () => Array.from(element.querySelectorAll('li'), (li) => li.querySelector('span')?.textContent?.trim());
  const removeButton = (reason: string) => Array.from(element.querySelectorAll('li')).find((li) => li.textContent?.includes(reason))?.querySelector('button') as HTMLButtonElement;
  const error = () => element.querySelector(`[id="${field().getAttribute('aria-describedby')}"]`)?.textContent;
  return { fixture, element, port, keys, settle, state, field, type, submit, items, removeButton, error };
}

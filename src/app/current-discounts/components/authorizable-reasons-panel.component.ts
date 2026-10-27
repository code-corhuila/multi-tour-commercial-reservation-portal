import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, defer, finalize, map, of, startWith, switchMap } from 'rxjs';
import { ApiError } from '../../shell-contract';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PortalSlot } from '../../shared/portal-slots';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { AUTHORIZABLE_REASONS_COPY } from '../current-discounts-copy';
import { AuthorizableReason, AuthorizableReasons } from '../data/authorizable-reasons';

type ReasonsState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; items: readonly AuthorizableReason[] };

/** 12 (admin-descuentos.html), panel "Parametrización / Motivos autorizables": the enabled reasons with "Quitar", and "Nuevo motivo" with "Agregar motivo" (AC-CD.13). */
@Component({
  selector: 'app-authorizable-reasons-panel', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent],
  template: `
    <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.eyebrow }}</p><h2>{{ t.title }}</h2></div></div>
      <p class="crp-operator-copy">{{ t.copy }}</p>
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="current" [fallback]="t.failed" />
          <button class="crp-operator-outline" type="button" (click)="reload()">{{ t.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.empty }}</p> }
        @case ('data') {
          <ul class="crp-additional-discount-reasons" data-state="data">
            @for (item of current.items; track item.reason) { <li><span>{{ item.reason }}</span>
              <button type="button" [disabled]="!item.removable || pending()" (click)="remove(item)">{{ t.remove }}</button></li> }
          </ul>
        }
      }
      <form novalidate (submit)="add($event)">
        <div><label for="authorizable-reason">{{ t.field }}</label>
          <input id="authorizable-reason" name="reason" type="text" [placeholder]="t.placeholder" [value]="draft()" [disabled]="pending()"
            [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'authorizable-reason-error' : null" (input)="edit($event)">
          @if (error()) { <p role="alert" id="authorizable-reason-error">{{ error() }}</p> }</div>
        <div class="crp-form-actions"><button class="crp-operator-outline" type="submit" [disabled]="pending()">{{ t.add }}</button></div>
      </form>
    </section>
  `,
})
export class AuthorizableReasonsPanelComponent {
  private readonly port = inject(AuthorizableReasons); private readonly keys = inject(IdempotencyKeys);
  private readonly lifetime = inject(DestroyRef); private readonly injector = inject(Injector);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly t = AUTHORIZABLE_REASONS_COPY;
  protected readonly draft = signal(''); protected readonly error = signal(''); protected readonly pending = signal(false);
  private attempt: { intent: string; key: string } | null = null;
  private readonly requests = new Subject<void>(); private readonly local = signal<ReasonsState | null>(null);
  private readonly listed = toSignal(this.requests.pipe(switchMap(() => this.port.list().pipe(
    map(stateOf), catchError((failure) => of<ReasonsState>({ kind: 'error', ...readFailure(failure) })), startWith<ReasonsState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as ReasonsState });
  protected readonly state = computed(() => this.local() ?? this.listed());
  constructor() { this.reload(); }
  protected edit(event: Event): void { this.draft.set((event.target as HTMLInputElement).value); }
  protected reload(): void { this.local.set(null); this.requests.next(); }
  protected add(event: Event): void {
    event.preventDefault(); const reason = this.draft().trim(); this.error.set('');
    if (!reason) { this.error.set(this.t.required); afterNextRender(() => { focusFirstError(event.target as HTMLFormElement); }, { injector: this.injector }); return; }
    this.run(`add:${reason}`, (key) => this.port.add(reason, key), () => this.draft.set(''));
  }
  protected remove(item: AuthorizableReason): void { this.error.set(''); this.run(`remove:${item.reason}`, (key) => this.port.remove(item.reason, key), () => undefined); }
  /** One Idempotency-Key per intention, reused while the same one is retried. */
  private run(intent: string, call: (key: string) => Observable<readonly AuthorizableReason[]>, done: () => void): void {
    if (this.pending()) return;
    if (this.attempt?.intent !== intent) this.attempt = { intent, key: this.keys.generate() };
    const key = this.attempt.key; this.pending.set(true);
    defer(() => call(key)).pipe(takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false))).subscribe({
      next: (items) => { this.attempt = null; this.local.set(stateOf(items)); done(); },
      error: (failure: Partial<ApiError> | null) => {
        this.error.set(failure?.userMessage ?? this.t.changeFailed);
        afterNextRender(() => { focusFirstError(this.host); }, { injector: this.injector });
      },
    });
  }
}
const stateOf = (items: readonly AuthorizableReason[]): ReasonsState => (items.length ? { kind: 'data', items } : { kind: 'empty' });

const mayManageReasons = (injector: Injector) => injector.get(PortalCapabilities).canAuthorizeAdditionalDiscount() && injector.get(AuthorizableReasons, null) !== null;
/** The DISCOUNTS_PAGE_PANELS contribution mount-entry registers after the search panel: the Administrator only, and only with the port. */
export const AUTHORIZABLE_REASONS_PANEL: PortalSlot = { component: AuthorizableReasonsPanelComponent, order: 20, isAvailable: mayManageReasons };

import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, Injector, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap, take } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { STATUS_LABEL } from '../../reservations/data/reservations-source';
import { focusFirstError } from '../../shared/focus';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { CancellationQuote, CancellationQuoteResult, RefundableAmount } from '../data/cancellation-ports';
import { RESERVATION_CHANGE_TYPES } from '../data/reservation-change-types';
import { RESERVATION_CHANGES_COPY, refusalOf } from '../reservation-changes-copy';

type State = PageState<CancellationQuoteResult>;

/** The pause between the registered message and 10A (app.js window.setTimeout, 1400 ms); a token so tests decide when it ends. */
export const RESERVATION_CHANGE_RETURN_DELAY = new InjectionToken<() => Observable<unknown>>('RESERVATION_CHANGE_RETURN_DELAY', {
  providedIn: 'root',
  factory: () => () => new Observable<void>((s) => {
    const id = setTimeout(() => { s.next(); s.complete(); }, 1400);
    return () => clearTimeout(id);
  }),
});

/** admin-cancelar-modificar-reserva.html, opened from 10A with { reservation }; Tipo lists RESERVATION_CHANGE_TYPES (plan D-08). */
@Component({
  selector: 'app-reservation-change-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [NgComponentOutlet],
  template: `
    <header class="crp-page-header">
      <div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="back()">{{ t.back }}</button>
    </header>
    <p class="crp-access-note">{{ t.accessNote }}</p>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ t.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ t.notFound }}</p> }
      @case ('data') {
        @let q = s.items[0]; @let r = q.reservation; @let closed = refusal(q); @let locked = !!closed || pending();
        <form novalidate class="crp-reservation-changes-form" data-state="data" [attr.aria-busy]="pending()" (submit)="submit($event, q)">
          @if (closed ?? failure(); as why) { <p role="alert">{{ why }}</p> }
          <section class="crp-operator-panel"><h2>{{ t.formTitle }}</h2>
            <div class="crp-form-grid">
              <div><label for="crp-rc-code">{{ t.reservation }}</label><input id="crp-rc-code" readonly [value]="r.id"></div>
              <div><label for="crp-rc-tour">{{ t.tour }}</label><input id="crp-rc-tour" readonly [value]="r.tourName"></div>
              <div><label for="crp-rc-departure">{{ t.departure }}</label><input id="crp-rc-departure" readonly [value]="date(r.departureDate)"></div>
              <div><label for="crp-rc-type">{{ t.type }}</label><select id="crp-rc-type" [disabled]="locked" (change)="selected.set(value($event))">
                @for (type of types; track type.key) { <option [value]="type.key" [selected]="type.key === selected()">{{ type.label }}</option> }</select></div>
              @if (chosen()?.form; as extra) { <ng-container *ngComponentOutlet="extra; inputs: { reservation: r }" /> }
              <div class="crp-reservation-changes-wide"><label for="crp-rc-cause">{{ t.cause }}</label>
                <textarea id="crp-rc-cause" required [disabled]="locked" [value]="cause()" (input)="cause.set(value($event))"
                  [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'crp-rc-cause-error' : null"></textarea>
                @if (error()) { <p role="alert" id="crp-rc-cause-error">{{ t.causeRequired }}</p> }</div>
            </div>
          </section>
          <section class="crp-operator-panel"><h2>{{ t.refundTitle }}</h2><p>{{ t.refundNote }}</p>
            @if (chosen()?.showsRefundable !== false) {
              <dl class="crp-reservation-changes-list"><div><dt>{{ t.potential }}</dt><dd>{{ refundable(q.refundable) }}</dd></div></dl> }
          </section>
          <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back()">{{ t.cancel }}</button>
            <button type="submit" class="crp-operator-primary" [disabled]="locked || chosen()?.submittable === false">{{ t.submit }}</button></div>
          @if (registered(); as done) { <p role="status" class="crp-reservation-changes-feedback">{{ done }}</p> }
        </form>
      }
    }
  `,
})
export class ReservationChangePageComponent {
  protected readonly t = RESERVATION_CHANGES_COPY;
  protected readonly date = formatDate;
  protected readonly types = inject(RESERVATION_CHANGE_TYPES, { optional: true }) ?? [];
  protected readonly selected = signal(this.types[0]?.key ?? '');
  protected readonly cause = signal('');
  protected readonly error = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly pending = signal(false);
  protected readonly registered = signal<string | null>(null);
  private readonly delay = inject(RESERVATION_CHANGE_RETURN_DELAY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly code = this.navigation?.params()['reservation'] ?? '';
  /** One key per opening of the screen, reused on every retry (plan D-06). */
  private readonly key = inject(IdempotencyKeys).generate();
  private readonly quotes = inject(CancellationQuote);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => this.quotes.quote(this.code).pipe(
    map((q): State => (q ? { kind: 'data', items: [q] } : { kind: 'empty' })),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))),
  { initialValue: { kind: 'loading' } as State });

  protected chosen() { return this.types.find((type) => type.key === this.selected()); }
  protected refusal(q: CancellationQuoteResult) { return refusalOf(q.eligibility, STATUS_LABEL[q.reservation.status]); }
  protected refundable(r: RefundableAmount): string {
    return r.kind === 'amount' ? formatCop(r.cents) : r.kind === 'pending-policy' ? this.t.pendingPolicy : this.t.noPayments;
  }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected back(): void { this.navigation?.open('reservations', { reservation: this.code }); }

  protected submit(event: Event, q: CancellationQuoteResult): void {
    event.preventDefault();
    const type = this.chosen(), cause = this.cause().trim();
    if (this.pending() || this.refusal(q) || !type || type.submittable === false) return;
    this.error.set(!cause);
    if (!cause) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    this.pending.set(true);
    this.failure.set(null);
    type.submit({ reservationCode: q.reservation.id, cause, idempotencyKey: this.key }).subscribe({
      next: (outcome) => {
        if (outcome.kind === 'registered') { this.showRegistered(q); return; }
        this.failure.set(outcome.reason); this.pending.set(false);
      },
      error: () => { this.failure.set(this.t.failed); this.pending.set(false); },
    });
  }

  /** app.js: the registered text stays in the feedback line, the form stays disabled, then 10A opens. */
  private showRegistered(q: CancellationQuoteResult): void {
    this.registered.set(q.refundable.kind === 'no-payments' ? this.t.registeredNoPayments : this.t.registeredPendingRefund);
    this.delay().pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.back());
  }
}

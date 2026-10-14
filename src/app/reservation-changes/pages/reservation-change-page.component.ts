import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { Reservation, STATUS_LABEL } from '../../reservations/data/reservations-source';
import { focusFirstError } from '../../shared/focus';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { CancellationOrigin, CancellationQuote, CancellationQuoteResult } from '../data/cancellation-ports';
import { RESERVATION_CHANGE_TYPES } from '../data/reservation-change-types';
import { CANCELLATION_ORIGINS, RESERVATION_CHANGES_COPY, refusalOf, registeredMessage, treatmentOf } from '../reservation-changes-copy';

type State = PageState<CancellationQuoteResult>;

/** The pause between the registered message and 10A (app.js window.setTimeout, 1800 ms); a token so tests decide when it ends. */
export const RESERVATION_CHANGE_RETURN_DELAY = new InjectionToken<() => Observable<unknown>>('RESERVATION_CHANGE_RETURN_DELAY', {
  providedIn: 'root',
  factory: () => () => new Observable<void>((s) => {
    const id = setTimeout(() => { s.next(); s.complete(); }, 1800);
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
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.contextEyebrow }}</p><h2>{{ t.contextTitle }}</h2>
            <div class="crp-form-grid">
              <div><label for="crp-rc-code">{{ t.reservation }}</label><input id="crp-rc-code" readonly [value]="r.id"></div>
              <div><label for="crp-rc-customer">{{ t.customer }}</label><input id="crp-rc-customer" readonly [value]="r.leadCustomerName"></div>
              <div><label for="crp-rc-status">{{ t.status }}</label><input id="crp-rc-status" readonly [value]="status(r)"></div>
              <div><label for="crp-rc-paid">{{ t.paid }}</label><input id="crp-rc-paid" readonly [value]="money(r.validatedCents ?? 0)"></div>
              <div class="crp-reservation-changes-wide"><label for="crp-rc-departure">{{ t.departure }}</label><input id="crp-rc-departure" readonly [value]="r.tourName + ' · ' + date(r.departureDate)"></div>
            </div>
          </section>
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.noveltyEyebrow }}</p><h2>{{ t.noveltyTitle }}</h2>
            <div class="crp-form-grid">
              <div><label for="crp-rc-type">{{ t.type }}</label><select id="crp-rc-type" [disabled]="locked" (change)="selected.set(value($event))">
                @for (type of types; track type.key) { <option [value]="type.key" [selected]="type.key === selected()">{{ type.label }}</option> }</select></div>
              @if (selected() === 'cancellation') {
                <div><label for="crp-rc-origin">{{ t.origin }}</label><select id="crp-rc-origin" [disabled]="locked" (change)="origin.set(originValue($event))">
                  @for (o of origins; track o.key) { <option [value]="o.key" [selected]="o.key === origin()">{{ o.option }}</option> }</select></div> }
              @if (chosen()?.form; as extra) { <ng-container *ngComponentOutlet="extra; inputs: { reservation: r }" /> }
              <div class="crp-reservation-changes-wide"><label for="crp-rc-cause">{{ t.cause }}</label>
                <textarea id="crp-rc-cause" required [placeholder]="t.causeHint" [disabled]="locked" [value]="cause()" (input)="cause.set(value($event))"
                  [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'crp-rc-cause-error' : null"></textarea>
                @if (error()) { <p role="alert" id="crp-rc-cause-error">{{ t.causeRequired }}</p> }</div>
              @if (chosen()?.showsRefundable !== false) {
                <div class="crp-reservation-changes-wide"><label for="crp-rc-treatment">{{ t.treatment }}</label><input id="crp-rc-treatment" readonly [value]="treatment(q)"></div> }
            </div>
          </section>
          <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back()">{{ t.cancel }}</button>
            <button type="submit" class="crp-operator-primary" [disabled]="locked || chosen()?.submittable === false">{{ t.submit }}</button></div>
          <p role="status" aria-live="polite" class="crp-operator-form-feedback crp-reservation-changes-feedback" [class.crp-is-valid]="!!registered()">{{ registered() ?? t.invitation }}</p>
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
  protected readonly origins = CANCELLATION_ORIGINS;
  protected readonly origin = signal<CancellationOrigin>('customer');
  protected readonly cause = signal('');
  protected readonly error = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly pending = signal(false);
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly code = this.navigation?.params()['reservation'] ?? '';
  /** The key follows the body: reused on every retry of the same data, new when the cause is corrected (plan D-06). */
  private readonly intention = new IntentionKey(inject(IdempotencyKeys));
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
  protected status(r: Reservation): string { return STATUS_LABEL[r.status]; }
  protected money = formatCop;
  protected treatment(q: CancellationQuoteResult): string { return treatmentOf(this.origin(), q.reservation.validatedCents ?? 0, q.refundable); }
  protected originValue(event: Event): CancellationOrigin { return (event.target as HTMLSelectElement).value as CancellationOrigin; }
  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
  protected back(): void { this.navigation?.open('reservations', { reservation: this.code }); }

  protected submit(event: Event, q: CancellationQuoteResult): void {
    event.preventDefault();
    const type = this.chosen(), cause = this.cause().trim();
    if (this.pending() || this.refusal(q) || !type) return;
    this.error.set(!cause);
    if (!cause) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    this.pending.set(true);
    this.failure.set(null);
    const body = { reservationCode: q.reservation.id, cause, origin: this.origin() };
    type.submit({ ...body, idempotencyKey: this.intention.keyFor(body) }).subscribe({
      next: (outcome) => {
        if (outcome.kind === 'registered') { this.back(); return; }
        this.failure.set(outcome.reason); this.pending.set(false);
      },
      error: () => { this.failure.set(this.t.failed); this.pending.set(false); },
    });
  }

  /** app.js: the registered text stays in the feedback line, the form stays disabled, then 10A opens. */
  private showRegistered(q: CancellationQuoteResult): void {
    this.registered.set(registeredMessage(this.origin(), q.reservation.validatedCents ?? 0, q.refundable));
    this.delay().pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.back());
  }
}

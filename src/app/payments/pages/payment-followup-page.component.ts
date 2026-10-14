import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { DeparturesSource } from '../../reservations/data/departures-source';
import { FINANCIAL_LABEL, Reservation, ReservationsSource } from '../../reservations/data/reservations-source';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { focusFirstError } from '../../shared/focus';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { PageState } from '../../shared/page-state';
import { PaymentLabels, modalityOf, paymentLabels } from '../components/reservation-payments-block.component';
import { PaymentDeadline, PaymentDeadlineExtender, PaymentDeadlineReader, PaymentFollowupsWriter } from '../data/payment-followup-ports';
import { PAYMENT_FOLLOWUP_TEXT, deadlineText, tenantDateTime } from '../payment-followup-copy';
import { PAYMENTS_TEXT, departureText } from '../payments-copy';

type State = PageState<{ reservation: Reservation; labels: PaymentLabels; deadline: PaymentDeadline | null; departure?: string }>;

/** admin-registrar-seguimiento.html (sub-screen of 13), opened with { reservation }; a paid reservation shows only its history (AC-PP.9). */
@Component({
  selector: 'app-payment-followup-page', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="back()">{{ t.back }}</button></header>
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ common.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ common.retry }}</button></div> }
      @default { @let d = s.kind === 'data' ? s.items[0] : null; @let r = d?.reservation; @let missing = !r; @let settled = r?.balanceCents === 0 || r?.status === 'CANCELADA';
        <!-- A missing reservation draws the form disabled, the message in the feedback line (app.js 3357-3360). -->
        <form novalidate [attr.data-state]="missing ? null : 'data'" [attr.aria-busy]="pending()" (submit)="$event.preventDefault(); r && save(r)">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.contextEyebrow }}</p><h2>{{ t.contextTitle }}</h2>
            <div class="crp-form-grid">
              @for (value of d ? context(d) : blank; track $index) { <div><label [for]="'crp-payment-followup-' + $index">{{ t.fields[$index] }}</label><input [id]="'crp-payment-followup-' + $index" readonly [disabled]="missing" [value]="value"></div> }
              <div class="crp-payment-followup-wide"><label for="crp-payment-followup-departure">{{ t.departure }}</label>
                <input id="crp-payment-followup-departure" readonly [disabled]="missing" [value]="d ? departure(d) : ''"></div>
              @if (!settled) { <div class="crp-payment-followup-wide"><label for="crp-payment-followup-deadline">{{ t.deadline }}</label>
                <input id="crp-payment-followup-deadline" readonly [disabled]="missing" [value]="d?.deadline ? deadlineLine(d!.deadline!) : ''"></div> }
            </div>
          </section>
          @if (!settled) {
            <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.followupEyebrow }}</p><h2>{{ t.followupTitle }}</h2><p class="crp-operator-copy">{{ t.rule }}</p>
              <div class="crp-payment-followup-wide"><label for="crp-payment-followup-note">{{ t.note }}</label>
                <textarea id="crp-payment-followup-note" name="note" required [disabled]="missing" [placeholder]="t.notePlaceholder" [value]="note()" (input)="note.set(value($event))"
                  [attr.aria-invalid]="error() ? 'true' : null" aria-describedby="crp-payment-followup-note-error"></textarea>
                <p id="crp-payment-followup-note-error" class="crp-payments-error">{{ error() }}</p></div>
            </section>
          }
          <p class="crp-operator-form-feedback" [class.crp-is-valid]="feedback() === t.saved" role="status" [attr.data-state]="missing ? 'empty' : null">{{ missing ? t.notFound : settled ? t.settled : feedback() }}</p>
          <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="back()">{{ t.back }}</button>
            @if (!settled) { <button type="submit" class="crp-operator-primary" [disabled]="pending() || missing">{{ t.title }}</button> }</div>
        </form>
        @if (r && !settled && extender && r.status === 'PENDIENTE_DE_PAGO' && d?.deadline) { @let ext = r.deadline?.extension; @let used = !!ext || !!r.deadline?.extendedUntil;
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.extension.eyebrow }}</p><h2>{{ t.extension.title }}</h2>
            <p class="crp-operator-copy">{{ ext ? t.extension.granted(ext.hours, ext.actorLabel, when(ext.grantedAt)) : r.deadline?.extendedUntil ? t.extension.grantedUntil(when(r.deadline!.extendedUntil!)) : t.extension.offer(t.extension.suggested) }}</p>
            <form novalidate (submit)="$event.preventDefault(); extend(r)"><label for="crp-payment-followup-hours">{{ t.extension.hours }}</label>
              <input id="crp-payment-followup-hours" name="extensionHours" type="number" min="1" inputmode="numeric" [disabled]="used || pending()" [value]="hours()" (input)="hours.set(value($event))">
              @if (extensionFeedback()) { <p class="crp-operator-form-feedback" [class.crp-is-valid]="extensionFeedback() === t.extension.done" role="status">{{ extensionFeedback() }}</p> }
              <div class="crp-form-actions"><button type="submit" class="crp-operator-outline" [disabled]="used || pending()">{{ t.extension.grant }}</button></div></form></section> }
        <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.historyEyebrow }}</p><h2>{{ t.historyTitle }}</h2></div></div>
          @let history = r?.followups ?? [];
          <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (column of t.historyColumns; track column) { <th>{{ column }}</th> }</tr></thead>
            <tbody>@for (f of history; track $index) { <tr><td>{{ date(f.contactedAt) }}</td><td>{{ f.contactedAt.slice(11, 16) }}</td><td>{{ f.actorLabel }}</td><td>{{ f.note }}</td></tr> }</tbody></table>
            @if (!missing && !history.length) { <p class="crp-operator-copy">{{ t.noHistory }}</p> }</div>
        </section>
      }
    }
  `,
})
export class PaymentFollowupPageComponent {
  private readonly navigation = inject(PortalNavigation, { optional: true }); private readonly params = this.navigation?.params() ?? {};
  private readonly source = inject(ReservationsSource); private readonly methods = inject(PaymentMethodsSource); private readonly reader = inject(PaymentDeadlineReader);
  private readonly departures = inject(DeparturesSource, { optional: true }); protected readonly extender = inject(PaymentDeadlineExtender, { optional: true });
  private readonly writer = inject(PaymentFollowupsWriter); private readonly keys = inject(IdempotencyKeys);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly t = PAYMENT_FOLLOWUP_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly when = tenantDateTime; protected readonly deadlineLine = deadlineText; protected readonly date = formatDate;
  protected readonly blank = PAYMENT_FOLLOWUP_TEXT.fields.map(() => '');
  protected readonly note = signal(''); protected readonly error = signal(''); protected readonly feedback = signal(this.t.hint); protected readonly pending = signal(false);
  protected readonly hours = signal(String(PAYMENT_FOLLOWUP_TEXT.extension.suggested)); protected readonly extensionFeedback = signal('');
  /** One key per intention: a retry of the same note reuses it; another note, or the next one after a success, takes a new key. */
  private key = ''; private keyFor: string | null = null; private readonly requests = new Subject<void>();
  private readonly loaded = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => defer(() => this.reader.deadlineOf(this.params['reservation'] ?? '').pipe(switchMap((deadline) => forkJoin({ all: this.source.list(), labels: paymentLabels(this.methods),
      departures: this.departures?.list().pipe(catchError(() => of([]))) ?? of([]) }).pipe(
    map(({ all, labels, departures }): State => { const reservation = all.find((r) => r.id === this.params['reservation']);
      const departure = departures.find((d) => d.id === reservation?.departureId)?.state;
      return reservation ? { kind: 'data', items: [{ reservation, labels, deadline, departure }] } : { kind: 'empty' }; }))))).pipe(
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  /** The reservation as the writer answered it; the newest answer wins over the list. */
  private readonly saved = signal<Reservation | null>(null);
  protected readonly state = computed((): State => {
    const s = this.loaded(), saved = this.saved();
    return s.kind === 'data' && saved ? { kind: 'data', items: [{ ...s.items[0], reservation: saved }] } : s;
  });

  /** Reserva, Cliente, Modalidad de pago, Valor recibido, Saldo pendiente, Estado actual: the values come resolved. */
  protected context(d: { reservation: Reservation; labels: PaymentLabels }): string[] {
    const r = d.reservation;
    return [`#${r.id}`, r.leadCustomerName, modalityOf(r, d.labels), formatCop(r.validatedCents ?? 0), formatCop(r.balanceCents), r.status === 'CANCELADA' && !r.validatedCents ? 'No aplica por reserva cancelada' : FINANCIAL_LABEL[r.financialStatus]];
  }
  protected departure(d: { reservation: Reservation; departure?: string }): string { return departureText(d.reservation, d.departure); }
  protected value(event: Event): string { return (event.target as HTMLTextAreaElement).value; }

  protected save(r: Reservation): void {
    if (this.pending()) return;
    const note = this.note().trim();
    this.error.set(note ? '' : this.t.noteRequired);
    if (!note) this.feedback.set(this.t.hint);
    if (!note) { afterNextRender(() => focusFirstError(this.host), { injector: this.injector }); return; }
    if (this.keyFor !== note) { this.key = this.keys.generate(); this.keyFor = note; }
    this.pending.set(true);
    this.writer.register({ reservationId: r.id, note }, this.key).subscribe({
      next: (saved) => { this.saved.set(saved); this.note.set(''); this.keyFor = null; this.feedback.set(this.t.saved); this.pending.set(false); },
      error: (e: { userMessage?: string }) => { this.feedback.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
  /** E15: one extension per reservation; the deadline the service answers is read again, never computed here. */
  protected extend(r: Reservation): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.extender!.extend({ reservationId: r.id, hours: Number(this.hours()) }, this.keys.generate()).subscribe({
      next: () => { this.extensionFeedback.set(this.t.extension.done); this.saved.set(null); this.requests.next(); this.pending.set(false); },
      error: (e: { userMessage?: string }) => { this.extensionFeedback.set(e?.userMessage || this.common.failed); this.pending.set(false); },
    });
  }
  protected back(): void { this.navigation?.open('payments'); }
}

import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { formatCop } from '../../shared/format';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys } from '../../shared/idempotency-keys';
import { parseMoney, pesosText } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CREDIT_BALANCE_COPY, formatDateTime } from '../credit-balance-copy';
import { CreditBalanceWriter, CreditCustomer } from '../data/credit-balance-ports';

/** What the form tells the page: the feedback line, and whether the overview has to be read again. */
export type CreditNotice = { readonly text: string; readonly ok: boolean };
let panels = 0;

/**
 * One customer of admin-saldo-favor.html: its origin reservations, "Aplicar a la reserva" and the history (AC-CB.4, AC-CB.6).
 * The amount is typed as text and read with parseMoney (pillar 3); every figure comes from the port. The form exists only with the capability (AC-CB.14).
 */
@Component({
  selector: 'app-credit-customer-panel', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = customer();
    <article class="crp-operator-panel crp-credit-balance-panel" [attr.data-credit-customer]="c.key">
      <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.customer }}</p><h2>{{ c.name }}</h2></div>
        <span class="crp-operator-status" [class.crp-is-confirmed]="c.availableCents > 0" [class.crp-is-pending]="c.availableCents <= 0">{{ t.available(money(c.availableCents)) }}</span></div>
      <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (h of t.sourceColumns; track h) { <th>{{ h }}</th> }</tr></thead>
        <tbody>@for (s of c.sources; track s.reservationId) {
          <tr><td>#{{ s.reservationId }}</td><td>{{ money(s.balanceCents) }}</td><td>{{ money(s.requestedCents) }}</td><td><strong>{{ money(s.availableCents) }}</strong></td></tr>
        }</tbody></table></div>
      @if (canApply && c.availableCents > 0) {
        @if (c.targets.length) {
          <form class="crp-credit-balance-form" data-credit-apply-form (submit)="apply($event)">
            <div><label [attr.for]="id + '-target'">{{ t.applyTo }}</label><select [id]="id + '-target'" data-credit-target (change)="target.set($any($event.target).value)">
              @for (x of c.targets; track x.reservationId) { <option [value]="x.reservationId" [selected]="x.reservationId === chosen()">{{ t.target(x.reservationId, money(x.balanceCents)) }}</option> }</select></div>
            <div><label [attr.for]="id + '-amount'">{{ t.amount }}</label>
              <input type="text" inputmode="decimal" [id]="id + '-amount'" data-credit-amount [value]="amountText()" [attr.aria-invalid]="error() ? 'true' : null"
                [attr.aria-describedby]="error() ? id + '-error' : null" (input)="typed.set($any($event.target).value)" />
              @if (error(); as text) { <p class="crp-credit-balance-error" [id]="id + '-error'">{{ text }}</p> }</div>
            <button type="submit" class="crp-operator-primary" [disabled]="busy()">{{ t.apply }}</button>
          </form>
        } @else { <p class="crp-credit-balance-note">{{ t.noTargets }}</p> }
      }
      <details class="crp-credit-balance-details"><summary>{{ t.history(c.history.length) }}</summary>
        <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (h of t.historyColumns; track h) { <th>{{ h }}</th> }</tr></thead>
          <tbody>@for (m of c.history; track $index) {
            <tr><td>{{ dateTime(m.at) }}</td><td>{{ t.movement[m.kind] }}</td><td>{{ m.detail }}</td><td>#{{ m.reservationId }}</td><td>{{ signed(m.amountCents) }}</td><td>{{ m.actor }}</td></tr>
          }</tbody></table></div></details>
    </article>`,
})
export class CreditCustomerPanelComponent {
  readonly customer = input.required<CreditCustomer>();
  readonly settled = output<CreditNotice>();
  protected readonly t = CREDIT_BALANCE_COPY; protected readonly money = formatCop; protected readonly dateTime = formatDateTime;
  protected readonly id = `crp-credit-${panels++}`;
  protected readonly canApply = inject(PortalCapabilities).canApplyCreditBalance();
  private readonly writer = inject(CreditBalanceWriter); private readonly ids = inject(IdempotencyKeys); private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly target = signal(''); protected readonly typed = signal<string | null>(null); protected readonly busy = signal(false); protected readonly error = signal<string | null>(null);
  private readonly keys = new Map<string, string>();
  protected readonly chosen = computed(() => (this.customer().targets.some((x) => x.reservationId === this.target()) ? this.target() : this.customer().targets[0]?.reservationId));
  protected readonly amountText = computed(() => this.typed() ?? pesosText(this.customer().suggestedCents));

  protected signed = (cents: number) => (cents >= 0 ? `+${formatCop(cents)}` : formatCop(cents));

  protected apply(event: Event): void {
    event.preventDefault();
    const parsed = parseMoney(this.amountText()), target = this.chosen();
    if (parsed.kind !== 'valid' || !target) { this.fail(this.t.refusal.zero); return; }
    if (this.busy()) return;
    // One Idempotency-Key per intention, reused by a retry after a failure and dropped once the writer answered (AC-CB.9).
    const intention = `${target}|${parsed.minorUnits}`, key = this.keys.get(intention) ?? this.ids.generate();
    this.keys.set(intention, key); this.busy.set(true); this.error.set(null);
    this.writer.apply(target, parsed.minorUnits, key).subscribe({
      next: (r) => {
        this.keys.delete(intention); this.busy.set(false);
        if (!r.ok) { this.fail(r.reason); return; }
        this.typed.set(null); this.settled.emit({ text: this.t.applied(formatCop(r.appliedCents), target, r.firstPayment), ok: true });
      },
      error: () => { this.busy.set(false); this.settled.emit({ text: this.t.failed, ok: false }); },
    });
  }

  private fail(text: string): void {
    this.error.set(text);
    afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
  }
}


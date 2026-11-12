import { ChangeDetectionStrategy, Component, Injector, Provider, inject, signal } from '@angular/core';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { MY_PAYMENTS_CREDIT, contribute } from '../../shared/portal-slots';
import { CUSTOMER_CREDIT_COPY } from '../customer-credit-copy';
import { CustomerCredit, CustomerCreditSource, CustomerCreditWriter } from '../data/customer-credit-ports';

type State = { readonly kind: 'loading' } | { readonly kind: 'error' } | { readonly kind: 'data'; readonly credit: CustomerCredit };

/**
 * The credit panel of mis-pagos.html (AC-CB.13, DP-CB6 PROPUESTO): the own credit by origin, "Solicitar devolución" and the list of the own requests. The figures and the refusals are
 * the port's; one Idempotency-Key per intention, reused on retry. It draws through MY_PAYMENTS_CREDIT, so no page of another story is edited.
 */
@Component({
  selector: 'app-customer-credit-panel', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ t.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ t.failed }}&ngsp;<button type="button" class="crp-outline" (click)="load()">{{ t.retry }}</button></div> }
      @default {
        @let credit = data(s);
        <div class="crp-my-payments-credit">
          @for (line of credit.sources; track line.reservationId) {
            <div data-credit-source>
              <p><strong>{{ t.available(cop(line.availableCents)) }}</strong> {{ t.origin(line.reservationId) }}</p>
              <p>{{ t.note }}</p>
              <p>@if (navigation?.has(tours)) { <button type="button" class="crp-panel-link" data-credit-apply-link (click)="navigation?.open(tours)">{{ t.apply }}</button>&ngsp; }
                <button type="button" class="crp-outline" [disabled]="busy()" (click)="request(line.reservationId, line.availableCents)">{{ t.request }}</button></p>
            </div>
          }
          @if (credit.requests.length) {
            <div data-credit-requests>
              <p><strong>{{ t.requestsTitle }}</strong></p>
              <ul>@for (q of credit.requests; track q.id) { <li>{{ q.reservationId }} · {{ cop(q.amountCents) }} · <strong>{{ t.state[q.state] }}</strong> {{ t.requestedOn(date(q.requestedAt)) }}</li> }</ul>
              <p>{{ t.requestsNote }}</p>
            </div>
          }
          @if (!credit.sources.length && !credit.requests.length) { <p>{{ t.empty }}</p> }
          @if (failed()) { <p role="alert" data-credit-error>{{ t.failed }}</p> }
        </div>
      }
    }`,
})
export class CustomerCreditPanelComponent {
  protected readonly t = CUSTOMER_CREDIT_COPY; protected readonly cop = formatCop; protected readonly date = formatDate; protected readonly tours = CLIENT_AREA.tours;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly state = signal<State>({ kind: 'loading' }); protected readonly busy = signal(false); protected readonly failed = signal(false);
  private readonly source = inject(CustomerCreditSource); private readonly writer = inject(CustomerCreditWriter); private readonly intention = new IntentionKey(inject(IdempotencyKeys));
  private reads = 0;

  constructor() { this.load(); }

  protected data(s: State): CustomerCredit { return s.kind === 'data' ? s.credit : { totalCents: 0, sources: [], requests: [] }; }

  protected load(): void {
    const mine = ++this.reads;
    this.source.mine().subscribe({ next: (credit) => { if (mine === this.reads) this.state.set({ kind: 'data', credit }); }, error: () => { if (mine === this.reads) this.state.set({ kind: 'error' }); } });
  }

  /** The mockup requests everything available of the origin; the key follows the body and is renewed once the service answered. */
  protected request(reservationId: string, availableCents: number): void {
    if (this.busy()) return;
    this.busy.set(true); this.failed.set(false);
    this.writer.requestRefund(reservationId, availableCents, this.intention.keyFor({ reservationId, availableCents })).subscribe({
      next: () => { this.intention.settle(); this.busy.set(false); this.load(); },
      error: () => { this.busy.set(false); this.failed.set(true); },
    });
  }
}

const offered = (injector: Injector) => injector.get(CustomerCreditSource, null) !== null && injector.get(CustomerCreditWriter, null) !== null;
/** Registered in mount-entry.ts: the panel of 17B, only when the build provides the customer credit ports. */
export const CUSTOMER_CREDIT_CONTRIBUTIONS: Provider[] = [contribute(MY_PAYMENTS_CREDIT, { component: CustomerCreditPanelComponent, order: 0, isAvailable: offered })];

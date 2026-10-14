import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { PaymentMethodsSource } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { formatCop } from '../../shared/format';
import { PageState } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PAYMENTS_PAGE_PANELS, PAYMENTS_ROW_ACTIONS, PAYMENTS_TABLE_BODIES, PortalSlotOutlet, slotEntries } from '../../shared/portal-slots';
import { PaymentLabels, modalityOf, paymentLabels } from '../components/reservation-payments-block.component';
import { PendingProof, PendingProofs, PendingProofsSource } from '../data/proof-review-ports';
import { PAYMENTS_TEXT } from '../payments-copy';
import { PROOF_REVIEW_TEXT } from '../proof-review-copy';

type State = PageState<PendingProofs & { labels: PaymentLabels }>;

/** Screen 13 (admin-pagos.html): "Pagos pendientes" with the Revisión vencida mark; 011 adds row actions, 016 its panel (slots). */
@Component({
  selector: 'app-payments-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [PortalSlotOutlet],
  template: `
    <header class="crp-page-header"><div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ t.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ t.title }}</h1></div>
      <button type="button" class="crp-operator-outline crp-page-header-action" (click)="navigation?.open('reservations')">{{ t.reservations }}</button></header>
    <section class="crp-proof-review-hero"><div><p class="crp-operator-eyebrow">{{ t.heroEyebrow }}</p><h2>{{ t.heroTitle }}</h2></div><p>{{ t.heroCopy }}</p></section>
    @let s = state();
    <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ t.listEyebrow }}</p><h2>{{ t.listTitle }}</h2></div>
        @if (s.kind === 'data' || s.kind === 'empty') { <span class="crp-operator-status crp-is-pending">{{ t.pending(s.kind === 'data' ? waiting(s.items[0].rows) : 0) }}</span> }</div>
      @switch (s.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ common.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ common.failed }} <button type="button" class="crp-operator-outline" (click)="s.retry()">{{ common.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ t.empty }}</p> }
        @case ('data') { @let d = s.items[0];
          <div data-state="data">@if (d.overdueCount && canDecide) { <p class="crp-access-note">{{ t.overdue(d.overdueCount) }}</p> }
            <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr>@for (column of t.columns; track column) { <th>{{ column }}</th> }</tr></thead>
              <tbody>@for (row of d.rows; track row.payment.id) { @let r = row.reservation;
                <tr><td><strong>#{{ r.id }}</strong></td><td>{{ r.leadCustomerName }}</td><td>{{ modality(r, d.labels) }}</td><td>{{ money(row.payment.amountCents) }}</td>
                  <td><span class="crp-operator-status" [class]="statusClass[row.payment.proofStatus]">{{ common.proofStatus[row.payment.proofStatus] }}{{ row.overdue ? ' · ' + t.overdueMark : '' }}</span></td>
                  <td>@if (row.payment.proofStatus === 'EN_VALIDACION') { <button type="button" (click)="open(row)">{{ canDecide ? t.validate : t.view }}</button><ng-container *crpSlot="rowActions; inputs: { reservation: r }" /> }
                    @else { {{ t.noAction }} }</td></tr>
              }</tbody><ng-container *crpSlot="tableBodies; inputs: { proofs: d.rows.length }" /></table></div></div>
        }
      }
    </section>
    <ng-container *crpSlot="panels" />
  `,
})
export class PaymentsPageComponent {
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(PendingProofsSource); private readonly methods = inject(PaymentMethodsSource);
  protected readonly canDecide = inject(PortalCapabilities).canDecideProof();
  protected readonly t = PROOF_REVIEW_TEXT; protected readonly common = PAYMENTS_TEXT; protected readonly money = formatCop; protected readonly modality = modalityOf;
  protected readonly rowActions = PAYMENTS_ROW_ACTIONS; protected readonly panels = PAYMENTS_PAGE_PANELS; protected readonly tableBodies = PAYMENTS_TABLE_BODIES;
  /** The rows of other stories (011) draw the table too; the badge counts only the proofs (what it counts is NO DEFINIDO). */
  private readonly bodies = slotEntries(PAYMENTS_TABLE_BODIES, inject(Injector)).length > 0;
  private readonly requests = new Subject<void>();
  protected readonly state = toSignal(this.requests.pipe(startWith(undefined), switchMap(() => defer(() => forkJoin({ proofs: this.source.list(), labels: paymentLabels(this.methods) })).pipe(
    map(({ proofs, labels }): State => (proofs.rows.length || this.bodies ? { kind: 'data', items: [{ ...proofs, labels }] } : { kind: 'empty' })),
    catchError(() => of<State>({ kind: 'error', retry: () => this.requests.next() })), startWith<State>({ kind: 'loading' })))), { initialValue: { kind: 'loading' } as State });
  protected readonly statusClass: Readonly<Record<string, string>> = { EN_VALIDACION: 'crp-is-pending', SIN_COMPROBANTE: 'crp-is-pending', APROBADO: 'crp-is-confirmed', RECHAZADO: 'crp-is-cancelled' };
  protected waiting(rows: readonly PendingProof[]): number { return rows.filter((row) => row.payment.proofStatus === 'EN_VALIDACION').length; }
  protected open(row: PendingProof): void { this.navigation?.open('payments-validate', { reservation: row.reservation.id, payment: row.payment.id }); }
}

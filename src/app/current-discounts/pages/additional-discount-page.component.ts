import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { formatCop, formatDate } from '../../shared/format';
import { pesosText } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { AdditionalDiscountFormComponent } from '../components/additional-discount-form.component';
import { ADDITIONAL_DISCOUNT_COPY } from '../current-discounts-copy';
import { AdditionalDiscountContext, AdditionalDiscountContexts } from '../data/additional-discount-contexts';
import { ADDITIONAL_DISCOUNT_MODE } from '../data/additional-discount-eligibility';

export type AdditionalDiscountState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; context: AdditionalDiscountContext };

/**
 * admin-aplicar-descuento.html (amendment 2026-10-14): the additional discount of ONE chosen reservation, opened with { reservation }.
 * Four states; only the Tenant Administrator reaches it (AC-CD.7); every value arrives resolved by the port.
 */
@Component({
  selector: 'app-additional-discount-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent, AdditionalDiscountFormComponent],
  template: `
    <header class="crp-page-header">
      <div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ text.eyebrow }}</p><h1 class="crp-page-header-title crp-h1">{{ text.title }}</h1></div>
      <button class="crp-operator-outline crp-page-header-action" type="button" (click)="back()">{{ text.back }}</button>
    </header>
    @if (!allowed) { <p role="alert" data-state="denied">{{ text.denied }}</p> } @else {
      <p class="crp-access-note">{{ text.access }}</p>
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="current" [fallback]="text.failed" />
          <button class="crp-operator-outline" type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ text.notFound }}</p> }
        @case ('data') {
          @let c = current.context;
          <section class="crp-operator-panel crp-additional-discount-panel" data-state="data">
            <p class="crp-operator-eyebrow">{{ text.contextStep }}</p>
            <h2>{{ text.contextTitle }}</h2>
            <div class="crp-form-grid">
              @for (fact of facts(c); track fact[0]; let position = $index) { <div class="crp-reservations-field"><label [for]="'additional-discount-fact-' + position">{{ fact[0] }}</label>
                <input type="text" readonly [id]="'additional-discount-fact-' + position" [value]="fact[1]"></div> }
            </div>
          </section>
          @if (c.eligible) { <app-additional-discount-form [context]="c" /> }
          @else if (c.applied; as done) { <p role="status">{{ text.alreadyApplied(percentage(done.basisPoints), date(done.appliedAt), done.appliedBy) }}</p> }
          @else { <p role="status">{{ text.closed(c.stateLabel) }}</p> }
        }
      }
    }
  `,
})
export class AdditionalDiscountPageComponent {
  protected readonly allowed = inject(PortalCapabilities).canAuthorizeAdditionalDiscount();
  private readonly contexts = inject(AdditionalDiscountContexts); private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly text = ADDITIONAL_DISCOUNT_COPY; private readonly reservationId = this.navigation?.params()['reservation'] ?? ''; private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => this.contexts.of(this.reservationId).pipe(
    map((context): AdditionalDiscountState => context ? { kind: 'data', context } : { kind: 'empty' }),
    catchError((error) => of<AdditionalDiscountState>({ kind: 'error', ...readFailure(error) })), startWith<AdditionalDiscountState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as AdditionalDiscountState });
  constructor() { this.reload(); }
  reload(): void { if (this.allowed) this.requests.next(); }
  protected readonly percentage = pesosText; protected readonly date = formatDate;
  protected back(): void { this.navigation?.open('reservations', { mode: ADDITIONAL_DISCOUNT_MODE }); }
  /** Panel 01: label and formatted value, in the order of the mockup. */
  protected facts(c: AdditionalDiscountContext): readonly (readonly [string, string])[] {
    const t = this.text;
    return [[t.reservation, `#${c.reservationId}`], [t.customer, c.customerName], [t.service, c.serviceName], [t.currentValue, formatCop(c.currentValueCents)],
      [t.general, c.generalDiscountCents ? `${formatCop(c.generalDiscountCents)} ${t.generalSet}` : t.noGeneral], [t.paid, formatCop(c.paidCents)]];
  }
}

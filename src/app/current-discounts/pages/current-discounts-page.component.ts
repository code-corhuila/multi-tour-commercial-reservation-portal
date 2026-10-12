import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
import { AdditionalDiscountFormComponent } from '../components/additional-discount-form.component';
import { CurrentDiscountsValueComponent } from '../components/current-discounts-value.component';
import { CurrentDiscountsSource } from '../data/current-discounts-source';
import { AdditionalDiscount, CURRENT_DISCOUNTS_TEXT, PricedService, applyDiscounts, canAuthorizeAdditionalDiscount } from '../model/current-discounts';
export type CurrentDiscountsState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; items: readonly PricedService[] };

/** T-04: four states; every role reads the breakdown, only the Tenant Administrator gets the form (RN-CD6). */
@Component({
  selector: 'app-current-discounts-page', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdditionalDiscountFormComponent, CurrentDiscountsValueComponent],
  template: `
    <section class="current-discounts">
      <h1>{{ text.title }}</h1>
      <label for="current-discounts-date">{{ text.date }}</label>
      <input id="current-discounts-date" type="date" [value]="date()" (change)="pick($event)">
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
        @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
        @case ('data') {
          <ul data-state="data" class="current-discounts-services">
            @for (row of rows(); track row.service.serviceId) {
              <li><h2>{{ row.service.serviceName }}</h2>
                <app-current-discounts-value [breakdown]="row.breakdown" />
                @if (mayAuthorize) { <app-additional-discount-form [serviceId]="row.service.serviceId" (saved)="onSaved($event)" /> }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class CurrentDiscountsPageComponent {
  protected readonly mayAuthorize = canAuthorizeAdditionalDiscount(inject(ActorContext));
  private readonly source = inject(CurrentDiscountsSource);
  protected readonly text = CURRENT_DISCOUNTS_TEXT;
  /** DP-CD1 open: the demo checks validity against the date the person picks. */
  protected readonly date = signal(new Date().toLocaleDateString('en-CA'));
  private readonly additional = signal<Readonly<Record<string, AdditionalDiscount>>>({});
  private readonly requests = new Subject<string>();
  readonly state = toSignal(this.requests.pipe(switchMap((date) => this.source.list(date).pipe(
    map((items): CurrentDiscountsState => items.length ? { kind: 'data', items } : { kind: 'empty' }),
    catchError(() => of<CurrentDiscountsState>({ kind: 'error' })), startWith<CurrentDiscountsState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as CurrentDiscountsState });
  protected readonly rows = computed(() => {
    const current = this.state();
    return current.kind !== 'data' ? [] : current.items.map((service) => ({
      service, breakdown: applyDiscounts(service.baseCents, service.rules, this.date(), this.additional()[service.serviceId]) }));
  });
  constructor() { this.reload(); }
  reload(): void { this.requests.next(this.date()); }
  protected pick(event: Event): void {
    const picked = (event.target as HTMLInputElement).value;
    if (picked) { this.date.set(picked); this.additional.set({}); this.reload(); }
  }
  protected onSaved(stored: AdditionalDiscount): void { this.additional.update((all) => ({ ...all, [stored.serviceId]: stored })); }
}

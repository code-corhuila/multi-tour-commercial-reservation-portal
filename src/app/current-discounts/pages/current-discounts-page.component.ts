import { Clock, tenantDay } from '../../shared/clock';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { formatDate } from '../../shared/format';
import { AdditionalDiscountFormComponent } from '../components/additional-discount-form.component';
import { CurrentDiscountsValueComponent } from '../components/current-discounts-value.component';
import { CurrentDiscountsSource } from '../data/current-discounts-source';
import { DiscountBreakdowns } from '../data/discount-breakdowns';
import { AdditionalDiscount, CURRENT_DISCOUNTS_TEXT, PricedService } from '../model/current-discounts';
import { PortalCapabilities } from '../../shared/portal-capabilities';
export type CurrentDiscountsState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; items: readonly PricedService[] };

/**
 * T-04: screen admin-aplicar-descuento.html. Four states; every role reads the breakdown, only the Tenant Administrator
 * gets panel 02 (RN-CD6). Panel "Reserva seleccionada" and "Volver a reservas" wait for HU-COM-007: a service is chosen instead.
 */
@Component({
  selector: 'app-current-discounts-page', changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdditionalDiscountFormComponent, CurrentDiscountsValueComponent],
  template: `
    <header class="crp-page-header">
      <div class="crp-page-header-main">
        <p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ text.eyebrow }}</p>
        <h1 class="crp-page-header-title crp-h1">{{ text.title }}</h1>
      </div>
    </header>
    <section class="crp-operator-panel">
      <p class="crp-operator-eyebrow">{{ text.valuesStep }}</p>
      <h2>{{ text.valuesTitle }}</h2>
      <div class="crp-current-discounts-date">
        <label for="current-discounts-date">{{ text.date }}</label>
        <input id="current-discounts-date" type="date" [value]="date()" (change)="pick($event)">
        <p>{{ text.validOn }} {{ formatDate(date()) }}</p>
      </div>
      @let current = state();
      @switch (current.kind) {
        @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
        @case ('error') {
          <div role="alert" data-state="error">{{ text.failed }}
            <button class="crp-operator-outline" type="button" (click)="reload()">{{ text.retry }}</button></div>
        }
        @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
        @case ('data') {
          <ul data-state="data" class="crp-current-discounts-services">
            @for (row of rows(); track row.service.serviceId) {
              <li><h3>{{ row.service.serviceName }}</h3><app-current-discounts-value [breakdown]="row.breakdown" /></li>
            }
          </ul>
        }
      }
    </section>
    @if (mayAuthorize && rows().length) {
      <section class="crp-operator-panel">
        <p class="crp-operator-eyebrow">{{ text.authorizationStep }}</p>
        <h2>{{ text.authorizationTitle }}</h2>
        <label for="current-discounts-service">{{ text.service }}</label>
        <select id="current-discounts-service" name="service" [value]="selectedId()" (change)="choose($event)">
          @for (row of rows(); track row.service.serviceId) { <option [value]="row.service.serviceId">{{ row.service.serviceName }}</option> }
        </select>
        <app-additional-discount-form [serviceId]="selectedId()" (saved)="onSaved($event)" />
      </section>
    }
  `,
})
export class CurrentDiscountsPageComponent {
  protected readonly mayAuthorize = inject(PortalCapabilities).canAuthorizeAdditionalDiscount();
  private readonly source = inject(CurrentDiscountsSource);
  private readonly breakdowns = inject(DiscountBreakdowns);
  protected readonly text = CURRENT_DISCOUNTS_TEXT;
  protected readonly formatDate = formatDate;
  /** DP-CD1 open: the demo checks validity against the date the person picks. */
  protected readonly date = signal(tenantDay(inject(Clock).now()));
  private readonly additional = signal<Readonly<Record<string, AdditionalDiscount>>>({});
  private readonly chosen = signal('');
  private readonly requests = new Subject<string>();
  readonly state = toSignal(this.requests.pipe(switchMap((date) => this.source.list(date).pipe(
    map((items): CurrentDiscountsState => items.length ? { kind: 'data', items } : { kind: 'empty' }),
    catchError(() => of<CurrentDiscountsState>({ kind: 'error' })), startWith<CurrentDiscountsState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as CurrentDiscountsState });
  protected readonly rows = computed(() => {
    const current = this.state();
    return current.kind !== 'data' ? [] : current.items.map((service) => ({
      service, breakdown: this.breakdowns.of(service.baseCents, service.rules, this.date(), this.additional()[service.serviceId]) }));
  });
  /** The chosen service while it is listed, otherwise the first one. */
  protected readonly selectedId = computed(() => {
    const ids = this.rows().map((row) => row.service.serviceId);
    return ids.includes(this.chosen()) ? this.chosen() : ids[0] ?? '';
  });
  constructor() { this.reload(); }
  reload(): void { this.requests.next(this.date()); }
  protected pick(event: Event): void {
    const picked = (event.target as HTMLInputElement).value;
    if (picked) { this.date.set(picked); this.additional.set({}); this.reload(); }
  }
  protected choose(event: Event): void { this.chosen.set((event.target as HTMLSelectElement).value); }
  protected onSaved(stored: AdditionalDiscount): void { this.additional.update((all) => ({ ...all, [stored.serviceId]: stored })); }
}

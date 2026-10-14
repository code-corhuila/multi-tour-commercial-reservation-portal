import { ChangeDetectionStrategy, Component, Injector, afterNextRender, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, map, of, startWith, switchMap, throwError } from 'rxjs';
import { CatalogItemsSource } from '../../catalog/data/catalog-api.service';
import { CatalogItem } from '../../catalog/data/catalog-api.service';
import { DiscountRulesSource } from '../../discounts/data/discount-rules-source';
import { DiscountRule } from '../../discounts/data/discount-rules-source';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { formatCop, formatDate } from '../../shared/format';
import { CustomerContext } from '../data/customer-context';
import { MyReservationsSource } from '../data/my-reservations-source';
import { ReservationSelectionSource } from '../data/reservation-confirmation-ports';
import { CustomerReservation, RESERVATION_FLOW, SELF_SERVICE_TEXT, reservationState } from '../model/self-service-reservation';
import { SESSION_TEXT } from '../../shared/session-copy';
import { SESSION_IDENTITY } from '../../shared/session-identity';
import { tourPhoto } from '../../shared/tour-photo';
import { CLIENT_QUICK_ACTIONS, PortalSlotOutlet, slotEntries } from '../../shared/portal-slots';

/** The texts of panel-cliente.html (authorized screen 17), without the parts of other stories (payments, notifications). */
const PANEL_TEXT = {
  eyebrow: 'Portal cliente',
  intro: 'Consulta la oferta disponible, revisa tus reservas y continúa la gestión de tus próximos viajes desde un solo lugar.',
  searchLabel: 'Buscar tours o establecimientos asociados',
  searchPlaceholder: 'Buscar tours o experiencias...',
  search: 'Buscar',
  reservations: 'Mis reservas',
  noActive: 'No tienes reservas activas',
  noActiveCopy: 'Explora el catálogo y selecciona los servicios para comenzar una nueva reserva.',
  seeReservations: 'Ver mis reservas',
  consult: 'Consulta en Mis reservas',
  own: 'Reservas propias',
  quick: 'Acciones rápidas',
  discounts: 'Descuentos vigentes',
  noDiscounts: 'No hay descuentos vigentes en este momento.',
  validUntil: 'Válido hasta',
  featured: 'Experiencias destacadas',
  noFeatured: 'No hay opciones disponibles en este momento.',
  from: 'Desde',
  detail: 'Ver detalle',
} as const;

const CHIPS = [
  { key: CLIENT_AREA.gastronomy, label: 'Restaurantes asociados' }, { key: CLIENT_AREA.tours, label: 'Tours' }, { key: CLIENT_AREA.lodging, label: 'Alojamiento asociado' },
];
const QUICK = [
  { key: CLIENT_AREA.tours, icon: 'NR', title: 'Nueva reserva', copy: 'Inicia una nueva reserva' },
  { key: CLIENT_AREA.gastronomy, icon: 'GA', title: 'Restaurantes asociados', copy: 'Consulta los datos de contacto de restaurantes asociados.' },
];
const ACTIVE_STATES = ['PENDING_PAYMENT', 'CONFIRMED', 'IN_EXECUTION'];

type Part<T> = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; items: readonly T[] };
const partOf = <T>(read: Observable<readonly T[]>) => read.pipe(
  map((items): Part<T> => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
  catchError(() => of<Part<T>>({ kind: 'error' })),
  startWith<Part<T>>({ kind: 'loading' }),
);

/** The active reservations as the card of panel-cliente.html reads them: count, states and codes. */
export function activeSummary(reservations: readonly CustomerReservation[]) {
  const active = reservations.filter((r) => ACTIVE_STATES.includes(r.reservationStatus));
  const byState = new Map<string, number>();
  active.forEach((r) => byState.set(reservationState(r.reservationStatus)[0], (byState.get(reservationState(r.reservationStatus)[0]) ?? 0) + 1));
  return {
    title: active.length ? `${active.length} ${active.length === 1 ? 'reserva activa' : 'reservas activas'}` : PANEL_TEXT.noActive,
    detail: active.length ? Array.from(byState, ([label, count]) => `${count} ${label}`).join(' · ') : PANEL_TEXT.noActiveCopy,
    codes: active.map((r) => r.reservationId).join(' · '),
  };
}

/** "20% de descuento", from the percentage of the rule of HU-COM-003. */
function discountTag(rule: DiscountRule): string {
  return `${String(rule.percentageBasisPoints / 100).replace('.', ',')}% de descuento`;
}

/** panel-cliente.html: the landing of the final customer and the Mis reservas link of the client header. It changes nothing. */
@Component({
  selector: 'app-client-panel-page',
  imports: [PortalSlotOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-panel-hero" aria-labelledby="crp-panel-title">
      <p class="crp-panel-eyebrow">{{ t.eyebrow }}</p>
      <h1 id="crp-panel-title">{{ greeting }}</h1>
      <p>{{ t.intro }}</p>
      <div class="crp-panel-search">
        <label for="crp-panel-search">{{ t.searchLabel }}</label>
        <div class="crp-panel-search-row">
          <input id="crp-panel-search" type="search" [placeholder]="t.searchPlaceholder" (keydown.enter)="go(area.tours)" />
          @if (has(area.tours)) { <button type="button" class="crp-primary" (click)="go(area.tours)">{{ t.search }}</button> }
        </div>
        <div class="crp-panel-chips" aria-label="Filtros rápidos">
          @for (chip of chips; track chip.key) { <button type="button" (click)="go(chip.key)">{{ chip.label }}</button> }
        </div>
      </div>
    </section>
    <div class="crp-panel-layout">
      <div>
        <section class="crp-panel-reservations"><h2>{{ t.reservations }}</h2>
          <article class="crp-panel-card">
            @if (isCustomer) {
              @let s = reservations();
              @switch (s.kind) {
                @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
                @case ('error') { <div role="alert" data-state="error">{{ text.failed }} <button type="button" class="crp-outline" (click)="reload()">{{ text.retry }}</button></div> }
                @default {
                  @let summary = summarize(s.kind === 'data' ? s.items : []);
                  <div class="crp-panel-card-main" [attr.data-state]="s.kind"><div><strong>{{ summary.title }}</strong><p>{{ summary.detail }}</p>
                    @if (summary.codes) { <small>{{ summary.codes }}</small> }</div>
                    <div class="crp-panel-card-status"><span class="crp-panel-card-pill">{{ t.consult }}</span>&ngsp;<small>{{ t.own }}</small></div></div>
                }
              }
            } @else { <p role="status">{{ text.panelNotCustomer }}</p> }
            @if (has(area.reservations)) {
              <div class="crp-panel-card-actions"><button type="button" class="crp-primary" (click)="go(area.reservations)">{{ t.seeReservations }}</button>
                <button type="button" class="crp-panel-ghost" (click)="go(area.reservations)">{{ t.seeReservations }}</button></div>
            }
          </article>
        </section>
        @if (quick.length || quickSlots) {
        <section class="crp-panel-quick"><h2>{{ t.quick }}</h2>
          <ul>@for (action of quick; track action.key) {
            <li><button type="button" class="crp-panel-quick-item" (click)="go(action.key)"><span class="crp-panel-quick-icon" aria-hidden="true">{{ action.icon }}</span>&ngsp;<span class="crp-panel-quick-copy"><strong>{{ action.title }}</strong>&ngsp;<span>{{ action.copy }}</span></span></button></li>
          }<ng-container *crpSlot="slots.quick" /></ul>
        </section>
        }
      </div>
      <aside class="crp-panel-discounts"><h2>{{ t.discounts }}</h2>
        @let promos = discounts();
        @if (promos.length) {
          <ul>@for (rule of promos; track rule.id) {
            <li class="crp-panel-promo"><span class="crp-panel-promo-tag">{{ tag(rule) }}</span>&ngsp;<strong>{{ rule.tourName }}</strong>&ngsp;<p>{{ t.validUntil }} {{ date(rule.endsOn) }}</p></li>
          }</ul>
        } @else { <p>{{ t.noDiscounts }}</p> }
      </aside>
    </div>
    <section class="crp-panel-featured"><h2>{{ t.featured }}</h2>
      @let f = featured();
      @switch (f.kind) {
        @case ('loading') { <p role="status">{{ text.loading }}</p> }
        @case ('error') { <p role="alert">{{ text.failed }}</p> }
        @case ('empty') { <p role="status">{{ t.noFeatured }}</p> }
        @case ('data') {
          <ul>@for (item of f.items; track item.serviceId) {
            <li><img [src]="photo(item.serviceId)" [alt]="item.commercialName" loading="lazy" />
              <div class="crp-panel-featured-body"><strong>{{ item.commercialName }}</strong>
                <div class="crp-panel-featured-meta"><small>{{ t.from }}</small>&ngsp;<em>{{ cop(item.baseRateCents) }}</em></div>&ngsp;
                @if (has(area.tours)) { <button type="button" class="crp-panel-link" (click)="go(area.tours)">{{ t.detail }}</button> }
              </div></li>
          }</ul>
        }
      }
    </section>
  `,
})
export class ClientPanelPageComponent {
  protected readonly t = PANEL_TEXT;
  protected readonly text = SELF_SERVICE_TEXT;
  /** HU-FRT-001 (003-): the display name of the session as text, or the generic greeting when there is none. */
  protected readonly greeting = ((name) => (name ? SESSION_TEXT.greeting(name) : SESSION_TEXT.anonymousGreeting))(inject(SESSION_IDENTITY).name);
  protected readonly area = CLIENT_AREA;
  protected readonly photo = tourPhoto;
  protected readonly cop = formatCop;
  protected readonly date = formatDate;
  protected readonly tag = discountTag;
  protected readonly summarize = activeSummary;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly chips = CHIPS.filter((chip) => this.has(chip.key));
  protected readonly quick = QUICK.filter((action) => this.has(action.key));
  /** HU-COM-001 portal foundation of 2026-10-13: what other stories add to Acciones rápidas (Notificaciones is the bell of the shell header); nothing by default. */
  protected readonly slots = { quick: CLIENT_QUICK_ACTIONS };
  private readonly injector = inject(Injector);
  protected readonly quickSlots = slotEntries(CLIENT_QUICK_ACTIONS, this.injector).length;
  protected readonly isCustomer = inject(CustomerContext).isFinalCustomer;
  private readonly source = inject(MyReservationsSource);
  private readonly requests = new Subject<void>();
  protected readonly reservations = toSignal(this.requests.pipe(switchMap(() => partOf(this.source.listMine()))), { initialValue: { kind: 'loading' } as Part<CustomerReservation> });
  private readonly today = new Date().toLocaleDateString('en-CA');
  // Read-only: the rules of HU-COM-003 in force today. Without the port, or if it fails, there is nothing in force to show.
  protected readonly discounts = toSignal((inject(DiscountRulesSource, { optional: true })?.list() ?? of<readonly DiscountRule[]>([])).pipe(
    map((rules) => rules.filter((rule) => rule.status === 'ACTIVE' && rule.startsOn <= this.today && this.today <= rule.endsOn)),
    catchError(() => of<readonly DiscountRule[]>([])),
  ), { initialValue: [] as readonly DiscountRule[] });
  // The base value of up to four active tours of the catalog of HU-COM-001; never a cost or a capacity.
  protected readonly featured = toSignal(partOf((inject(CatalogItemsSource, { optional: true })?.list()
    ?? throwError(() => new Error('No catalog port'))).pipe(
    map((items: readonly CatalogItem[]) => items.filter((item) => item.serviceType === 'TOUR' && item.catalogStatus === 'ACTIVE').slice(0, 4)),
  )), { initialValue: { kind: 'loading' } as Part<CatalogItem> });

  constructor() {
    this.reload();
    // DP-RS1: a selection in the URL means a reservation in progress, so Finalizar reserva opens at once.
    if (inject(ReservationSelectionSource).current()) { afterNextRender(() => this.go(RESERVATION_FLOW.finish)); }
  }

  reload(): void { if (this.isCustomer) { this.requests.next(); } }

  protected has(key: string): boolean { return this.navigation?.has(key) ?? false; }

  protected go(key: string): void { this.navigation?.open(key); }
}

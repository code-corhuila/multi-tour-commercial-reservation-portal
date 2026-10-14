import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap, tap } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { RESCHEDULING_AREA } from '../../rescheduling/data/rescheduling-ports';
import { formatDate } from '../../shared/format';
import { ReservationFormComponent } from '../components/reservation-form.component';
import { ReservationViewComponent } from '../components/reservation-view.component';
import { ReservationsSource } from '../data/reservations-source';
import { Reservation, STATUS_CLASS, money } from '../model/reservation';
import { RESERVATION_TEXT, STATUS_LABEL, paymentState, travelers } from '../reservations-copy';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { PortalSlotOutlet, RESERVATION_DETAIL_ACTIONS, RESERVATION_ROW_ACTIONS } from '../../shared/portal-slots';

type PageState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; items: readonly Reservation[] };
type View = { kind: 'list' | 'create' } | { kind: 'created' | 'detail'; reservation: Reservation };
const archived = (r: Reservation) => r.status === 'FINALIZADA' || r.status === 'CANCELADA';
/** Eyebrow and title of screens 10, 10B, 10C and 10A. */
const HEADERS: Record<View['kind'], readonly [string, string]> = {
  list: ['Gestión comercial', 'Reservas'], create: ['Gestión comercial', 'Crear reserva'],
  created: ['Registro completado', 'Reserva registrada'], detail: ['Consulta de reserva', 'Detalle de reserva'],
};

@Component({
  selector: 'app-reservations-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationFormComponent, ReservationViewComponent, PortalSlotOutlet],
  styles: [`.crp-reservation-hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; } .crp-reservation-hero p { margin: 6px 0 0; max-width: 520px; }
    .crp-reservation-code { display: block; color: #203234; font-weight: 800; } small { display: block; margin-top: 4px; color: #748084; }`],
  template: `
    @let v = view();
    <header class="crp-page-header">
      <div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ headers[v.kind][0] }}</p><h1 class="crp-page-header-title crp-h1">{{ headers[v.kind][1] }}</h1></div>
      @if (v.kind === 'list') { @if (canCreate) { <button type="button" class="crp-operator-primary crp-page-header-action" (click)="view.set({ kind: 'create' })">{{ text.create }}</button> } }
      @else if (v.kind === 'create') { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="view.set({ kind: 'list' })">{{ text.cancel }}</button> }
      @else { @if (v.kind === 'detail') { <ng-container *crpSlot="detailActions; inputs: { reservation: v.reservation }" /> }<button type="button" class="crp-operator-outline crp-page-header-action" (click)="view.set({ kind: 'list' })">{{ text.back }}</button> }
    </header>
    @switch (v.kind) {
      @case ('create') { @if (canCreate) { <app-reservation-form (created)="onCreated($event)" (cancelled)="view.set({ kind: 'list' })" /> } }
      @case ('created') { <app-reservation-view [reservation]="v.reservation" [fresh]="true" (detail)="view.set({ kind: 'detail', reservation: v.reservation })" /> }
      @case ('detail') { <app-reservation-view [reservation]="v.reservation" /> }
      @default {
        <section class="crp-operator-panel crp-reservation-hero"><div><p class="crp-operator-eyebrow">{{ text.followEyebrow }}</p><h2>{{ text.followTitle }}</h2></div><p>{{ text.followNote }}</p></section>
        <section class="crp-operator-panel">
          <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.listEyebrow }}</p><h2>{{ text.listTitle }}</h2></div>
            @if (hasArchived()) { <button type="button" class="crp-operator-outline" [attr.aria-expanded]="showAll()" (click)="showAll.set(!showAll())">{{ showAll() ? text.active : text.all }}</button> }</div>
          @let current = state();
          @switch (current.kind) {
            @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
            @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" class="crp-operator-outline" (click)="reload()">{{ text.retry }}</button></div> }
            @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
            @case ('data') {
              <div class="crp-table-wrap" data-state="data"><table class="crp-operator-table">
                <thead><tr>@for (column of text.columns; track column) { <th>{{ column }}</th> }</tr></thead>
                <tbody>@for (r of shown(current.items); track r.id) {
                  <tr><td><span class="crp-reservation-code">#{{ r.id }}</span><small>{{ date(r.departureDate) }} · {{ travelers(r.people) }}</small></td>
                    <td>{{ r.leadCustomerName }}</td><td>{{ r.tourName }}</td>
                    <td><span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span></td><td><small>{{ paymentState(r) }}</small><br><strong>{{ money(r.balanceCents) }}</strong></td>
                    <td><button type="button" (click)="view.set({ kind: 'detail', reservation: r })">{{ text.view }}</button><ng-container *crpSlot="rowActions; inputs: { reservation: r }" />
                    @if (payLabel(r); as label) { <span> · </span><button type="button" (click)="open('payment-management', r)">{{ label }}</button> }
                    @if (reschedulable(r)) { <span> · </span><button type="button" (click)="open(rescheduling, r)">{{ text.reschedule }}</button> }</td></tr>
                }</tbody>
              </table></div>
            }
          }
        </section>
      }
    }
  `,
})
export class ReservationsPageComponent {
  protected readonly canCreate = inject(PortalCapabilities).canCreateReservations();
  private readonly source = inject(ReservationsSource);
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly travelers = travelers;
  protected readonly status = STATUS_LABEL;
  protected readonly badge = STATUS_CLASS;
  protected readonly headers = HEADERS;
  protected readonly paymentState = paymentState;
  protected readonly rescheduling = RESCHEDULING_AREA;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  /** Mockup 10: Finalizada and Cancelada stay out of the list until "Ver todas las reservas". */
  protected readonly showAll = signal(false);
  protected readonly hasArchived = computed(() => { const c = this.state(); return c.kind === 'data' && c.items.some(archived); });
  protected shown(items: readonly Reservation[]): readonly Reservation[] { return this.showAll() ? items : items.filter((r) => !archived(r)); }
  /** Gestionar pago or Ver pago, when the area exists and neither the proof review (a slot) nor the operation takes the cell. */
  protected payLabel(r: Reservation): string | null {
    const reviewing = r.payments?.at(-1)?.proofStatus === 'EN_VALIDACION';
    if (!this.navigation?.has('payment-management') || reviewing || r.status === 'EN_EJECUCION' || r.status === 'FINALIZADA') return null;
    return r.status === 'CANCELADA' || r.balanceCents === 0 ? this.text.seePay : this.text.pay;
  }
  protected reschedulable(r: Reservation): boolean { return !!r.reschedulingPending && !!this.navigation?.has(RESCHEDULING_AREA); }
  protected open(area: string, r: Reservation): void { this.navigation?.open(area, { reservation: r.id }); }
  /** HU-COM-001 portal foundation of 2026-10-13: the actions other stories add to the Acción cell of 10. */
  protected readonly rowActions = RESERVATION_ROW_ACTIONS;
  protected readonly detailActions = RESERVATION_DETAIL_ACTIONS;
  protected readonly view = signal<View>({ kind: 'list' });
  private readonly requests = new Subject<void>();
  /** 001- foundation: a sub-screen opened from 10A returns with { reservation }; its detail opens once listed. */
  private opening = inject(PortalNavigation, { optional: true })?.params()['reservation'];
  private readonly local = signal<PageState | null>(null);
  private readonly listed = toSignal(this.requests.pipe(switchMap(() => this.source.list().pipe(
    tap((items) => { const r = items.find((x) => x.id === this.opening); this.opening = undefined; if (r) this.view.set({ kind: 'detail', reservation: r }); }),
    map((items): PageState => (items.length ? { kind: 'data', items } : { kind: 'empty' })),
    catchError(() => of<PageState>({ kind: 'error' })), startWith<PageState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as PageState });
  readonly state = computed(() => this.local() ?? this.listed());
  constructor() { this.reload(); }
  reload(): void { this.local.set(null); this.requests.next(); }
  protected onCreated(created: Reservation): void {
    const current = this.state(), items = current.kind === 'data' ? current.items : [];
    this.local.set({ kind: 'data', items: [created, ...items.filter((r) => r.id !== created.id)] });
    this.view.set({ kind: 'created', reservation: created });
  }
}

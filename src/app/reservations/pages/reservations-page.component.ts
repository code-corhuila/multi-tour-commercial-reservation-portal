import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
import { formatDate } from '../../shared/format';
import { ReservationFormComponent } from '../components/reservation-form.component';
import { ReservationViewComponent } from '../components/reservation-view.component';
import { ReservationsSource } from '../data/reservations-source';
import { RESERVATION_TEXT, Reservation, STATUS_LABEL, canCreateReservations, money } from '../model/reservation';

type PageState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; items: readonly Reservation[] };
type View = { kind: 'list' | 'create' } | { kind: 'created' | 'detail'; reservation: Reservation };
/** Eyebrow and title of screens 10, 10B, 10C and 10A. */
const HEADERS: Record<View['kind'], readonly [string, string]> = {
  list: ['Gestión comercial', 'Reservas'], create: ['Gestión comercial', 'Crear reserva'],
  created: ['Registro completado', 'Reserva registrada'], detail: ['Consulta de reserva', 'Detalle de reserva'],
};

@Component({
  selector: 'app-reservations-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationFormComponent, ReservationViewComponent],
  styles: [`.crp-reservation-code { display: block; color: #203234; font-weight: 800; } small { display: block; margin-top: 4px; color: #748084; }`],
  template: `
    @let v = view();
    <header class="crp-page-header">
      <div class="crp-page-header-main"><p class="crp-page-header-eyebrow crp-operator-eyebrow">{{ headers[v.kind][0] }}</p><h1 class="crp-page-header-title crp-h1">{{ headers[v.kind][1] }}</h1></div>
      @if (v.kind === 'list') { @if (canCreate) { <button type="button" class="crp-operator-primary crp-page-header-action" (click)="view.set({ kind: 'create' })">{{ text.create }}</button> } }
      @else if (v.kind === 'create') { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="view.set({ kind: 'list' })">{{ text.cancel }}</button> }
      @else { <button type="button" class="crp-operator-outline crp-page-header-action" (click)="view.set({ kind: 'list' })">{{ text.back }}</button> }
    </header>
    @switch (v.kind) {
      @case ('create') { @if (canCreate) { <app-reservation-form (created)="onCreated($event)" (cancelled)="view.set({ kind: 'list' })" /> } }
      @case ('created') { <app-reservation-view [reservation]="v.reservation" [fresh]="true" (detail)="view.set({ kind: 'detail', reservation: v.reservation })" /> }
      @case ('detail') { <app-reservation-view [reservation]="v.reservation" /> }
      @default {
        <section class="crp-operator-panel">
          <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.listEyebrow }}</p><h2>{{ text.listTitle }}</h2></div></div>
          @let current = state();
          @switch (current.kind) {
            @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
            @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
            @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
            @case ('data') {
              <div class="crp-table-wrap" data-state="data"><table class="crp-operator-table">
                <thead><tr>@for (column of text.columns; track column) { <th>{{ column }}</th> }</tr></thead>
                <tbody>@for (r of current.items; track r.id) {
                  <tr><td><span class="crp-reservation-code">#{{ r.id }}</span><small>{{ date(r.departureDate) }} · {{ r.people }} viajeros</small></td>
                    <td>{{ r.leadCustomerName }}</td><td>{{ r.tourName }}</td>
                    <td><span class="crp-operator-status crp-is-pending">{{ status[r.status] }}</span></td><td>{{ money(r.quote.finalCents) }}</td>
                    <td><button type="button" (click)="view.set({ kind: 'detail', reservation: r })">{{ text.view }}</button></td></tr>
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
  protected readonly canCreate = canCreateReservations(inject(ActorContext));
  private readonly source = inject(ReservationsSource);
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly status = STATUS_LABEL;
  protected readonly headers = HEADERS;
  protected readonly view = signal<View>({ kind: 'list' });
  private readonly requests = new Subject<void>();
  private readonly local = signal<PageState | null>(null);
  private readonly listed = toSignal(this.requests.pipe(switchMap(() => this.source.list().pipe(
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

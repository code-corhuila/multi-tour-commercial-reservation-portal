import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, startWith, switchMap } from 'rxjs';
import { ActorContext } from '../../catalog/data/catalog-api.service';
import { ReservationBreakdownComponent } from '../components/reservation-breakdown.component';
import { ReservationFormComponent } from '../components/reservation-form.component';
import { ReservationsSource } from '../data/reservations-source';
import { RESERVATION_TEXT, Reservation, canCreateReservations, money } from '../model/reservation';

type PageState = { kind: 'loading' | 'error' | 'empty' } | { kind: 'data'; items: readonly Reservation[] };

@Component({
  selector: 'app-reservations-page', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationFormComponent, ReservationBreakdownComponent],
  template: `
    <h1>{{ text.title }}</h1>
    @if (canCreate) { <button type="button" [disabled]="formOpen()" (click)="formOpen.set(true)">{{ text.create }}</button> }
    @if (canCreate && formOpen()) { <app-reservation-form (created)="onCreated($event)" (cancelled)="formOpen.set(false)" /> }
    @if (selected(); as r) {
      <section class="reservation-detail" [attr.aria-label]="text.detail">
        <h2>{{ r.leadCustomerName }} · {{ r.departureLabel }}</h2>
        <p>{{ text.status }} · {{ text.financial }} · {{ text.noSeat }}</p>
        <p>{{ text.people }}: {{ r.people }}</p>
        <p>{{ text.conditions }}: {{ r.conditions }}</p>
        <app-reservation-breakdown [quote]="r.quote" />
        <button type="button" (click)="selected.set(null)">{{ text.close }}</button>
      </section>
    }
    @let current = state();
    @switch (current.kind) {
      @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
      @case ('error') { <div role="alert" data-state="error">{{ text.failed }}<button type="button" (click)="reload()">{{ text.retry }}</button></div> }
      @case ('empty') { <p role="status" data-state="empty">{{ text.empty }}</p> }
      @case ('data') {
        <ul data-state="data">@for (r of current.items; track r.id) {
          <li><button type="button" (click)="selected.set(r)">{{ r.leadCustomerName }} · {{ r.departureLabel }} · {{ money(r.quote.finalCents) }}</button></li>
        }</ul>
      }
    }
  `,
})
export class ReservationsPageComponent {
  protected readonly canCreate = canCreateReservations(inject(ActorContext));
  private readonly source = inject(ReservationsSource);
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
  protected readonly formOpen = signal(false);
  protected readonly selected = signal<Reservation | null>(null);
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
    this.formOpen.set(false); this.selected.set(created);
  }
}

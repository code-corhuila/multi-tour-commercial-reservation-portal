import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Subject, catchError, defer, finalize, map, of, startWith, switchMap } from 'rxjs';
import { CLIENT_AREA, PortalNavigation } from '../../portal-navigation';
import { MyReservationsSource } from '../../self-service-reservation/data/my-reservations-source';
import type { CustomerReservation } from '../../self-service-reservation/data/reservation-confirmation-ports';
import { Clock, tenantDay } from '../../shared/clock';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { readFailure } from '../../shared/read-failure';
import { CustomerCompanionFieldsComponent } from '../../shared/customer-companion-fields.component';
import { CUSTOMER_COMPANIONS_COPY as COPY } from '../../shared/customer-companions-copy';
import { CompanionsRecord, CustomerCompanionsSource, CustomerCompanionsWriter } from '../data/customer-companions-ports';
import { CompanionIssues, CustomerCompanion, companionIssues, companionsFor, paddedCompanions, withCompanionField } from '../../shared/customer-companions';

type ScreenState = { kind: 'loading' | 'empty' | 'error' } | { kind: 'data'; reservation: CustomerReservation; record: CompanionsRecord };
const CLOSED = new Set(['CANCELLED', 'FINALIZED']);

/**
 * HU-COM-005 amendment, customer variant of screen 25 (`acompanantes.html`, AC-PC.15): the companions of the active reservation.
 * The active reservation is the one named by `PortalNavigation` (`reservation`), else the first own one that is not closed (decision D-4).
 */
@Component({
  selector: 'app-customer-companions-page',
  imports: [ReadErrorComponent, CustomerCompanionFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = state();
    <div class="crp-self-service-confirm" aria-labelledby="customer-companions-title">
      <header class="crp-booking-topbar">
        <button type="button" class="crp-booking-back" [style.visibility]="back ? null : 'hidden'" (click)="goBack()"><span aria-hidden="true">←</span>&ngsp;<span>{{ text.back }}</span></button>
        <h1 id="customer-companions-title">{{ text.title }}</h1><span></span>
      </header>
      <div class="crp-finish-content">
        @switch (current.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ text.loading }}</p> }
          @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="current" [fallback]="text.failed" />&ngsp;<button type="button" class="crp-outline" (click)="reload()">{{ text.retry }}</button></div> }
          @case ('empty') { <article class="crp-booking-card" data-state="empty"><h2>{{ text.activeTitle }}</h2><strong>{{ text.none }}</strong><p class="crp-self-service-note">{{ text.noneCopy }}</p></article> }
          @case ('data') {
            <article class="crp-booking-card" data-state="data"><h2>{{ text.activeTitle }}</h2>
              <strong>{{ current.reservation.tourName }}</strong>
              <p class="crp-self-service-note">{{ text.summary(current.reservation.reservationId, required()) }}</p></article>
            @if (required() === 0) {
              <article class="crp-booking-card"><h2>{{ text.noCompanionsTitle }}</h2><p class="crp-self-service-note">{{ text.singleTraveler }}</p></article>
            } @else {
              <form (submit)="$event.preventDefault(); save(current)" novalidate>
                <app-customer-companion-fields [companions]="companions()" variant="standalone" [today]="today()" [issues]="issues()" (changed)="change($event)" />
                <p data-companions-feedback tabindex="-1" aria-live="polite" [class]="saved() ? 'crp-self-service-created' : 'crp-customers-error'">{{ feedback() }}</p>
                <div class="crp-form-actions">
                  <button type="submit" class="crp-primary crp-booking-continue" [disabled]="pending()">{{ text.save }}</button>
                  <button type="button" class="crp-outline" [hidden]="!back" (click)="goBack()">{{ text.backToReservations }}</button>
                </div>
              </form>
            }
          }
        }
      </div>
    </div>
  `,
})
export class CustomerCompanionsPageComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  protected readonly text = COPY;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  protected readonly back = this.navigation?.has(CLIENT_AREA.panel) ? this.navigation : null;
  private readonly mine = inject(MyReservationsSource);
  private readonly source = inject(CustomerCompanionsSource);
  private readonly writer = inject(CustomerCompanionsWriter);
  private readonly intention = new IntentionKey(inject(IdempotencyKeys));
  private readonly lifetime = inject(DestroyRef);
  private readonly clock = inject(Clock);
  protected readonly today = computed(() => tenantDay(this.clock.now()));
  private readonly typed = signal<readonly CustomerCompanion[]>([]);
  protected readonly pending = signal(false);
  protected readonly saved = signal(false);
  protected readonly feedback = signal('');
  protected readonly issues = signal<CompanionIssues | null>(null);
  private readonly requests = new Subject<void>();
  readonly state = toSignal(this.requests.pipe(switchMap(() => this.mine.listMine().pipe(
    switchMap((all) => {
      const wanted = this.navigation?.params()['reservation'];
      const reservation = (wanted ? all.find((r) => r.reservationId === wanted) : undefined) ?? all.find((r) => !CLOSED.has(r.reservationStatus));
      if (!reservation) return of<ScreenState>({ kind: 'empty' });
      return this.source.load(reservation.reservationId).pipe(map((record): ScreenState => ({ kind: 'data', reservation, record })));
    }),
    catchError((error) => of<ScreenState>({ kind: 'error', ...readFailure(error) })),
    startWith<ScreenState>({ kind: 'loading' }),
  ))), { initialValue: { kind: 'loading' } as ScreenState });
  protected readonly required = computed(() => { const s = this.state(); return s.kind === 'data' ? companionsFor(s.reservation.people) : 0; });
  protected readonly companions = computed(() => {
    const s = this.state();
    return paddedCompanions(this.typed().length ? this.typed() : s.kind === 'data' ? s.record.companions : [], this.required());
  });

  constructor() { this.reload(); }

  protected goBack(): void { this.back?.open(CLIENT_AREA.panel); }

  reload(): void { this.typed.set([]); this.requests.next(); }

  protected change(change: { index: number; field: keyof CustomerCompanion; value: string }): void {
    this.typed.set(withCompanionField(this.companions(), this.required(), change.index, change.field, change.value));
    this.saved.set(false);
    this.feedback.set('');
  }

  protected save(current: { reservation: CustomerReservation; record: CompanionsRecord }): void {
    if (this.pending()) return;
    const found = companionIssues(this.companions(), current.record.holderDocument, this.today());
    this.issues.set(found);
    this.saved.set(false);
    this.feedback.set(found.message ?? '');
    if (found.message) { afterNextRender(() => { if (!focusFirstError(this.host)) this.host.querySelector<HTMLElement>('[data-companions-feedback]')?.focus(); }, { injector: this.injector }); return; }
    const reservationId = current.reservation.reservationId, companions = this.companions();
    this.pending.set(true);
    defer(() => this.writer.save(reservationId, companions, this.intention.keyFor({ reservationId, companions }))).pipe(
      takeUntilDestroyed(this.lifetime), finalize(() => this.pending.set(false)),
    ).subscribe({
      complete: () => { this.intention.settle(); this.saved.set(true); this.feedback.set(COPY.saved); },
      error: () => this.feedback.set(COPY.refused),
    });
  }
}

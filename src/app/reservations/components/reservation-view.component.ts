import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, take } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { RESCHEDULING_AREA } from '../../rescheduling/data/rescheduling-ports';
import { departureLine, formatDate } from '../../shared/format';
import { DeparturesSource } from '../data/departures-source';
import { Reservation, STATUS_CLASS, money } from '../model/reservation';
import { DEPARTURE_STATE_LABEL, RESERVATION_TEXT, RESERVATION_VIEW_TEXT, STATUS_LABEL, executionOf, paymentLine, paymentState, persons, travelers } from '../reservations-copy';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import { PortalSlotOutlet, RESERVATION_DETAIL_BLOCKS } from '../../shared/portal-slots';

/** Screen 10C (fresh) or 10A, without the payment parts (cash and payments stories). Renders the snapshot fixed at creation. */
@Component({
  selector: 'app-reservation-view', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationBreakdownComponent, PortalSlotOutlet],
  styles: [`.crp-reservation-hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
    .crp-reservation-hero p { margin: 6px 0 0; } .crp-reservation-panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
    dl { display: grid; gap: 10px; margin: 16px 0 0; } dl div { display: flex; justify-content: space-between; gap: 16px; }
    dt { color: #667579; } dd { margin: 0; font-weight: 700; color: #203234; text-align: right; } .crp-form-actions { margin-top: 22px; }
    .crp-success-mark { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #e3f4ea; color: #1f7a4a; font-weight: 800; }
    @media (max-width: 720px) { .crp-reservation-panels { grid-template-columns: 1fr; } }`],
  template: `
    @let r = reservation();
    @if (fresh()) {
      <div class="reservation-result">
        <section class="crp-operator-panel crp-reservation-hero">
          <span class="crp-success-mark" aria-hidden="true">✓</span>
          <div><p class="crp-operator-eyebrow">{{ text.heroEyebrow }}</p><h2>#{{ r.id }}</h2>
            <p>{{ view.heroNote }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <div class="crp-reservation-panels">
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ view.summary }}</p><h2>{{ r.tourName }}</h2>
            <dl><div><dt>{{ view.departure }}</dt><dd>{{ line(r.departureDate) }}</dd></div><div><dt>{{ view.travelers }}</dt><dd>{{ persons(r.people) }}</dd></div>
              <div><dt>{{ view.holder }}</dt><dd>{{ r.leadCustomerName }}</dd></div><div><dt>{{ view.deadline }}</dt><dd>{{ r.deadline ? deadline() : view.deadlineOnCreate }}</dd></div></dl>
          </article>
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ view.economic }}</p><h2>{{ view.paymentState }}</h2><p><strong>{{ state(r) }}</strong></p>
            <dl><div><dt>{{ view.typeAndMethod }}</dt><dd>{{ pay(r) }}</dd></div><div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ text.projected }}</dt><dd>{{ money(r.quote.projectedCents) }}</dd></div>
              <div><dt>{{ text.applied }}</dt><dd>{{ money(-r.quote.discountCents) }}</dd></div><div><dt>{{ text.balance }}</dt><dd>{{ money(r.balanceCents) }}</dd></div></dl>
          </article>
        </div>
        <section class="crp-operator-panel crp-next-step"><p class="crp-operator-eyebrow">{{ view.nextStep }}</p><h2>{{ view.nextTitle }}</h2>
          <p class="crp-operator-copy">{{ view.nextCopy }}</p>
          <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="detail.emit()">{{ text.view }}</button>
            <ng-container *crpSlot="blocks; inputs: { reservation: r, fresh: true }" /></div>
        </section>
      </div>
    } @else {
      <div class="reservation-detail">
        <section class="crp-operator-panel crp-reservation-hero">
          <div><p class="crp-operator-eyebrow">#{{ r.id }}</p><h2>{{ r.tourName }}</h2><p>{{ view.departureOf }} {{ line(r.departureDate) }} · {{ travelers(r.people) }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <p class="crp-operator-copy">{{ view.consultNote }}</p>
        <div class="crp-reservation-panels">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ view.holderAndTravelers }}</p><h2>{{ r.leadCustomerName }}</h2>
            <dl><div><dt>{{ view.registeredTravelers }}</dt><dd>{{ persons(r.people) }}</dd></div><div><dt>{{ view.registeredCompanions }}</dt><dd>{{ companions(r.people) }}</dd></div></dl>
          </section>
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ view.economic }}</p><h2>{{ money(r.balanceCents) }} {{ r.balanceCents === 0 ? view.noBalance : view.pendingBalance }}</h2>
            <dl><div><dt>{{ text.projected }}</dt><dd>{{ money(r.quote.projectedCents) }}</dd></div><div><dt>{{ text.applied }}</dt><dd>{{ money(-r.quote.discountCents) }}</dd></div>
              <div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ view.validated }}</dt><dd>{{ money(r.validatedCents ?? 0) }}</dd></div>
              <div><dt>{{ view.returned }}</dt><dd>{{ money(r.refund?.execution ? r.refund?.amountCents ?? 0 : 0) }}</dd></div>
              @if (r.paymentType !== 'PARTIAL') { <div><dt>{{ view.minimumDeposit }}</dt><dd>{{ view.notApplicable }}</dd></div> }</dl>
            <app-reservation-breakdown [quote]="r.quote" />
          </section>
        </div>
        <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ view.departureAndDeadlines }}</p><h2>{{ view.associatedDeparture }}</h2></div>
          @if (reschedule) { <button type="button" class="crp-operator-primary" (click)="openRescheduling()">{{ view.manageRescheduling }}</button> }</div>
          <dl><div><dt>{{ view.departureState }}</dt><dd>{{ departureState() }}</dd></div><div><dt>{{ view.deadline }}</dt><dd>{{ deadline() }}</dd></div>
            <div><dt>{{ view.extension }}</dt><dd>{{ extension() }}</dd></div><div><dt>{{ view.cancellationCause }}</dt><dd>{{ r.cancellation?.cause ?? view.notRecorded }}</dd></div></dl>
        </section>
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ view.servicesEyebrow }}</p><h2>{{ view.commercialProjection }}</h2>
          <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr><th>{{ view.service }}</th><th>{{ view.departure }}</th><th>{{ view.quantity }}</th><th>{{ view.executionState }}</th></tr></thead>
            <tbody>@for (line of r.quote.services; track $index) { <tr><td>{{ line.name }}</td><td>{{ date(r.departureDate) }}</td><td>{{ travelers(r.people) }}</td><td>{{ execution(r) }}</td></tr> }</tbody></table></div>
        </section>
        <ng-container *crpSlot="blocks; inputs: { reservation: r, fresh: false }" />
      </div>
    }
  `,
})
export class ReservationViewComponent {
  readonly reservation = input.required<Reservation>();
  /** True right after the creation (screen 10C); false for the detail (screen 10A). */
  readonly fresh = input(false);
  readonly detail = output<void>();
  protected readonly text = RESERVATION_TEXT;
  protected readonly view = RESERVATION_VIEW_TEXT;
  protected readonly status = STATUS_LABEL;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly line = departureLine;
  protected readonly travelers = travelers;
  protected readonly persons = persons;
  protected readonly state = paymentState;
  protected readonly pay = paymentLine;
  protected readonly execution = executionOf;
  protected readonly badge = STATUS_CLASS;
  /** HU-COM-001 portal foundation of 2026-10-13: the blocks other stories add to 10A and 10C. */
  protected readonly blocks = RESERVATION_DETAIL_BLOCKS;
  private readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly departures = inject(DeparturesSource, { optional: true });
  /** The departure of this reservation, when the departures port knows it (the state is read, never recalculated). */
  private readonly departure = toSignal(toObservable(this.reservation).pipe(switchMap((r) => (r.departureId && this.departures
    ? this.departures.list().pipe(take(1), map((all) => all.find((d) => d.id === r.departureId)), catchError(() => of(undefined))) : of(undefined)))));
  protected readonly departureState = computed(() => { const d = this.departure(); return d ? DEPARTURE_STATE_LABEL[d.state] : '—'; });
  private readonly frozen = computed(() => this.departure()?.state === 'CANCELADA' && this.reservation().status !== 'CANCELADA');
  /** Mockup describeOperatorPaymentDeadline, with what the reservation carries. */
  protected readonly deadline = computed(() => {
    const r = this.reservation(), due = r.deadline?.extendedUntil ?? r.deadline?.dueAt;
    if (this.frozen()) return this.view.frozen;
    if (r.status === 'CANCELADA') return this.view.cancelledNoDeadline;
    return due ? this.view.dueOn(due) : this.view.noDeadlineInfo;
  });
  protected readonly extension = computed(() => {
    const r = this.reservation();
    if (r.deadline?.extendedUntil) return this.view.grantedUntil(r.deadline.extendedUntil);
    return r.status === 'PENDIENTE_DE_PAGO' && !this.frozen() ? this.view.availableOnce : this.view.notApplicable;
  });
  protected readonly companions = RESERVATION_VIEW_TEXT.companions;
  /** The rescheduling button exists only while the reservation waits for it and the build has the area. */
  protected get reschedule(): boolean { return !!this.reservation().reschedulingPending && !!this.navigation?.has(RESCHEDULING_AREA); }
  protected openRescheduling(): void { this.navigation?.open(RESCHEDULING_AREA, { reservation: this.reservation().id }); }
}

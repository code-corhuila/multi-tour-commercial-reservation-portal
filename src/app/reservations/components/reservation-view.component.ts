import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap, take } from 'rxjs';
import { PortalNavigation } from '../../portal-navigation';
import { RESCHEDULING_AREA } from '../../rescheduling/data/rescheduling-ports';
import { departureLine, formatDate } from '../../shared/format';
import { DeparturesSource } from '../data/departures-source';
import {
  DEPARTURE_STATE_LABEL, RESERVATION_TEXT, Reservation, STATUS_CLASS, STATUS_LABEL, executionOf, money, paymentLine, paymentState, persons, travelers,
} from '../model/reservation';
import { RESERVATION_VIEW_TEXT } from '../reservations-copy';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import { PortalSlotOutlet, RESERVATION_DETAIL_BLOCKS } from '../../shared/portal-slots';

/** Screen 10C (fresh) or 10A, without the payment parts (cash and payments stories). Renders the snapshot fixed at creation. */
@Component({
  selector: 'app-reservation-view', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationBreakdownComponent, PortalSlotOutlet],
  template: `
    @let r = reservation();
    @if (fresh()) {
      <div class="crp-reservations-result">
        <section class="crp-operator-panel crp-reservations-hero">
          <span class="crp-reservations-success-mark" aria-hidden="true">✓</span>
          <div><p class="crp-operator-eyebrow">{{ text.heroEyebrow }}</p><h2>#{{ r.id }}</h2>
            <p>{{ v.heroNote }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <div class="crp-reservations-panels">
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ v.summary }}</p><h2>{{ r.tourName }}</h2>
            <dl class="crp-reservations-lines"><div><dt>{{ v.departure }}</dt><dd>{{ line(r.departureDate) }}</dd></div><div><dt>{{ v.travelers }}</dt><dd>{{ persons(r.people) }}</dd></div>
              <div><dt>{{ v.lead }}</dt><dd>{{ r.leadCustomerName }}</dd></div><div><dt>{{ v.deadline }}</dt><dd>{{ r.deadline ? deadline() : v.deadlineUndefined }}</dd></div></dl>
          </article>
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ v.economic }}</p><h2>{{ v.payState }}</h2><p><strong>{{ state(r) }}</strong></p>
            <dl class="crp-reservations-lines"><div><dt>{{ v.payLine }}</dt><dd>{{ pay(r) }}</dd></div><div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ text.projected }}</dt><dd>{{ money(r.quote.projectedCents) }}</dd></div>
              <div><dt>{{ text.applied }}</dt><dd>{{ money(-r.quote.discountCents) }}</dd></div><div><dt>{{ text.balance }}</dt><dd>{{ money(r.balanceCents) }}</dd></div></dl>
          </article>
        </div>
        <section class="crp-operator-panel crp-next-step"><p class="crp-operator-eyebrow">{{ v.nextEyebrow }}</p><h2>{{ v.nextTitle }}</h2>
          <p class="crp-operator-copy">{{ v.nextCopy }}</p>
          <div class="crp-form-actions crp-reservations-actions"><button type="button" class="crp-operator-outline" (click)="detail.emit()">{{ text.view }}</button>
            <ng-container *crpSlot="blocks; inputs: { reservation: r, fresh: true }" /></div>
        </section>
      </div>
    } @else {
      <div class="crp-reservations-detail">
        <section class="crp-operator-panel crp-reservations-hero">
          <div><p class="crp-operator-eyebrow">#{{ r.id }}</p><h2>{{ r.tourName }}</h2><p>{{ v.departureNote }} {{ line(r.departureDate) }} · {{ travelers(r.people) }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <p class="crp-operator-copy">{{ v.detailNote }}</p>
        <div class="crp-reservations-panels">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ v.leadAndTravelers }}</p><h2>{{ r.leadCustomerName }}</h2>
            <dl class="crp-reservations-lines"><div><dt>{{ v.registeredTravelers }}</dt><dd>{{ persons(r.people) }}</dd></div><div><dt>{{ v.registeredCompanions }}</dt><dd>{{ companions(r.people) }}</dd></div></dl>
          </section>
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ v.economic }}</p><h2>{{ money(r.balanceCents) }} {{ r.balanceCents === 0 ? v.noBalance : v.pending }}</h2>
            <dl class="crp-reservations-lines"><div><dt>{{ text.projected }}</dt><dd>{{ money(r.quote.projectedCents) }}</dd></div><div><dt>{{ text.applied }}</dt><dd>{{ money(-r.quote.discountCents) }}</dd></div>
              <div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ v.validated }}</dt><dd>{{ money(r.validatedCents ?? 0) }}</dd></div>
              <div><dt>{{ v.refunded }}</dt><dd>{{ money(r.refund?.execution ? r.refund?.amountCents ?? 0 : 0) }}</dd></div>
              @if (r.paymentType !== 'PARTIAL') { <div><dt>{{ v.minimumDeposit }}</dt><dd>{{ v.notApplicable }}</dd></div> }</dl>
            <app-reservation-breakdown [quote]="r.quote" />
          </section>
        </div>
        <section class="crp-operator-panel"><div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ v.departureAndTerms }}</p><h2>{{ v.associatedDeparture }}</h2></div>
          @if (reschedule) { <button type="button" class="crp-operator-primary" (click)="openRescheduling()">{{ v.manageRescheduling }}</button> }</div>
          <dl class="crp-reservations-lines"><div><dt>{{ v.departureState }}</dt><dd>{{ departureState() }}</dd></div><div><dt>{{ v.deadline }}</dt><dd>{{ deadline() }}</dd></div>
            <div><dt>{{ v.extension }}</dt><dd>{{ extension() }}</dd></div><div><dt>{{ v.cancellationCause }}</dt><dd>{{ r.cancellation?.cause ?? v.notRegistered }}</dd></div></dl>
        </section>
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ v.servicesEyebrow }}</p><h2>{{ v.servicesTitle }}</h2>
          <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr><th>{{ v.columnService }}</th><th>{{ v.columnDeparture }}</th><th>{{ v.columnQuantity }}</th><th>{{ v.columnExecution }}</th></tr></thead>
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
  protected readonly v = RESERVATION_VIEW_TEXT;
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
    if (this.frozen()) return RESERVATION_VIEW_TEXT.frozen;
    if (r.status === 'CANCELADA') return RESERVATION_VIEW_TEXT.noDeadline;
    return due ? RESERVATION_VIEW_TEXT.due(departureLine(due)) : RESERVATION_VIEW_TEXT.noDeadlineInfo;
  });
  protected readonly extension = computed(() => {
    const r = this.reservation();
    if (r.deadline?.extendedUntil) return RESERVATION_VIEW_TEXT.granted(departureLine(r.deadline.extendedUntil));
    return r.status === 'PENDIENTE_DE_PAGO' && !this.frozen() ? RESERVATION_VIEW_TEXT.extensionAvailable : RESERVATION_VIEW_TEXT.notApplicable;
  });
  protected companions = RESERVATION_VIEW_TEXT.companions;
  /** The rescheduling button exists only while the reservation waits for it and the build has the area. */
  protected get reschedule(): boolean { return !!this.reservation().reschedulingPending && !!this.navigation?.has(RESCHEDULING_AREA); }
  protected openRescheduling(): void { this.navigation?.open(RESCHEDULING_AREA, { reservation: this.reservation().id }); }
}

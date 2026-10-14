import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Reservation } from '../../reservations/data/reservations-source';
import { formatCop, formatDate } from '../../shared/format';
import { RESERVATION_CHANGES_COPY } from '../reservation-changes-copy';

/** 10A blocks (RESERVATION_DETAIL_BLOCKS): the decision the cancellation opened, or its history when nothing is refundable. Nothing on 10C. */
@Component({
  selector: 'app-reservation-change-blocks', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = reservation();
    @if (!fresh() && r.cancellation; as c) {
      @if (r.financialDecision; as d) {
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.decisionEyebrow }}</p><h2>{{ t.decisionTitle }}</h2>
          <dl class="crp-reservation-changes-list"><div><dt>{{ t.causeShort }}</dt><dd>{{ c.cause }}</dd></div>
            <div><dt>{{ t.potential }}</dt><dd>{{ d.refundableCents === null ? t.pendingPolicy : money(d.refundableCents) }}</dd></div></dl></section>
      } @else {
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">{{ t.historyEyebrow }}</p><h2>{{ t.historyTitle }}</h2>
          <dl class="crp-reservation-changes-list"><div><dt>{{ t.causeShort }}</dt><dd>{{ c.cause }}</dd></div>
            <div><dt>{{ t.registeredAt }}</dt><dd>{{ date(c.at) }}</dd></div></dl></section>
      }
    }
  `,
})
export class ReservationChangeBlocksComponent {
  readonly reservation = input.required<Reservation>();
  readonly fresh = input(false);
  protected readonly t = RESERVATION_CHANGES_COPY;
  protected readonly money = formatCop;
  protected readonly date = formatDate;
}

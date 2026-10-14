import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Quote, RESERVATION_TEXT, money } from '../model/reservation';

/** Renders a quote line by line; it calculates nothing, so the detail shows exactly what was fixed (AC-RC.4, AC-RC.7). */
@Component({
  selector: 'app-reservation-breakdown', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="crp-reservations-breakdown">
      @for (line of quote().services; track $index) { <dt>{{ line.name }}</dt><dd>{{ money(line.cents) }}</dd> }
      <dt>{{ text.transport }}</dt><dd>{{ money(quote().transportCents) }}</dd>
      <dt>{{ text.projected }}</dt><dd data-value="projected">{{ money(quote().projectedCents) }}</dd>
      @for (discount of quote().discounts; track $index) {
        <dt data-discount>{{ discount.name }} ({{ text[discount.base] }})</dt><dd>{{ money(-discount.amountCents) }}</dd>
      }
      <dt>{{ text.final }}</dt><dd data-value="final">{{ money(quote().finalCents) }}</dd>
    </dl>
  `,
})
export class ReservationBreakdownComponent {
  readonly quote = input.required<Quote>();
  protected readonly text = RESERVATION_TEXT;
  protected readonly money = money;
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatMoney } from '../../catalog/model/money';
import { Breakdown, CURRENT_DISCOUNTS_TEXT } from '../model/current-discounts';

/** D-05: read-only, no actions, so HU-COM-006 mounts it as it is. Every line keeps its order and base (AC3). */
@Component({
  selector: 'app-current-discounts-value', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let value = breakdown();
    <p class="current-discounts-base">{{ text.base }}: {{ money(value.baseCents) }}</p>
    @if (value.lines.length) {
      <ol class="current-discounts-lines">
        @for (line of value.lines; track line.order) {
          <li data-line>{{ line.order }}. {{ line.name }} · {{ text.bases[line.base] }} {{ money(line.baseCents) }}
            · −{{ money(line.amountCents) }} · {{ text.subtotal }} {{ money(line.subtotalCents) }}
            @if (line.reason) { · {{ text.reason }}: {{ line.reason }} · {{ text.authorizedBy }} {{ line.authorizedBy }} }
          </li>
        }
      </ol>
      <p class="current-discounts-final"><strong>{{ text.final }}: {{ money(value.finalCents) }}</strong></p>
    }
  `,
})
export class CurrentDiscountsValueComponent {
  readonly breakdown = input.required<Breakdown>();
  protected readonly text = CURRENT_DISCOUNTS_TEXT;
  protected readonly money = formatMoney;
}

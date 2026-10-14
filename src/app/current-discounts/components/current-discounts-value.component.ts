import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCop } from '../../shared/format';
import { Breakdown } from '../model/current-discounts';
import { CURRENT_DISCOUNTS_TEXT } from '../current-discounts-copy';

/**
 * D-05: read-only, no actions, so HU-COM-006 mounts it as it is. Every line keeps its order (the list numbers it once)
 * and its base (AC3); the totals follow the values block of admin-crear-reserva.html.
 */
@Component({
  selector: 'app-current-discounts-value', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let value = breakdown();
    <div class="current-discounts-summary">
      <div><span>{{ text.base }}</span><strong>{{ money(value.baseCents) }}</strong></div>
      @if (value.lines.length) {
        <div><span>{{ text.discounts }}</span><strong>{{ money(-discounted()) }}</strong></div>
        <div class="current-discounts-final"><span>{{ text.final }}</span><strong>{{ money(value.finalCents) }}</strong></div>
      }
    </div>
    @if (value.lines.length) {
      <ol class="current-discounts-lines">
        @for (line of value.lines; track line.order) {
          <li data-line>{{ line.name }} · {{ text.bases[line.base] }} {{ money(line.baseCents) }} · {{ money(-line.amountCents) }}
            · {{ text.subtotal }} {{ money(line.subtotalCents) }}
            @if (line.reason) { · {{ text.reason }}: {{ line.reason }} · {{ text.authorizedBy }} {{ line.authorizedBy }} }
          </li>
        }
      </ol>
    }
  `,
})
export class CurrentDiscountsValueComponent {
  readonly breakdown = input.required<Breakdown>();
  protected readonly text = CURRENT_DISCOUNTS_TEXT;
  protected readonly money = formatCop;
  protected readonly discounted = computed(() => this.breakdown().baseCents - this.breakdown().finalCents);
}

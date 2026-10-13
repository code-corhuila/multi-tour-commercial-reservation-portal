import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { formatDate } from '../../shared/format';
import { FINANCIAL_LABEL, RESERVATION_TEXT, Reservation, STATUS_CLASS, STATUS_LABEL, money, persons, travelers } from '../model/reservation';
import { ReservationBreakdownComponent } from './reservation-breakdown.component';
import { PortalSlotOutlet, RESERVATION_DETAIL_BLOCKS } from '../../shared/portal-slots';

/** Screen 10C (fresh) or 10A, without the payment parts (cash and payments stories). Renders the snapshot fixed at creation. */
@Component({
  selector: 'app-reservation-view', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReservationBreakdownComponent, PortalSlotOutlet],
  styles: [`.crp-reservation-hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
    .crp-reservation-hero p { margin: 6px 0 0; } .crp-reservation-panels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
    dl { display: grid; gap: 10px; margin: 16px 0 0; } dl div { display: flex; justify-content: space-between; gap: 16px; }
    dt { color: #667579; } dd { margin: 0; font-weight: 700; color: #203234; text-align: right; } .crp-form-actions { margin-top: 22px; }
    @media (max-width: 720px) { .crp-reservation-panels { grid-template-columns: 1fr; } }`],
  template: `
    @let r = reservation();
    @if (fresh()) {
      <div class="reservation-result">
        <section class="crp-operator-panel crp-reservation-hero">
          <div><p class="crp-operator-eyebrow">Nueva reserva</p><h2>#{{ r.id }}</h2>
            <p>La reserva quedó registrada como proyección comercial dentro del operador activo. {{ text.noSeat }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <div class="crp-reservation-panels">
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">Resumen</p><h2>{{ r.tourName }}</h2>
            <dl><div><dt>Salida</dt><dd>{{ date(r.departureDate) }}</dd></div><div><dt>Viajeros</dt><dd>{{ r.people }}</dd></div>
              <div><dt>Titular</dt><dd>{{ r.leadCustomerName }}</dd></div><div><dt>{{ text.conditions }}</dt><dd>{{ r.conditions }}</dd></div></dl>
          </article>
          <article class="crp-operator-panel"><p class="crp-operator-eyebrow">Estado económico</p><h2>Estado de pago</h2><p><strong>{{ financial[r.financialStatus] }}</strong></p>
            <dl><div><dt>{{ text.final }}</dt><dd>{{ money(r.quote.finalCents) }}</dd></div><div><dt>{{ text.projected }}</dt><dd>{{ money(r.quote.projectedCents) }}</dd></div>
              <div><dt>{{ text.applied }}</dt><dd>{{ money(-r.quote.discountCents) }}</dd></div><div><dt>{{ text.balance }}</dt><dd>{{ money(r.balanceCents) }}</dd></div></dl>
          </article>
        </div>
        <div class="crp-form-actions"><button type="button" class="crp-operator-outline" (click)="detail.emit()">{{ text.view }}</button>
          <ng-container *crpSlot="blocks; inputs: { reservation: r, fresh: true }" /></div>
      </div>
    } @else {
      <div class="reservation-detail">
        <section class="crp-operator-panel crp-reservation-hero">
          <div><p class="crp-operator-eyebrow">#{{ r.id }}</p><h2>{{ r.tourName }}</h2><p>Salida: {{ date(r.departureDate) }} · {{ travelers(r.people) }}</p></div>
          <span class="crp-operator-status {{ badge[r.status] }}">{{ status[r.status] }}</span>
        </section>
        <div class="crp-reservation-panels">
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">Titular y viajeros</p><h2>{{ r.leadCustomerName }}</h2>
            <dl><div><dt>Viajeros registrados</dt><dd>{{ persons(r.people) }}</dd></div><div><dt>Situación financiera</dt><dd>{{ financial[r.financialStatus] }}</dd></div></dl>
          </section>
          <section class="crp-operator-panel"><p class="crp-operator-eyebrow">Estado económico</p><h2>{{ money(r.balanceCents) }} pendientes</h2>
            <app-reservation-breakdown [quote]="r.quote" />
          </section>
        </div>
        <section class="crp-operator-panel"><p class="crp-operator-eyebrow">Servicios reservados</p><h2>Proyección comercial</h2>
          <div class="crp-table-wrap"><table class="crp-operator-table"><thead><tr><th>Servicio</th><th>Fecha</th><th>Cantidad</th></tr></thead>
            <tbody>@for (line of r.quote.services; track $index) { <tr><td>{{ line.name }}</td><td>{{ date(r.departureDate) }}</td><td>{{ r.people }}</td></tr> }</tbody></table></div>
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
  protected readonly status = STATUS_LABEL;
  protected readonly financial = FINANCIAL_LABEL;
  protected readonly money = money;
  protected readonly date = formatDate;
  protected readonly travelers = travelers;
  protected readonly persons = persons;
  protected readonly badge = STATUS_CLASS;
  /** HU-COM-001 portal foundation of 2026-10-13: the blocks other stories add to 10A and 10C. */
  protected readonly blocks = RESERVATION_DETAIL_BLOCKS;
}

import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { CUSTOMERS_COPY, PERSON_LABELS, PLACEHOLDERS } from '../customers-copy';
import { ReservationParty } from '../data/reservation-party';
import { HighRiskField } from '../model/customer-group';

const FIELDS: readonly { key: HighRiskField; kind: 'text' | 'area' | 'check'; label: string; placeholder: string | null }[] = [
  { key: 'bloodType', kind: 'text', label: PERSON_LABELS.bloodType, placeholder: PLACEHOLDERS.bloodType },
  { key: 'emergencyContact', kind: 'text', label: PERSON_LABELS.emergencyContact, placeholder: PLACEHOLDERS.emergencyContact },
  { key: 'physicalRestrictions', kind: 'area', label: PERSON_LABELS.physicalRestrictions, placeholder: PLACEHOLDERS.physicalRestrictions },
  { key: 'informedConsent', kind: 'check', label: PERSON_LABELS.informedConsent, placeholder: null },
];

/** The block "Requisitos de actividad de riesgo" of 10B (HU-COM-005, T-V19-1b): a card per traveler, drawn only when the tour is high risk. */
@Component({
  selector: 'app-risk-section', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (party.highRisk()) {
      <section class="crp-operator-panel" data-risk-section>
        <p class="crp-operator-eyebrow">{{ text.riskEyebrow }}</p><h2>{{ text.riskTitle }}</h2>
        <p class="crp-customers-copy">{{ text.riskCopy }}</p>
        @for (person of party.risk(); track $index; let i = $index) {
          <article class="crp-customers-risk-card"><strong>{{ i === 0 ? text.lead : text.companion + ' ' + i }}</strong>
            <div class="crp-customers-grid">
              @for (f of fields; track f.key) {
                @let reason = party.shown().risk[i]?.[f.key];
                <div class="crp-customers-field" [class.crp-customers-wide]="f.kind !== 'text'">
                  @switch (f.kind) {
                    @case ('check') {
                      <label class="crp-customers-check" [for]="id(f.key, i)"><input type="checkbox" [id]="id(f.key, i)" [name]="f.key + '-' + i" [checked]="person[f.key] === 'true'"
                        [attr.aria-invalid]="reason ? 'true' : null" [attr.aria-describedby]="reason ? id(f.key, i) + '-error' : null" (change)="check(i, f.key, $event)"> {{ f.label }}</label>
                    }
                    @case ('area') {
                      <label [for]="id(f.key, i)">{{ f.label }}</label>
                      <textarea [id]="id(f.key, i)" [name]="f.key + '-' + i" [value]="person[f.key]" [attr.placeholder]="f.placeholder" (input)="type(i, f.key, $event)"
                        [attr.aria-invalid]="reason ? 'true' : null" [attr.aria-describedby]="reason ? id(f.key, i) + '-error' : null"></textarea>
                    }
                    @default {
                      <label [for]="id(f.key, i)">{{ f.label }}</label>
                      <input type="text" [id]="id(f.key, i)" [name]="f.key + '-' + i" [value]="person[f.key]" [attr.placeholder]="f.placeholder" (input)="type(i, f.key, $event)"
                        [attr.aria-invalid]="reason ? 'true' : null" [attr.aria-describedby]="reason ? id(f.key, i) + '-error' : null">
                    }
                  }
                  @if (reason) { <p [id]="id(f.key, i) + '-error'" class="crp-customers-error">{{ reason }}</p> }
                </div>
              }
            </div>
          </article>
        }
      </section>
    }
  `,
})
export class RiskSectionComponent {
  protected readonly party = inject(ReservationParty);
  protected readonly text = CUSTOMERS_COPY;
  protected readonly fields = FIELDS;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  constructor() {
    effect(() => { if (this.party.rejected()) afterNextRender(() => { if (!document.activeElement?.matches('[aria-invalid="true"]')) focusFirstError(this.host); }, { injector: this.injector }); });
  }
  protected id(field: HighRiskField, index: number): string { return `reservation-risk-${field}-${index}`; }
  protected type(index: number, field: HighRiskField, event: Event): void { this.party.setRisk(index, field, (event.target as HTMLInputElement | HTMLTextAreaElement).value); }
  protected check(index: number, field: HighRiskField, event: Event): void { this.party.setRisk(index, field, (event.target as HTMLInputElement).checked ? 'true' : ''); }
}

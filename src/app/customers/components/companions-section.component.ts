import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { CUSTOMERS_COPY, PERSON_LABELS, PLACEHOLDERS, requiredCompanions } from '../customers-copy';
import { ReservationParty } from '../data/reservation-party';
import { CompanionFields } from '../model/party-rules';

const FIELDS: readonly { key: keyof CompanionFields; name: string; type: string; label: string; placeholder: string | null }[] = [
  { key: 'fullName', name: 'companionName', type: 'text', label: PERSON_LABELS.fullName, placeholder: PLACEHOLDERS.companionName },
  { key: 'document', name: 'companionDocument', type: 'text', label: PERSON_LABELS.document, placeholder: PLACEHOLDERS.companionDocument },
  { key: 'birthDate', name: 'companionBirth', type: 'date', label: PERSON_LABELS.birthDate, placeholder: null },
];

/** Section 03 of 10B, "Acompañantes" (HU-COM-005): one card of three fields per traveler beyond the titular. */
@Component({
  selector: 'app-companions-section', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-operator-panel" data-companions-section>
      <div class="crp-operator-panel-head"><div><p class="crp-operator-eyebrow">{{ text.companionsEyebrow }}</p><h2>{{ text.companionsTitle }}</h2></div>
        <span data-companion-count>{{ party.required() ? count(party.required()) : text.noCompanions }}</span></div>
      <p class="crp-customers-copy">{{ text.companionsNote }}</p>
      @for (companion of party.companions(); track $index; let i = $index) {
        <article class="crp-customers-companion"><strong>{{ text.companionTitle }} {{ i + 1 }}</strong>
          <div class="crp-customers-grid">
            @for (f of fields; track f.key) {
              <div class="crp-customers-field">
                <label [for]="'reservation-' + f.name + '-' + i">{{ f.label }}</label>
                <input [id]="'reservation-' + f.name + '-' + i" [name]="f.name + '-' + i" [type]="f.type" [value]="companion[f.key]" [attr.placeholder]="f.placeholder" (input)="type(i, f.key, $event)"
                  [attr.aria-invalid]="party.shown().companions[i]?.[f.key] ? 'true' : null" [attr.aria-describedby]="party.shown().companions[i]?.[f.key] ? 'reservation-' + f.name + '-' + i + '-error' : null">
                @if (party.shown().companions[i]?.[f.key]; as reason) { <p [id]="'reservation-' + f.name + '-' + i + '-error'" class="crp-customers-error">{{ reason }}</p> }
              </div>
            }
          </div>
        </article>
      }
    </section>
  `,
})
export class CompanionsSectionComponent {
  protected readonly party = inject(ReservationParty);
  protected readonly text = CUSTOMERS_COPY;
  protected readonly fields = FIELDS;
  protected readonly count = requiredCompanions;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  constructor() {
    effect(() => { if (this.party.rejected()) afterNextRender(() => { if (!document.activeElement?.matches('[aria-invalid="true"]')) focusFirstError(this.host); }, { injector: this.injector }); });
  }
  protected type(index: number, field: keyof CompanionFields, event: Event): void { this.party.setCompanion(index, field, (event.target as HTMLInputElement).value); }
}

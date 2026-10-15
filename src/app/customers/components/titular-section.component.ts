import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, defer, map, of, startWith, switchMap } from 'rxjs';
import { ReadErrorComponent } from '../../shared/read-error.component';
import { ReadFailure, readFailure } from '../../shared/read-failure';
import { focusFirstError } from '../../shared/focus';
import { CUSTOMERS_COPY, PERSON_LABELS, PLACEHOLDERS } from '../customers-copy';
import { CustomersSource } from '../data/customers-source';
import { ReservationParty } from '../data/reservation-party';
import { CustomerMatch } from '../model/customer-group';
import { LeadFields } from '../model/party-rules';

type Search = { kind: 'idle' | 'loading' | 'empty' } | ({ kind: 'error' } & ReadFailure) | { kind: 'data'; matches: readonly CustomerMatch[] };
const MIN_SEARCH = 2;
const FIELDS: readonly { key: keyof LeadFields; name: string; type: string; label: string; placeholder: string | null }[] = [
  { key: 'fullName', name: 'holderName', type: 'text', label: PERSON_LABELS.fullName, placeholder: PLACEHOLDERS.fullName },
  { key: 'document', name: 'holderDocument', type: 'text', label: PERSON_LABELS.document, placeholder: PLACEHOLDERS.document },
  { key: 'email', name: 'holderEmail', type: 'email', label: PERSON_LABELS.email, placeholder: PLACEHOLDERS.email },
  { key: 'phone', name: 'holderPhone', type: 'tel', label: PERSON_LABELS.contact, placeholder: PLACEHOLDERS.phone },
  { key: 'birthDate', name: 'holderBirth', type: 'text', label: PERSON_LABELS.birthDate, placeholder: PLACEHOLDERS.birthDate },
];

/** Section 01 of 10B, "Cliente titular" (HU-COM-005): found by search or typed; contributed to the form through RESERVATION_FORM_SECTIONS. */
@Component({
  selector: 'app-titular-section', changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReadErrorComponent],
  template: `
    <section class="crp-operator-panel crp-customers-titular">
      <p class="crp-operator-eyebrow">{{ text.leadEyebrow }}</p><h2>{{ text.leadTitle }}</h2>
      <div class="crp-customers-field crp-customers-wide">
        <label for="reservation-customer-search">{{ text.searchLabel }}</label>
        <input id="reservation-customer-search" name="customerSearch" type="search" autocomplete="off" [placeholder]="text.searchPlaceholder" (input)="look($event)">
      </div>
      <div class="crp-customers-results" data-customer-results aria-live="polite">
        @let found = search();
        @switch (found.kind) {
          @case ('loading') { <p role="status" data-state="loading">{{ text.searching }}</p> }
          @case ('error') { <div role="alert" data-state="error"><crp-read-error [state]="found" [fallback]="text.searchFailed" /> <button type="button" class="crp-operator-outline" (click)="retry()">{{ text.retry }}</button></div> }
          @case ('empty') { <p data-state="empty" class="crp-customers-copy">{{ text.noMatches }}</p> }
          @case ('data') { @for (m of matches(found); track m.id) { <button type="button" class="crp-operator-outline" (click)="choose(m)">{{ label(m) }}</button> } }
        }
      </div>
      @if (party.picked(); as linked) { <p class="crp-customers-linked" role="status">{{ text.linked }} {{ linked.fullName }} ({{ linked.email }}).</p> }
      <div class="crp-customers-grid">
        @for (f of fields; track f.key) {
          <div class="crp-customers-field">
            <label [for]="'reservation-' + f.name">{{ f.label }}</label>
            <input [id]="'reservation-' + f.name" [name]="f.name" [type]="f.type" [value]="party.lead()[f.key]" [attr.placeholder]="f.placeholder" (input)="type(f.key, $event)"
              [attr.aria-invalid]="party.shown().lead[f.key] ? 'true' : null" [attr.aria-describedby]="party.shown().lead[f.key] ? 'reservation-' + f.name + '-error' : null">
            @if (party.shown().lead[f.key]; as reason) { <p [id]="'reservation-' + f.name + '-error'" class="crp-customers-error">{{ reason }}</p> }
          </div>
        }
      </div>
    </section>
  `,
})
export class TitularSectionComponent {
  protected readonly party = inject(ReservationParty);
  private readonly source = inject(CustomersSource);
  protected readonly text = CUSTOMERS_COPY;
  protected readonly fields = FIELDS;
  private readonly queries = new Subject<string>();
  private last = '';
  private readonly host: HTMLElement = inject(ElementRef).nativeElement; private readonly injector = inject(Injector);
  constructor() {
    effect(() => { if (this.party.rejected()) afterNextRender(() => { if (!document.activeElement?.matches('[aria-invalid="true"]')) focusFirstError(this.host); }, { injector: this.injector }); });
  }
  protected readonly search = toSignal(this.queries.pipe(switchMap((text): Observable<Search> => text.length < MIN_SEARCH ? of<Search>({ kind: 'idle' }) :
    defer(() => this.source.search(text)).pipe(map((matches): Search => (matches.length ? { kind: 'data', matches } : { kind: 'empty' })),
      catchError((error) => of<Search>({ kind: 'error', ...readFailure(error) })), startWith<Search>({ kind: 'loading' })))), { initialValue: { kind: 'idle' } as Search });

  protected matches(found: Search): readonly CustomerMatch[] { return found.kind === 'data' ? found.matches : []; }
  protected look(event: Event): void { this.last = (event.target as HTMLInputElement).value.trim(); this.queries.next(this.last); }
  protected retry(): void { this.queries.next(this.last); }
  protected choose(match: CustomerMatch): void { this.party.choose(match); this.queries.next(''); }
  protected type(field: keyof LeadFields, event: Event): void { this.party.setLead(field, (event.target as HTMLInputElement).value); }
  protected label(m: CustomerMatch): string { return `${m.fullName} · ${m.document || this.text.noDocument} · ${m.email}${m.verified ? '' : ` · ${this.text.unverified}`}`; }
}

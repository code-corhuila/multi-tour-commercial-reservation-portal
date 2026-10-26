import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { ApiError } from '../../shell-contract';
import { AssociatedEstablishmentsEditor } from '../data/associated-establishments-editor';
import { ESTABLISHMENTS_COPY, changeWhen, registrationRefusal } from '../establishments-copy';
import { AssociatedEstablishment } from '../model/associated-establishment';

/**
 * "Gestionar establecimiento" on the same screen as the list (spec 002, AC-PE.12): the bitácora de cambios of the establishment and,
 * where the build has the editor, its name and commercial information. Nothing else is editable here: no room, dish, rate or availability (AC-PE.8).
 */
@Component({
  selector: 'app-establishment-manage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="crp-form-section crp-establishment-manage" [attr.aria-label]="t.title(establishment().commercialName)">
      <div class="crp-operator-panel-head">
        <h2>{{ t.title(establishment().commercialName) }}</h2>
        <button class="crp-operator-outline" type="button" (click)="closed.emit()">{{ t.close }}</button>
      </div>
      @if (editable) {
        <form class="crp-form-grid" novalidate (submit)="save($event)">
          <div>
            <label for="crp-establishment-manage-name">{{ t.name }}</label>
            <input id="crp-establishment-manage-name" type="text" [value]="name()" (input)="name.set($any($event.target).value)"
              [attr.aria-invalid]="nameError() ? 'true' : null" [attr.aria-describedby]="nameError() ? 'crp-establishment-manage-name-error' : null" />
            @if (nameError()) { <p role="alert" id="crp-establishment-manage-name-error">{{ t.nameInvalid }}</p> }
          </div>
          <div class="crp-reservation-changes-wide">
            <label for="crp-establishment-manage-info">{{ t.info }}</label>
            <textarea id="crp-establishment-manage-info" [value]="info()" (input)="info.set($any($event.target).value)"></textarea>
          </div>
          <div class="crp-form-actions">
            <button class="crp-operator-primary" type="submit" [disabled]="sending()">{{ t.save }}</button>
          </div>
        </form>
        @if (failure(); as message) { <p role="alert">{{ message }}</p> }
        @if (notice()) { <p role="status">{{ t.saved }}</p> }
      }
      <div class="crp-establishment-log">
        <h3>{{ t.logTitle }}</h3>
        @if (log().length) {
          <div class="crp-table-wrap">
            <table class="crp-operator-table">
              <thead><tr>@for (column of t.logColumns; track column) { <th scope="col">{{ column }}</th> }</tr></thead>
              <tbody>@for (line of log(); track line.at + line.kind) { <tr><td>{{ when(line.at) }}</td><td>{{ line.by }}</td><td>{{ labels[line.kind] }}</td></tr> }</tbody>
            </table>
          </div>
        } @else {
          <p>{{ establishment().changes ? t.noChanges : t.noChangeInfo }}</p>
        }
      </div>
    </section>
  `,
})
export class EstablishmentManageComponent {
  readonly establishment = input.required<AssociatedEstablishment>();
  /** The service stored the change: the page replaces the row. */
  readonly saved = output<AssociatedEstablishment>();
  readonly closed = output<void>();

  protected readonly t = ESTABLISHMENTS_COPY.managePanel;
  protected readonly labels = ESTABLISHMENTS_COPY.changeLabel;
  protected readonly when = changeWhen;
  private readonly editor = inject(AssociatedEstablishmentsEditor, { optional: true });
  protected readonly editable = this.editor !== null;
  /** Start from the stored record, and again from it when the service answers. */
  protected readonly name = linkedSignal(() => this.establishment().commercialName);
  protected readonly info = linkedSignal(() => this.establishment().commercialInformation);
  protected readonly nameError = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly notice = signal(false);
  protected readonly sending = signal(false);
  /** Newest first. */
  protected readonly log = computed(() => [...(this.establishment().changes ?? [])].reverse());

  protected save(event: Event): void {
    event.preventDefault();
    if (this.sending() || !this.editor) { return; }
    const commercialName = this.name().trim();
    this.nameError.set(commercialName === '' || commercialName.length > 255);
    if (this.nameError()) { return; }
    this.sending.set(true);
    this.failure.set(null);
    this.notice.set(false);
    this.editor.update(this.establishment().associationId, { commercialName, commercialInformation: this.info().trim() }).subscribe({
      next: (stored) => { this.sending.set(false); this.notice.set(true); this.saved.emit(stored); },
      error: (error: Partial<ApiError> | null) => { this.sending.set(false); this.failure.set(registrationRefusal(error).general ?? ESTABLISHMENTS_COPY.refusals.requestFailed); },
    });
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** The browser draws "Choose File / No file chosen"; the portal speaks Spanish (12-ux-ui, PROPOSED wording: the mockup has no own text). */
export const FILE_PICKER_COPY = { choose: 'Seleccionar archivo', none: 'Ningún archivo seleccionado' } as const;

/**
 * A native file input kept as the accessible, focusable control, drawn with a Spanish button and the chosen file's name.
 * The host keeps the file (`file`) so a reset of its form also clears the name shown here; its error is projected beside the input.
 */
@Component({
  selector: 'app-file-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="crp-file-picker">
      <input #control class="crp-file-picker-input" type="file" [id]="inputId()" [name]="inputName()" [accept]="accept()" [disabled]="disabled()"
        [attr.aria-invalid]="invalid() ? 'true' : null" [attr.aria-describedby]="describedBy()"
        (change)="chosen.emit(control.files?.[0] ?? null)">
      <span class="crp-file-picker-button" aria-hidden="true" (click)="disabled() || control.click()">{{ copy.choose }}</span>
      <span class="crp-file-picker-name" aria-hidden="true">{{ file()?.name ?? copy.none }}</span>
      <ng-content />
    </div>
  `,
})
export class FilePickerComponent {
  protected readonly copy = FILE_PICKER_COPY;
  readonly inputId = input.required<string>();
  readonly inputName = input.required<string>();
  readonly accept = input('');
  readonly file = input<File | null>(null);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly chosen = output<File | null>();
}

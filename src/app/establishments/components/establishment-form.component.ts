import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, tap } from 'rxjs';
import { ActorContext, IdempotencyKeys } from '../../catalog/data/catalog-api.service';
import { capabilitiesOf } from '../../catalog/model/catalog-item';
import { ApiError } from '../../shell-contract';
import { AssociatedEstablishmentsWriter, RegisterEstablishmentCommand } from '../data/associated-establishments-writer';
import { AssociatedEstablishment, ESTABLISHMENT_TYPES, EstablishmentType } from '../model/associated-establishment';
import { IMAGE_GUIDANCE, IMAGE_TYPES, imageMessage } from '../model/image-policy';
import { ESTABLISHMENTS_COPY } from '../establishments-copy';

type Field = keyof RegisterEstablishmentCommand;
type Messages = Partial<Record<Field, string>>;
const TEXT_FIELDS = [{ name: 'commercialName', label: 'Nombre del establecimiento' },
  { name: 'commercialInformation', label: 'Información comercial' }] as const;
let nextFormId = 0;

@Component({
  selector: 'app-establishment-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canRegister) {
      <form novalidate (submit)="submit($event)">
        <section class="crp-form-panel">
        <p class="crp-operator-eyebrow">01. Datos del establecimiento</p>
        <div class="crp-form-grid">
        <div>
          <label [for]="id('establishmentType')">Tipo de establecimiento</label>
          <select name="establishmentType" [id]="id('establishmentType')" [disabled]="pending()"
            [attr.aria-invalid]="messages().establishmentType ? 'true' : null"
            [attr.aria-describedby]="describedBy('establishmentType')" (change)="edit('establishmentType', $event)">
            @for (type of types; track type) { <option [value]="type" [selected]="draft().establishmentType === type">{{ typeLabels[type] }}</option> }
          </select>
          @if (messages().establishmentType; as text) { <p role="alert" [id]="id('establishmentType') + '-error'">{{ text }}</p> }
        </div>
        @for (field of textFields; track field.name) {
          <div>
            <label [for]="id(field.name)">{{ field.label }}</label>
            <textarea [name]="field.name" [id]="id(field.name)" [value]="draft()[field.name]" [disabled]="pending()"
              [attr.aria-invalid]="messages()[field.name] ? 'true' : null"
              [attr.aria-describedby]="describedBy(field.name)" (input)="edit(field.name, $event)"></textarea>
            @if (messages()[field.name]; as text) { <p role="alert" [id]="id(field.name) + '-error'">{{ text }}</p> }
          </div>
        }
        </div>
        <p class="crp-operator-copy">No se configuran habitaciones, tarifas, disponibilidad, inventario ni políticas de cupo.</p>
        </section>
        <section class="crp-form-panel">
        <p class="crp-operator-eyebrow">02. Imagen</p>
        <div>
          <label [for]="id('image')">Imagen</label>
          <input type="file" name="image" [id]="id('image')" [accept]="acceptedTypes" [disabled]="pending()"
            [attr.aria-invalid]="messages().image ? 'true' : null" [attr.aria-describedby]="describedBy('image')" (change)="chooseImage($event)">
          <p [id]="id('image') + '-help'">{{ guidance }}</p>
          @if (messages().image; as text) { <p role="alert" [id]="id('image') + '-error'">{{ text }}</p> }
        </div>
        </section>
        <div class="crp-form-actions">
        <button class="crp-operator-outline" type="button" [disabled]="pending()" (click)="cancel()">Cancelar</button>
        <button class="crp-operator-primary" type="submit" [disabled]="pending()">Guardar establecimiento</button>
      </div>
      </form>
    }
  `,
})
export class EstablishmentFormComponent {
  private readonly writer = inject(AssociatedEstablishmentsWriter);
  private readonly keys = inject(IdempotencyKeys);
  private readonly actor = inject(ActorContext);
  protected readonly canRegister = capabilitiesOf(this.actor.role, this.actor.collaboratorMayEditDescription).canRegister;
  private idempotencyKey = this.keys.generate();
  private readonly prefix = `establishment-form-${nextFormId++}`;
  private submittedForm: HTMLFormElement | null = null;
  readonly saved = output<AssociatedEstablishment>();
  readonly cancelled = output<void>();
  readonly saving = output<boolean>();
  protected readonly types = ESTABLISHMENT_TYPES;
  protected readonly typeLabels = ESTABLISHMENTS_COPY.types;
  protected readonly textFields = TEXT_FIELDS;
  protected readonly guidance = IMAGE_GUIDANCE;
  protected readonly acceptedTypes = IMAGE_TYPES.join(',');
  protected readonly pending = signal(false);
  protected readonly draft = signal({ establishmentType: 'HOTEL', commercialName: '', commercialInformation: '' });
  private readonly image = signal<File | null>(null);
  private readonly attempted = signal(false);
  private readonly refused = signal<Messages>({});
  protected readonly messages = computed(() => {
    const local: Messages = {}, draft = this.draft();
    if (this.attempted()) {
      if (!this.types.includes(draft.establishmentType as EstablishmentType)) { local.establishmentType = 'El tipo es obligatorio.'; }
      if (!draft.commercialName.trim() || draft.commercialName.trim().length > 255) { local.commercialName = 'Obligatorio: de 1 a 255 caracteres.'; }
      if (!draft.commercialInformation.trim()) { local.commercialInformation = 'La información comercial es obligatoria.'; }
    }
    if (this.attempted() || this.image()) { const message = imageMessage(this.image()); if (message) { local.image = message; } }
    return { ...this.refused(), ...local };
  });
  private readonly submissions = new Subject<RegisterEstablishmentCommand>();
  // toSignal owns the subscription lifetime; exhaustMap also protects a pending intention.
  private readonly responses = toSignal(this.submissions.pipe(exhaustMap((command) =>
    this.writer.register(command, this.idempotencyKey).pipe(
      tap((stored) => {
        this.idempotencyKey = this.keys.generate(); this.attempted.set(false);
        this.draft.set({ establishmentType: 'HOTEL', commercialName: '', commercialInformation: '' });
        this.image.set(null); this.submittedForm?.reset(); this.finish(); this.saved.emit(stored);
      }),
      catchError((error: unknown) => { this.showRefusal(error); this.finish(); return EMPTY; }),
    ),
  )));

  protected id(field: Field): string { return `${this.prefix}-${field}`; }
  protected describedBy(field: Field): string | null {
    return [field === 'image' ? this.id(field) + '-help' : '', this.messages()[field] ? this.id(field) + '-error' : ''].filter(Boolean).join(' ') || null;
  }
  protected edit(field: Exclude<Field, 'image'>, event: Event): void {
    if (this.pending()) { return; }
    this.draft.update((draft) => ({ ...draft, [field]: (event.target as HTMLInputElement).value })); this.clearRefusal(field);
  }
  protected chooseImage(event: Event): void {
    if (this.pending()) { return; }
    this.image.set((event.target as HTMLInputElement).files?.[0] ?? null); this.clearRefusal('image');
  }
  private clearRefusal(field: Field): void { this.refused.update(({ [field]: _previous, ...rest }) => rest); }
  protected cancel(): void { if (!this.pending()) { this.cancelled.emit(); } }
  protected submit(event: Event): void {
    event.preventDefault(); if (this.pending() || !this.canRegister) { return; }
    this.attempted.set(true);
    // Service messages must not block retrying an otherwise valid intention.
    this.refused.set({}); if (Object.keys(this.messages()).length) { return; }
    this.pending.set(true); this.saving.emit(true);
    this.submittedForm = event.target as HTMLFormElement;
    const draft = this.draft();
    this.submissions.next({ commercialName: draft.commercialName.trim(), commercialInformation: draft.commercialInformation.trim(),
      establishmentType: draft.establishmentType as EstablishmentType, image: this.image()! });
  }
  private finish(): void { this.pending.set(false); this.saving.emit(false); }
  private showRefusal(value: unknown): void {
    const error = value as Partial<ApiError> | null, messages: Messages = {};
    const reason = error?.userMessage ?? ESTABLISHMENTS_COPY.requestFailed;
    for (const detail of Array.isArray(error?.details) ? error.details : []) {
      const field: Field = ['establishmentType', 'commercialName', 'commercialInformation', 'image'].includes(detail.field) ? detail.field as Field : 'image';
      messages[field] = `${messages[field] ?? reason} ${detail.message}`;
    }
    this.refused.set(Object.keys(messages).length ? messages : { image: reason });
  }
}

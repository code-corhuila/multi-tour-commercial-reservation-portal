import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { EstablishmentFormComponent } from '../src/app/establishments/components/establishment-form.component';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { AssociatedEstablishment } from '../src/app/establishments/model/associated-establishment';
import { actorAs } from './actor-context.double';
import { establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';

import { formControls, imageFile } from './establishment-form.helpers';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
async function openForm() {
  const writer = new ControllableEstablishmentsWriter(), keys = new ControllableIdempotencyKeys();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: keys },
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') },
  ] });
  const fixture = TestBed.createComponent(EstablishmentFormComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const element: HTMLElement = fixture.nativeElement;
  const saved: AssociatedEstablishment[] = [], saving: boolean[] = [], cancelled: boolean[] = [];
  fixture.componentInstance.saved.subscribe((item) => saved.push(item));
  fixture.componentInstance.saving.subscribe((value) => saving.push(value));
  fixture.componentInstance.cancelled.subscribe(() => cancelled.push(true));
  await settle();
  return { fixture, element, settle, writer, keys, saved, saving, cancelled, ...await formControls(element, settle) };
}

describe('registersAnEstablishmentAndItAppearsAsPublished', () => {
  it('sends exactly the four required fields with the chosen file and emits what the service stored', async () => {
    const { fill, submit, writer, saved, settle } = await openForm();
    await fill(); await submit();
    expect(Object.keys(writer.registrations[0].command).sort()).toEqual(['commercialInformation', 'commercialName', 'establishmentType', 'image']);
    expect(writer.registrations[0].command.establishmentType).toBe('HOTEL');
    expect(writer.registrations[0].command.image).toBeInstanceOf(File);
    const stored = establishmentNamed('Stored'); writer.registrations[0].reply(stored); await settle();
    expect(saved).toEqual([stored]);
  });
});
describe('theTypeSelectorOffersExactlyHotelAndRestaurant', () => {
  it('offers only HOTEL and RESTAURANT in the registration form', async () => {
    const { field } = await openForm();
    expect(Array.from((field('establishmentType') as HTMLSelectElement).options, (option) => option.value)).toEqual(['HOTEL', 'RESTAURANT']);
  });
});
describe('eachFieldHasItsLabelAndItsErrorBesideItThroughAriaDescribedby', () => {
  it('marks every missing field next to its labelled control without a banner or a request', async () => {
    const { field, submit, errorFor, element, writer } = await openForm();
    field('establishmentType').value = ''; field('establishmentType').dispatchEvent(new Event('change'));
    await submit();
    for (const name of ['establishmentType', 'commercialName', 'commercialInformation', 'image']) {
      const control = field(name);
      expect(element.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      expect(control.getAttribute('aria-invalid')).toBe('true');
      expect(errorFor(name)).toMatch(/obligatori/i);
      expect(control.parentElement!.querySelector('[role="alert"]')).not.toBeNull();
    }
    expect(writer.registrations).toEqual([]);
    expect(element.querySelectorAll('[role="alert"]').length).toBe(4);
  });
  it('enforces commercial name length at 255 and preserves the typed text on rejection', async () => {
    const { fill, text, submit, writer, errorFor, field } = await openForm();
    await fill(); await text('commercialName', 'a'.repeat(256)); await submit();
    expect(writer.registrations).toEqual([]); expect(errorFor('commercialName')).toContain('255');
    expect(field('commercialName').value).toHaveLength(256);
    await text('commercialName', 'a'.repeat(255)); await submit();
    expect(writer.registrations.length).toBe(1);
  });
});
describe('submitIsDisabledWhileASubmissionIsPending', () => {
  it('guards double submission immediately, disables all controls and emits saving until the reply', async () => {
    const { fill, submit, writer, saving, element, settle } = await openForm();
    await fill(); await submit(); await submit();
    expect(writer.registrations.length).toBe(1); expect(saving).toEqual([true]);
    for (const control of Array.from(element.querySelectorAll<HTMLInputElement>('input, textarea, select, button'))) { expect(control.disabled).toBe(true); }
    writer.registrations[0].reply(establishmentNamed('Saved')); await settle();
    expect(saving).toEqual([true, false]);
  });
  it('emits cancellation without submitting when nothing is pending', async () => {
    const { element, cancelled, writer, settle } = await openForm();
    Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancelar')!.click(); await settle();
    expect(cancelled).toEqual([true]); expect(writer.registrations).toEqual([]);
  });
});
describe('imagePreCheckCoversTheSizeBoundaryTheAcceptedTypesAndAnSvgByItsDeclaredType', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    it(`accepts ${type} at exactly 819200 bytes`, async () => {
      const { fill, choose, submit, writer, errorFor } = await openForm();
      await fill(); await choose(imageFile(819200, type));
      expect(errorFor('image')).not.toMatch(/refused|800 KB/); await submit();
      expect(writer.registrations.length).toBe(1);
      expect(writer.registrations[0].command.image.size).toBe(819200);
    });
  }
});
describe('aRefusedImageIsReportedBeforeTheUploadWithItsLimitAndTypes', () => {
  for (const [size, type] of [[819201, 'image/png'], [100, 'image/svg+xml'], [100, 'text/plain']] as const) {
    it(`RN-PE7 rejects ${type} with ${size} bytes on selection before submission`, async () => {
      const { fill, choose, errorFor, submit, writer, element } = await openForm();
      await fill(); await choose(imageFile(size, type));
      for (const text of ['800 KB', 'PNG', 'JPEG', 'WebP']) { expect(errorFor('image')).toContain(text); }
      expect(writer.registrations).toEqual([]); await submit(); expect(writer.registrations).toEqual([]);
      expect(element.querySelector('[name="image"]')!.getAttribute('aria-invalid')).toBe('true');
    });
  }
  it('always shows the limit and accepted types, even before selecting a file', async () => {
    const { element } = await openForm();
    for (const text of ['800 KB', 'PNG', 'JPEG', 'WebP']) { expect(element.textContent).toContain(text); }
  });
});
describe('aCorrectedImageResubmitsWithTheSameKey', () => {
  it('RN-PE6 creates the key on opening, keeps it after service rejection and uses a new one after success', async () => {
    const { keys, fill, submit, choose, writer, settle, saved, field, errorFor, saving } = await openForm();
    expect(keys.generated.length).toBe(1);
    await fill(); const firstFile = (field('image') as HTMLInputElement).files![0]; await submit();
    expect(writer.registrations[0].key).toBe(keys.generated[0]);
    writer.registrations[0].fail(apiError({ status: 400, userMessage: 'Image refused.', details: [{ field: 'image', message: 'Content does not match.' }] })); await settle();
    expect(errorFor('image')).toBe('La imagen debe ser PNG, JPEG o WebP.');
    expect(field('commercialName').value).toBe('Hotel Alpha');
    expect((field('image') as HTMLInputElement).files![0]).toBe(firstFile);
    expect(saving).toEqual([true, false]);
    await choose(imageFile(120, 'image/webp')); await submit();
    expect(writer.registrations[1].key).toBe(writer.registrations[0].key);
    expect(keys.generated.length).toBe(1);
    writer.registrations[1].reply(establishmentNamed('One intention')); await settle();
    expect(saved).toHaveLength(1); expect(keys.generated.length).toBe(2);
    await fill(); await submit(); expect(writer.registrations[2].key).toBe(keys.generated[1]);
  });
  it('places Spanish texts by the field the API names and never prints the English details', async () => {
    const { fill, submit, writer, settle, errorFor, element } = await openForm();
    await fill(); await submit();
    writer.registrations[0].fail(apiError({ status: 400, userMessage: 'Please correct these fields.', details: [
      { field: 'commercialName', message: 'Name conflicts.' }, { field: 'commercialInformation', message: 'Contact required.' }, { field: 'content', message: 'Unreadable file.' },
    ] })); await settle();
    expect(errorFor('commercialName')).toBe('Obligatorio: de 1 a 255 caracteres.'); expect(errorFor('commercialInformation')).not.toBe('');
    expect(element.textContent).not.toMatch(/Please correct|Name conflicts|Contact required|Unreadable/);
    expect(Array.from(element.querySelectorAll('[role="alert"]')).every((alert) => alert.parentElement?.querySelector('input, textarea, select'))).toBe(true);
  });
});

describe('theEstablishmentFormFollowsTheAuthorizedScreenInSpanish', () => {
  it('numbers its sections and writes labels, options, guidance, buttons and messages in Spanish', async () => {
    const { element, submit } = await openForm();
    expect(Array.from(element.querySelectorAll('.crp-operator-eyebrow'), (node) => node.textContent?.trim())).toEqual(['01. Datos del establecimiento', '02. Imagen']);
    expect(Array.from(element.querySelectorAll('label'), (label) => label.textContent?.trim())).toEqual(['Tipo de establecimiento', 'Nombre del establecimiento', 'Información comercial', 'Imagen']);
    expect(Array.from(element.querySelectorAll('option'), (option) => option.textContent?.trim())).toEqual(['Alojamiento', 'Restaurante']);
    expect(element.textContent).toContain('Máximo 800 KB (819200 bytes). Tipos aceptados: PNG, JPEG, WebP.');
    expect(Array.from(element.querySelectorAll('.crp-form-actions button'), (button) => button.textContent?.trim())).toEqual(['Cancelar', 'Guardar establecimiento']);
    await submit();
    const alerts = Array.from(element.querySelectorAll('[role="alert"]'), (alert) => alert.textContent?.trim());
    expect(alerts).toEqual(['Obligatorio: de 1 a 255 caracteres.', 'La información comercial es obligatoria.', 'La imagen es obligatoria.']);
    expect(element.textContent).not.toMatch(/HOTEL|RESTAURANT|Required|Save|Cancel\b|At most/);
  });
});

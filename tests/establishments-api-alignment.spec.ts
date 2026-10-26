import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { formControls } from './establishment-form.helpers';

// HU-COM-002 against the real API: the container builds an ApiError with a generic English message and keeps status, code and details;
// the portal speaks Spanish from its own copy and never prints that English text.
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const ENGLISH = 'The request failed with a generic English message';
const refusal = (status: number, details: { field: string; message: string }[] = []) => apiError({ status, code: 'X', message: ENGLISH, userMessage: ENGLISH, details });
const R = ESTABLISHMENTS_COPY.refusals;

async function openPage() {
  const source = new ControllableEstablishmentsSource(), writer = new ControllableEstablishmentsWriter();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    { provide: AssociatedEstablishmentsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR', true) },
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const element: HTMLElement = fixture.nativeElement;
  const click = async (text: string, within: ParentNode = element) => { Array.from(within.querySelectorAll('button')).find((b) => flat(b.textContent) === text)!.click(); await settle(); };
  await settle();
  return { source, writer, settle, element, click };
}

async function openFilledForm() {
  const page = await openPage();
  page.source.requests[0].reply([]); await page.settle();
  await page.click(ESTABLISHMENTS_COPY.newEstablishment);
  const form = await formControls(page.element, page.settle);
  await form.fill(); await form.submit();
  return { ...page, form };
}

describe('registrationRefusalsSpeakSpanish', () => {
  it('413 puts the size text beside the image', async () => {
    const { form, writer, settle, element } = await openFilledForm();
    writer.registrations[0].fail(refusal(413)); await settle();
    expect(form.errorFor('image')).toBe('La imagen no puede superar 800 KB.');
    expect(element.textContent).not.toContain(ENGLISH);
  });
  it('415 puts the type text beside the image', async () => {
    const { form, writer, settle } = await openFilledForm();
    writer.registrations[0].fail(refusal(415)); await settle();
    expect(form.errorFor('image')).toBe('La imagen debe ser PNG, JPEG o WebP.');
  });
  it('400 with a field detail puts a Spanish text beside that field and not the server message', async () => {
    const { form, writer, settle, element } = await openFilledForm();
    writer.registrations[0].fail(refusal(400, [{ field: 'commercialName', message: 'must not be blank' }, { field: 'commercialInformation', message: 'size must be at most 2000' }])); await settle();
    expect(form.errorFor('commercialName')).toBe(R.fields.commercialName);
    expect(form.errorFor('commercialInformation')).toBe(R.fields.commercialInformation);
    expect(form.errorFor('image')).toBe('');
    expect(element.textContent).not.toMatch(/must not be blank|size must be|generic English/);
  });
  it('400 on the image field about size uses the size text', async () => {
    const { form, writer, settle } = await openFilledForm();
    writer.registrations[0].fail(refusal(400, [{ field: 'image', message: 'image size exceeds the limit' }])); await settle();
    expect(form.errorFor('image')).toBe('La imagen no puede superar 800 KB.');
  });
  for (const [status, text] of [[403, 'No tienes permiso para esta acción.'], [400, 'No se pudo completar la solicitud. Intenta de nuevo.'], [500, 'No se pudo completar la solicitud. Intenta de nuevo.'], [0, 'No se pudo completar la solicitud. Intenta de nuevo.']] as const) {
    it(`${status} without a field is a general notice of the form, never under the image`, async () => {
      const { form, writer, settle, element } = await openFilledForm();
      writer.registrations[0].fail(refusal(status)); await settle();
      const alerts = Array.from(element.querySelectorAll('form [role="alert"]'));
      expect(alerts.map((a) => flat(a.textContent))).toEqual([text]);
      expect(alerts[0].parentElement?.tagName).toBe('FORM');
      expect(form.errorFor('image')).toBe('');
      expect(form.field('image').getAttribute('aria-invalid')).toBeNull();
      expect(element.textContent).not.toContain(ENGLISH);
    });
  }
  it('clears the general notice when the person tries again', async () => {
    const { form, writer, settle, element } = await openFilledForm();
    writer.registrations[0].fail(refusal(500)); await settle();
    expect(element.querySelectorAll('form > [role="alert"]').length).toBe(1);
    await form.submit();
    expect(element.querySelectorAll('form > [role="alert"]').length).toBe(0);
  });
});

describe('statusChangeRefusalsSpeakSpanish', () => {
  const rowAlert = (element: HTMLElement) => flat(element.querySelector('tbody tr [role="alert"]')?.textContent);
  for (const [status, text] of [[403, 'No tienes permiso para esta acción.'], [404, R.notFound], [500, 'No se pudo completar la solicitud. Intenta de nuevo.']] as const) {
    it(`${status} on inactivate shows the Spanish text in the row`, async () => {
      const { source, writer, settle, element, click } = await openPage();
      source.requests[0].reply([establishmentNamed('Alpha')]); await settle(); await click(ESTABLISHMENTS_COPY.inactivate);
      writer.transitions[0].fail(refusal(status)); await settle();
      expect(rowAlert(element)).toBe(text);
    });
  }
  it('422 on reactivate says it cannot be reactivated in its current state', async () => {
    const { source, writer, settle, element, click } = await openPage();
    source.requests[0].reply([{ ...establishmentNamed('Alpha'), associationStatus: 'INACTIVE' as const }]); await settle(); await click(ESTABLISHMENTS_COPY.reactivate);
    writer.transitions[0].fail(refusal(422)); await settle();
    expect(rowAlert(element)).toBe('No se puede reactivar este establecimiento en su estado actual.');
  });
});

describe('theBitacoraDoesNotLieWhenTheServiceSendsNone', () => {
  it('a list without changes (service sends none) says so honestly in the cell and in the panel', async () => {
    const { source, settle, element, click } = await openPage();
    source.requests[0].reply([establishmentNamed('Sin dato')]); await settle();
    const cell = flat(element.querySelector('tbody tr td:nth-child(3)')!.textContent);
    expect(cell).toContain('—'); expect(cell).not.toContain('Sin cambios registrados');
    await click('Gestionar', element.querySelector('tbody tr')!);
    const log = flat(element.querySelector('.crp-establishment-log')!.textContent);
    expect(log).toContain('Sin información de cambios todavía.'); expect(log).not.toContain('Sin cambios registrados');
  });
  it('a real empty list still says no change was recorded', async () => {
    const { source, settle, element, click } = await openPage();
    source.requests[0].reply([{ ...establishmentNamed('Vacío'), changes: [] }]); await settle();
    expect(flat(element.querySelector('tbody tr td:nth-child(3)')!.textContent)).toContain('Sin cambios registrados');
    await click('Gestionar', element.querySelector('tbody tr')!);
    expect(flat(element.querySelector('.crp-establishment-log')!.textContent)).toContain('Sin cambios registrados.');
  });
});

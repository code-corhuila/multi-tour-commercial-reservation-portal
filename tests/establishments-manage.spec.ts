import { ESTABLISHMENTS_COPY } from '../src/app/establishments/establishments-copy';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';
import { PORTAL_ROUTES } from '../src/app/catalog/catalog.routes';
import { AssociatedEstablishmentsSource } from '../src/app/establishments/data/associated-establishments-source';
import { AssociatedEstablishmentsWriter } from '../src/app/establishments/data/associated-establishments-writer';
import { EstablishmentsPageComponent } from '../src/app/establishments/pages/establishments-page.component';
import { actorAs } from './actor-context.double';
import { ControllableEstablishmentsSource, establishmentNamed } from './associated-establishments-source.double';
import { ControllableEstablishmentsWriter } from './associated-establishments-writer.double';
import { ControllableIdempotencyKeys, apiError } from './catalog-items-writer.double';
import { formControls } from './establishment-form.helpers';
import { ActorRole } from '../src/app/shared/portal-capabilities';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';

async function openPage(role: ActorRole | null = 'TENANT_ADMINISTRATOR') {
  const source = new ControllableEstablishmentsSource(), writer = new ControllableEstablishmentsWriter();
  TestBed.configureTestingModule({ providers: [
    { provide: AssociatedEstablishmentsSource, useValue: source },
    { provide: AssociatedEstablishmentsWriter, useValue: writer },
    { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    ...(role ? [{ provide: ActorContext, useValue: actorAs(role, true) }] : []),
  ] });
  const fixture = TestBed.createComponent(EstablishmentsPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const element: HTMLElement = fixture.nativeElement;
  const button = (text: string) => Array.from(element.querySelectorAll('button')).find((node) => node.textContent?.trim() === text)!;
  const click = async (text: string) => { button(text).click(); await settle(); };
  await settle();
  return { source, writer, fixture, settle, element, button, click };
}

describe('registersAnEstablishmentAndItAppearsAsPublished', () => {
  for (const empty of [true, false]) {
    it(`puts the published association first without another list request when the list is ${empty ? 'empty' : 'populated'}`, async () => {
      const { source, writer, settle, element, click } = await openPage();
      source.requests[0].reply(empty ? [] : [establishmentNamed('Earlier')]); await settle();
      await click(ESTABLISHMENTS_COPY.newEstablishment); const form = await formControls(element, settle);
      await form.fill(); await form.submit();
      writer.registrations[0].reply(establishmentNamed('Newest')); await settle();
      expect(element.querySelectorAll('[data-state]').length).toBe(1);
      expect(element.querySelector('[data-state="data"]')).not.toBeNull();
      expect(element.querySelector('tbody tr')!.textContent).toContain('Newest');
      expect(element.querySelector('tbody tr')!.textContent).toContain('ACTIVE');
      expect(element.querySelectorAll('tbody tr').length).toBe(empty ? 1 : 2);
      expect(source.requests.length).toBe(1); expect(element.querySelector('form')).toBeNull();
    });
  }
  it('keeps one form, cancels without a write, and a later opening starts a fresh intention', async () => {
    const { click, element, writer } = await openPage();
    await click(ESTABLISHMENTS_COPY.newEstablishment); await click(ESTABLISHMENTS_COPY.newEstablishment);
    expect(element.querySelectorAll('form').length).toBe(1);
    await click('Cancelar'); expect(element.querySelector('form')).toBeNull();
    expect(writer.registrations).toEqual([]);
    await click(ESTABLISHMENTS_COPY.newEstablishment); expect(element.querySelectorAll('form').length).toBe(1);
  });
  it('a form saving survives New, row actions, retry and filter events until its reply', async () => {
    const { source, writer, settle, element, click, button, fixture } = await openPage();
    source.requests[0].reply([establishmentNamed('Earlier')]); await settle();
    await click(ESTABLISHMENTS_COPY.newEstablishment); const form = await formControls(element, settle);
    await form.fill(); await form.submit();
    const original = element.querySelector('form');
    expect(button(ESTABLISHMENTS_COPY.newEstablishment).disabled).toBe(true);
    expect(button(ESTABLISHMENTS_COPY.inactivate).disabled).toBe(true);
    await click(ESTABLISHMENTS_COPY.newEstablishment); await click(ESTABLISHMENTS_COPY.inactivate); fixture.componentInstance.reload();
    const selector = element.querySelector<HTMLSelectElement>('#establishment-type')!;
    expect(selector.disabled).toBe(true); selector.value = 'RESTAURANT'; selector.dispatchEvent(new Event('change')); await settle();
    expect(element.querySelector('form')).toBe(original);
    expect(source.requests.length).toBe(1); expect(writer.transitions).toEqual([]);
    writer.registrations[0].reply(establishmentNamed('Saved')); await settle();
    expect(element.querySelector('form')).toBeNull();
  });
  it('a failed list retry leaves a saving form in place', async () => {
    const { source, writer, settle, element, click, button } = await openPage();
    source.requests[0].fail(); await settle(); await click(ESTABLISHMENTS_COPY.newEstablishment);
    const form = await formControls(element, settle); await form.fill(); await form.submit();
    expect(button(ESTABLISHMENTS_COPY.retry).disabled).toBe(true); await click(ESTABLISHMENTS_COPY.retry);
    expect(source.requests.length).toBe(1); expect(element.querySelector('form')).not.toBeNull();
    writer.registrations[0].reply(establishmentNamed('Recovered')); await settle();
    expect(element.querySelector('tbody tr')!.textContent).toContain('Recovered');
  });
});
describe('inactivatedEstablishmentStaysInTheListAsInactive', () => {
  it('keeps the association visible, guards a pending row, and sends only its identifier', async () => {
    const { source, writer, settle, element, click, button } = await openPage();
    const item = establishmentNamed('Alpha'); source.requests[0].reply([item]); await settle();
    await click(ESTABLISHMENTS_COPY.inactivate); expect(button(ESTABLISHMENTS_COPY.inactivate).disabled).toBe(true); await click(ESTABLISHMENTS_COPY.inactivate);
    expect(writer.transitions).toHaveLength(1); expect(writer.transitions[0].argumentCount).toBe(1);
    expect(writer.transitions[0].id).toBe(item.associationId);
    writer.transitions[0].reply({ ...item, associationStatus: 'INACTIVE' }); await settle();
    expect(element.querySelectorAll('tbody tr').length).toBe(1); expect(element.querySelector('tbody tr')!.textContent).toContain('INACTIVE');
    expect(button(ESTABLISHMENTS_COPY.reactivate).disabled).toBe(false);
  });
  it('shows a rejection by the row without changing its status and allows retry', async () => {
    const { source, writer, settle, element, click, button } = await openPage();
    source.requests[0].reply([establishmentNamed('Alpha')]); await settle(); await click(ESTABLISHMENTS_COPY.inactivate);
    writer.transitions[0].fail(apiError({ userMessage: 'Status change refused.' })); await settle();
    expect(element.querySelector('tbody tr [role="alert"]')!.textContent).toContain('Status change refused.');
    expect(element.querySelector('tbody tr')!.textContent).toContain('ACTIVE'); expect(element.querySelector('tbody tr')!.textContent).not.toContain('INACTIVE');
    expect(button(ESTABLISHMENTS_COPY.inactivate).disabled).toBe(false); await click(ESTABLISHMENTS_COPY.inactivate); expect(writer.transitions.length).toBe(2);
  });
  it('allows a different row to act while one is pending', async () => {
    const { source, writer, settle, element } = await openPage();
    source.requests[0].reply([establishmentNamed('Alpha'), establishmentNamed('Beta')]); await settle();
    const rows = element.querySelectorAll('tbody tr'); rows[0].querySelector('button')!.click(); await settle();
    expect(rows[1].querySelector('button')!.disabled).toBe(false); rows[1].querySelector('button')!.click(); await settle();
    expect(writer.transitions.length).toBe(2);
    writer.transitions[1].reply({ ...establishmentNamed('Beta'), associationStatus: 'INACTIVE' }); await settle();
    writer.transitions[0].reply({ ...establishmentNamed('Alpha'), associationStatus: 'INACTIVE' }); await settle();
    expect(Array.from(element.querySelectorAll('tbody tr')).every((row) => row.textContent?.includes('INACTIVE'))).toBe(true);
  });
});
describe('reactivatedEstablishmentShowsAsActive', () => {
  it('reactivates the inactive row and sends no key', async () => {
    const { source, writer, settle, element, click } = await openPage();
    const item = { ...establishmentNamed('Alpha'), associationStatus: 'INACTIVE' as const };
    source.requests[0].reply([item]); await settle(); await click(ESTABLISHMENTS_COPY.reactivate);
    expect(writer.transitions[0].kind).toBe('reactivate'); expect(writer.transitions[0].argumentCount).toBe(1);
    writer.transitions[0].reply({ ...item, associationStatus: 'ACTIVE' }); await settle();
    expect(element.querySelector('tbody tr')!.textContent).not.toContain('INACTIVE');
    expect(element.querySelector('tbody tr')!.textContent).toContain('ACTIVE');
  });
});
describe('managerAndAnalystReadWithoutActionsAccountantIsDenied', () => {
  for (const role of ['MANAGER', 'ANALYST', 'READ_ONLY'] as const) {
    it(`${role} sees the list with no registration or status actions even with a writer provided`, async () => {
      const { source, writer, settle, element } = await openPage(role);
      source.requests[0].reply([establishmentNamed('Readable')]); await settle();
      expect(element.querySelector('tbody tr')!.textContent).toContain('Readable');
      expect(element.querySelector('form, button')).toBeNull();
      expect(writer.registrations).toEqual([]); expect(writer.transitions).toEqual([]);
    });
  }
  it('without a supplied actor defaults to read-only even when the writer is provided', async () => {
    const { source, settle, element, writer } = await openPage(null);
    source.requests[0].reply([establishmentNamed('Readable')]); await settle();
    expect(element.querySelector('tbody tr')!.textContent).toContain('Readable');
    expect(element.querySelector('button')).toBeNull();
    expect(writer.registrations).toEqual([]); expect(writer.transitions).toEqual([]);
  });
});
describe('collaboratorGetsNoRouteAndNoMenuEntry', () => {
  for (const role of ['OPERATIONAL_COLLABORATOR', 'ACCOUNTANT'] as const) {
    it(`${role} has no list, form or actions and never calls the source or writer`, async () => {
      const { source, writer, element } = await openPage(role);
      expect(element.querySelector('table, form, button, select')).toBeNull();
      expect(source.requests).toEqual([]); expect(writer.registrations).toEqual([]); expect(writer.transitions).toEqual([]);
    });
    it(`${role} is denied by the route before the page renders`, async () => {
      const source = new ControllableEstablishmentsSource(), writer = new ControllableEstablishmentsWriter();
      TestBed.configureTestingModule({ providers: [provideRouter(PORTAL_ROUTES),
        { provide: ActorContext, useValue: actorAs(role) }, { provide: AssociatedEstablishmentsSource, useValue: source },
        { provide: AssociatedEstablishmentsWriter, useValue: writer },
      ] });
      const harness = await RouterTestingHarness.create();
      await expect(harness.navigateByUrl('/establishments')).rejects.toThrow('Cannot match any routes');
      expect(harness.routeNativeElement).toBeNull(); expect(source.requests).toEqual([]);
    });
  }
});

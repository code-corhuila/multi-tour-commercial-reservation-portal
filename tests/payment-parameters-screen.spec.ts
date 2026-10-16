import { Injector, Provider, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { CatalogHubPageComponent } from '../src/app/catalog/pages/catalog-hub-page.component';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { DemoPaymentParametersStore, DemoPaymentParametersWriter } from '../src/app/demo/payment-parameters-demo';
import { FixedClock } from '../src/app/demo/reservation-changes-demo';
import { PAYMENT_PARAMETERS_AREA, PaymentParametersSource, PaymentParametersView, PaymentParametersWriter, SaveParametersCommand } from '../src/app/payment-parameters/data/payment-parameters-ports';
import { PAYMENT_PARAMETERS_COPY as T } from '../src/app/payment-parameters/payment-parameters-copy';
import { PaymentParametersPageComponent } from '../src/app/payment-parameters/pages/payment-parameters-page.component';
import { RegisteringUser } from '../src/app/payments/data/payments-writer';
import { PORTAL_AREAS } from '../src/app/portal-areas';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-009 amendment v1.9, A.3 (admin-parametros-pago.html of the mockup PDR v1.9). Invented data only.
const NOW = '2026-10-14T10:00:00-05:00';
const TOURS = ['Desierto de la Tatacoa al atardecer', 'Ruta del café en Pitalito', 'Canotaje en el Río Suaza'];
const user = new (class extends RegisteringUser { override label() { return 'Administrador del tenant (demo)'; } })();

class SpyWriter extends PaymentParametersWriter {
  readonly saved: { command: SaveParametersCommand; key: string }[] = [];
  failNext = false;
  constructor(private readonly inner: DemoPaymentParametersWriter) { super(); }
  override save(command: SaveParametersCommand, key: string): Observable<PaymentParametersView> {
    this.saved.push({ command, key });
    if (this.failNext) { this.failNext = false; return throwError(() => ({ status: 503 })); }
    return this.inner.save(command, key);
  }
}

async function screen(role = 'TENANT_ADMINISTRATOR', source?: PaymentParametersSource) {
  const store = new DemoPaymentParametersStore(), spy = new SpyWriter(new DemoPaymentParametersWriter(store, PortalCapabilities.for(role), user, new FixedClock(NOW), new Map()));
  const navigation = new PortalNavigation();
  navigation.register(['catalog', PAYMENT_PARAMETERS_AREA]);
  TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    { provide: PaymentParametersSource, useValue: source ?? store }, { provide: PaymentParametersWriter, useValue: spy }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: navigation }] as Provider[] });
  const fixture = TestBed.createComponent(PaymentParametersPageComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const cell = (row: number, key: string) => host.querySelectorAll('tbody')[0].querySelectorAll('tr')[row].querySelector<HTMLInputElement>(`input[name="${key}"]`)!;
  const type = async (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); await settle(); };
  const reason = () => host.querySelector<HTMLInputElement>('input[name="reason"]')!;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
  const submit = async () => { button('Guardar parámetros').click(); await settle(); };
  const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim();
  return { store, spy, navigation, fixture, host, settle, cell, type, reason, button, submit, flat };
}

describe('thePaymentParametersScreenDrawsTheMockup', () => {
  it('draws the heading, the note, the grid with its six columns, the tenant row first and one row per active tour', async () => {
    const s = await screen();
    expect(s.flat(s.host.querySelector('h1'))).toBe('Parámetros de pago del tenant');
    expect(s.flat(s.host.querySelector('.crp-operator-access-note'))).toContain('Solo el Administrador del tenant define plazos y condiciones de pago.');
    const heads = Array.from(s.host.querySelectorAll('thead')[0].querySelectorAll('th'), (h) => h.textContent!.trim());
    expect(heads).toEqual(['Servicio', 'Inicial pago total (h)', 'Inicial abono (h)', 'Abono mínimo (%)', 'Ampliación (h)', 'Saldo (h antes)', 'Penalidad (%)']);
    expect(Array.from(s.host.querySelectorAll('tbody')[0].querySelectorAll('tr'), (r) => r.querySelector('th,td')!.textContent!.trim())).toEqual(['Predeterminado del tenant', ...TOURS]);
    expect(s.host.querySelector('thead th')?.getAttribute('scope')).toBe('col');
    expect(s.host.querySelector('tbody th')?.getAttribute('scope')).toBe('row');
  });
  it('shows the applied value as the grey placeholder of an empty cell and the tenant value in the tenant row', async () => {
    const s = await screen();
    expect(s.cell(0, 'initialHoursTotal').value).toBe('72');
    expect(s.cell(1, 'initialHoursTotal').value).toBe('');
    expect(s.cell(1, 'initialHoursTotal').placeholder).toBe('72');
    expect(s.cell(0, 'minDepositPercent').placeholder).toBe('33,33');
    expect(s.cell(1, 'cancellationPenaltyPercent').placeholder).toBe('—');
  });
  it('names every cell for assistive technology and bounds it', async () => {
    const s = await screen(), input = s.cell(1, 'minDepositPercent');
    expect(input.getAttribute('aria-label')).toBe('Abono mínimo (% del valor final) · ' + TOURS[0]);
    expect([input.min, input.max, input.type]).toEqual(['1', '100', 'number']);
  });
  it('says nothing has been saved and the audit is empty before a change', async () => {
    const s = await screen();
    expect(s.flat(s.host.querySelector('[data-payment-params-meta]'))).toBe('Sin cambios guardados: se usan los valores predeterminados.');
    expect(s.flat(s.host.querySelector('[data-payment-params-history]'))).toBe('Sin cambios auditados.');
    expect(s.reason().placeholder).toBe('Ej.: política comercial de temporada');
  });
  it('goes back to Catálogos with PortalNavigation.open', async () => {
    const s = await screen(), opened: string[] = [];
    s.navigation.open = (key: string) => { opened.push(key); return true; };
    s.button('Volver a Catálogos').click();
    expect(opened).toEqual(['catalog']);
  });
});

describe('onlyTheAdministratorOpensThePaymentParameters', () => {
  const area = PORTAL_AREAS.find((a) => a.key === PAYMENT_PARAMETERS_AREA)!;
  const availableFor = (role: string) => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
      { provide: PaymentParametersSource, useValue: new DemoPaymentParametersStore() }, { provide: PaymentParametersWriter, useValue: {} }] });
    return runInInjectionContext(TestBed.inject(Injector), () => area.isAvailable!(TestBed.inject(Injector)));
  };
  it('registers an area with no menu entry under Catálogos', () => {
    expect(area).toMatchObject({ key: 'payment-parameters', label: 'Parámetros de pago', menu: false, parent: 'catalog' });
  });
  it('offers the area to the Administrator and to no other role', () => {
    expect(availableFor('TENANT_ADMINISTRATOR')).toBe(true);
    TestBed.resetTestingModule();
    for (const role of ['OPERATIONAL_COLLABORATOR', 'MANAGER', 'ANALYST', 'ACCOUNTANT', 'READ_ONLY']) { expect(availableFor(role)).toBe(false); TestBed.resetTestingModule(); }
  });
  it('offers the area only in a build that supplies the ports', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs('TENANT_ADMINISTRATOR') }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() }] });
    expect(area.isAvailable!(TestBed.inject(Injector))).toBe(false);
  });
  it('draws the link "Parámetros de pago" in the header of Catálogos for the Administrator only', async () => {
    const hub = async (role: string) => {
      TestBed.resetTestingModule();
      const navigation = new PortalNavigation();
      navigation.register(['catalog-tours', PAYMENT_PARAMETERS_AREA]);
      TestBed.configureTestingModule({ providers: [{ provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() }, { provide: PortalNavigation, useValue: navigation }] });
      const fixture = TestBed.createComponent(CatalogHubPageComponent);
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      return { navigation, link: Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.crp-page-header button')).find((b) => b.textContent?.trim() === 'Parámetros de pago') as HTMLButtonElement | undefined };
    };
    const admin = await hub('TENANT_ADMINISTRATOR'), opened: [string, unknown][] = [];
    admin.navigation.open = (key: string, params?: unknown) => { opened.push([key, params]); return true; };
    admin.link!.click();
    expect(opened.map(([key]) => key)).toEqual(['payment-parameters']);
    expect((await hub('OPERATIONAL_COLLABORATOR')).link).toBeUndefined();
    expect((await hub('MANAGER')).link).toBeUndefined();
  });
  it('refuses to draw the form to a role without the capability', async () => {
    const s = await screen('OPERATIONAL_COLLABORATOR');
    expect(s.host.querySelector('form')).toBeNull();
    expect(s.flat(s.host.querySelector('[data-state="denied"]'))).toBe(T.forbidden);
  });
});

describe('parametersAreBoundedNeedAReasonAndLeaveAnAuditLine', () => {
  it('refuses a value out of its bounds beside the field, marks it invalid, focuses it and sends nothing', async () => {
    const s = await screen(), input = s.cell(0, 'initialHoursTotal');
    await s.type(input, '721'); await s.type(s.reason(), 'Temporada alta');
    await s.submit();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = s.host.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(s.flat(described)).toBe('Predeterminado del tenant: Plazo inicial · pago total (h) debe ser un entero entre 1 y 720.');
    expect(document.activeElement).toBe(input);
    expect(s.spy.saved).toEqual([]);
  });
  it('refuses a decimal value and a penalty of 101', async () => {
    const s = await screen();
    await s.type(s.cell(1, 'extensionHours'), '2.5'); await s.type(s.cell(2, 'cancellationPenaltyPercent'), '101'); await s.type(s.reason(), 'Temporada alta');
    await s.submit();
    expect(s.cell(1, 'extensionHours').getAttribute('aria-invalid')).toBe('true');
    expect(s.cell(2, 'cancellationPenaltyPercent').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(s.cell(1, 'extensionHours'));
  });
  it('asks for the reason beside its field and focuses it', async () => {
    const s = await screen();
    await s.type(s.cell(0, 'minDepositPercent'), '50');
    await s.submit();
    expect(s.reason().getAttribute('aria-invalid')).toBe('true');
    expect(s.flat(s.host.querySelector(`#${s.reason().getAttribute('aria-describedby')}`))).toBe('Registra el motivo del cambio de parámetros.');
    expect(document.activeElement).toBe(s.reason());
    expect(s.spy.saved).toEqual([]);
  });
  it('sends only the cells the person touched, with the reason, and shows the audit line, the meta line and the new placeholder', async () => {
    const s = await screen();
    await s.type(s.cell(0, 'minDepositPercent'), '50'); await s.type(s.cell(2, 'cancellationPenaltyPercent'), '20'); await s.type(s.reason(), ' Política de temporada ');
    await s.submit();
    expect(s.spy.saved).toHaveLength(1);
    expect(s.spy.saved[0].command).toEqual({ tenant: { minDepositPercent: 50 }, services: { [TOURS[1]]: { cancellationPenaltyPercent: 20 } }, reason: 'Política de temporada' });
    expect(s.flat(s.host.querySelector('[data-payment-params-feedback]'))).toContain('Parámetros guardados y auditados.');
    expect(s.flat(s.host.querySelector('[data-payment-params-meta]'))).toContain('Última modificación:');
    expect(s.flat(s.host.querySelector('[data-payment-params-meta]'))).toContain('Administrador del tenant (demo)');
    expect(Array.from(s.host.querySelectorAll('[data-payment-params-history] tr'), (r) => Array.from(r.querySelectorAll('td'), (c) => c.textContent!.trim()).slice(1)))
      .toEqual([['Administrador del tenant (demo)', 'Predeterminado del tenant', 'Política de temporada'], ['Administrador del tenant (demo)', TOURS[1], 'Política de temporada']]);
    expect(s.cell(1, 'minDepositPercent').placeholder).toBe('50');
    expect(s.reason().value).toBe('');
  });
  it('clears an emptied cell back to the inherited value with null', async () => {
    const s = await screen();
    await s.type(s.cell(1, 'initialHoursTotal'), '12'); await s.type(s.reason(), 'Uno'); await s.submit();
    expect(s.cell(1, 'initialHoursTotal').value).toBe('12');
    await s.type(s.cell(1, 'initialHoursTotal'), ''); await s.type(s.reason(), 'Dos'); await s.submit();
    expect(s.spy.saved[1].command.services).toEqual({ [TOURS[0]]: { initialHoursTotal: null } });
    expect(s.cell(1, 'initialHoursTotal').value).toBe('');
  });
  it('loads the defaults into the grid without saving', async () => {
    const s = await screen();
    await s.type(s.cell(0, 'initialHoursTotal'), '10'); await s.type(s.cell(1, 'minDepositPercent'), '40');
    s.button('Cargar predeterminados').click(); await s.settle();
    expect(s.cell(0, 'initialHoursTotal').value).toBe('');
    expect(s.cell(1, 'minDepositPercent').value).toBe('');
    expect(s.flat(s.host.querySelector('[data-payment-params-feedback]'))).toBe('Valores predeterminados cargados: guarda con un motivo para aplicarlos.');
    expect(s.spy.saved).toEqual([]);
  });
});

describe('thePaymentParametersSaveKeepsItsIdempotencyKeyOnRetry', () => {
  it('sends the same key again after a failure and a new one for a different change', async () => {
    const s = await screen();
    s.spy.failNext = true;
    await s.type(s.cell(0, 'minDepositPercent'), '50'); await s.type(s.reason(), 'Temporada');
    await s.submit();
    expect(s.flat(s.host.querySelector('[data-payment-params-feedback]'))).toContain(T.failed);
    await s.submit();
    expect(s.spy.saved).toHaveLength(2);
    expect(s.spy.saved[1].key).toBe(s.spy.saved[0].key);
    await s.type(s.cell(0, 'minDepositPercent'), '60'); await s.type(s.reason(), 'Otra'); await s.submit();
    expect(s.spy.saved[2].key).not.toBe(s.spy.saved[0].key);
  });
  it('shows the message the service gave when it refuses', async () => {
    const s = await screen();
    await s.type(s.cell(0, 'minDepositPercent'), '33'); await s.type(s.reason(), 'Igual'); await s.submit();
    await s.type(s.cell(0, 'minDepositPercent'), '33'); await s.type(s.reason(), 'Igual'); await s.submit();
    expect(s.flat(s.host.querySelector('[data-payment-params-feedback]'))).toBe('No hay cambios que guardar.');
  });
});

describe('thePaymentParametersScreenShowsItsStates', () => {
  it('shows loading while the parameters are read and an error with a retry when the read fails', async () => {
    const waiting = await screen('TENANT_ADMINISTRATOR', { read: () => NEVER, minimumDepositCents: () => of(0) });
    expect(waiting.host.querySelector('[data-state="loading"]')).not.toBeNull();
    TestBed.resetTestingModule();
    let fail = true;
    const store = new DemoPaymentParametersStore();
    const broken = await screen('TENANT_ADMINISTRATOR', { read: (names) => (fail ? throwError(() => ({ userMessage: 'Servicio caído' })) : store.read(names)), minimumDepositCents: () => of(0) });
    expect(broken.flat(broken.host.querySelector('[data-state="error"]'))).toContain('Servicio caído');
    fail = false;
    broken.button('Reintentar').click(); await broken.settle();
    expect(broken.host.querySelector('[data-state="error"]')).toBeNull();
    expect(broken.host.querySelectorAll('tbody')[0].querySelectorAll('tr').length).toBe(1 + TOURS.length);
    expect(await firstValueFrom(store.read([]))).toBeTruthy();
  });
});

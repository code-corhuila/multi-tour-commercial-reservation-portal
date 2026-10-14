import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogItemsSource } from '../src/app/catalog/data/catalog-api.service';
import { DemoCatalogStore } from '../src/app/demo/demo-sources';
import { paymentFollowupDemoProviders } from '../src/app/demo/payment-followup-demo';
import { paymentsDemoProviders } from '../src/app/demo/payments-demo';
import { proofReviewDemoProviders } from '../src/app/demo/proof-review-demo';
import { DemoReservationsStore, reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { DemoPaymentMethods } from '../src/app/demo/self-service-reservation-demo';
import { PAYMENTS_DETAIL_BLOCK } from '../src/app/payments/components/reservation-payments-block.component';
import { PaymentsWriter } from '../src/app/payments/data/payments-writer';
import { PaymentManagementPageComponent } from '../src/app/payments/pages/payment-management-page.component';
import { PortalNavigation } from '../src/app/portal-navigation';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { PaymentMethodsSource } from '../src/app/self-service-reservation/data/reservation-confirmation-ports';
import { ActorContext } from '../src/app/shared/actor-context';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { RESERVATION_DETAIL_BLOCKS, contribute } from '../src/app/shared/portal-slots';
import { actorAs } from './actor-context.double';
import { ControllableIdempotencyKeys } from './catalog-items-writer.double';
import { reservationOf, screenOf } from './reservations.double';

// Slice 4 of the v1.9 alignment: admin-gestion-pago.html and the "Pagos y comprobantes" block of admin-detalle-reserva.html.
// RES-1841 is Abono · Efectivo ($418.000, minimum deposit one third = $139.333,34 in the demo); RES-1842 Pago total · Transferencia ($850.000).
const TRANSFER = 'RES-1842';
const CASH = 'RES-1841';
const pdf = () => new File(['x'], 'soporte.pdf', { type: 'application/pdf' });
const flat = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
const nav = (reservation: string) => { const n = new PortalNavigation(); n.params.set({ reservation }); return n; };
function providers(reservation = CASH, role = 'TENANT_ADMINISTRATOR') {
  return [
    { provide: ActorContext, useValue: actorAs(role as never) }, { provide: CatalogItemsSource, useValue: new DemoCatalogStore() },
    ...reservationDemoProviders(), ...paymentsDemoProviders(), ...proofReviewDemoProviders(), ...paymentFollowupDemoProviders(),
    { provide: PaymentMethodsSource, useValue: new DemoPaymentMethods() }, { provide: IdempotencyKeys, useValue: new ControllableIdempotencyKeys() },
    { provide: PortalNavigation, useValue: nav(reservation) },
  ];
}
const store = () => TestBed.inject(ReservationsSource) as DemoReservationsStore;
const stored = async (id: string) => (await firstValueFrom(store().list())).find((r) => r.id === id)!;
const register = (id: string, amountCents: number, key: string, proof: File | null = null) => firstValueFrom(TestBed.inject(PaymentsWriter).register({ reservationId: id, amountCents, proof }, key));
const refusal = (call: Promise<unknown>) => call.then(() => { throw new Error('accepted'); }, (e: { userMessage: string }) => e.userMessage);
const screen = (id = CASH, extra: unknown[] = []) => screenOf(PaymentManagementPageComponent, [...providers(id), ...extra]);
const labels = (element: Element) => Array.from(element.querySelectorAll('.crp-payments-list dt'), (dt) => dt.textContent?.trim());
const valueOf = (element: Element, label: string) => Array.from(element.querySelectorAll('.crp-payments-list > div')).find((d) => d.querySelector('dt')?.textContent?.trim() === label)?.querySelector('dd')?.textContent?.trim();

afterEach(() => TestBed.resetTestingModule());

describe('cash received by the team is a validated payment (RF-015A, RN-RES-004, D9)', () => {
  it('a deposit below the minimum moves the validated value, the balance and the financial situation but does not confirm', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    const after = await register(CASH, 5_000_000, 'k-1');
    expect(after).toMatchObject({ validatedCents: 5_000_000, balanceCents: 36_800_000, status: 'PENDIENTE_DE_PAGO', financialStatus: 'PARCIAL', seatHeld: true });
    expect(after.payments![0]).toMatchObject({ method: 'CASH_AT_OFFICE', proofStatus: 'SIN_COMPROBANTE', appliedCents: 5_000_000 });
    expect(await stored(CASH)).toEqual(after);
  });

  it('reaching the minimum deposit confirms the reservation as Abono recibido', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    await register(CASH, 5_000_000, 'k-1');
    expect(await register(CASH, 10_000_000, 'k-2')).toMatchObject({ validatedCents: 15_000_000, status: 'CONFIRMADA', financialStatus: 'ABONO_RECIBIDO' });
  });

  it('a total payment of 100 % confirms it as Pago completo, and the excess over the balance is not applied', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    store().items = [...store().items, reservationOf('RES-T', { departureId: 'demo-dep-1', paymentType: 'TOTAL', paymentMethod: 'CASH_AT_OFFICE', people: 1 })];
    const after = await register('RES-T', 6_000, 'k-1');
    expect(after).toMatchObject({ validatedCents: 5_000, balanceCents: 0, status: 'CONFIRMADA', financialStatus: 'PAGO_COMPLETO' });
    expect(after.payments![0]).toMatchObject({ amountCents: 6_000, appliedCents: 5_000 });
  });

  it('a transfer registered by the team is still only En validación', async () => {
    TestBed.configureTestingModule({ providers: providers(TRANSFER) });
    expect(await register(TRANSFER, 30_000_000, 'k-1', pdf())).toMatchObject({ validatedCents: undefined, balanceCents: 85_000_000, status: 'PENDIENTE_DE_PAGO' });
  });

  it('the blocking messages are the ones of the mockup', async () => {
    TestBed.configureTestingModule({ providers: providers() });
    expect(await refusal(register('RES-1836', 100, 'k-1'))).toBe('Esta reserva está cancelada: no se pueden registrar nuevos pagos ni comprobantes. Se conserva la trazabilidad existente.');
    expect(await refusal(register(TRANSFER, 100, 'k-2'))).toBe('Adjunta el comprobante de transferencia para enviarlo a validación.');
    expect(await refusal(register(TRANSFER, 100, 'k-3', new File(['x'], 'a.gif')))).toBe('El comprobante debe ser PDF, JPG, JPEG o PNG y no superar 5 MB.');
    history.replaceState(null, '', '/platform/areas/commercial-reservation-portal?demoNow=2026-11-14T08:00:00-05:00');
    try { expect(await refusal(register(CASH, 100, 'k-4'))).toBe('Se alcanzó la hora programada de inicio de la salida: ya no se aceptan pagos ni comprobantes.'); }
    finally { history.replaceState(null, '', '/platform/areas/commercial-reservation-portal'); }
  });

  it('without a seat the message names the departure and the available seats', async () => {
    history.replaceState(null, '', '/platform/areas/commercial-reservation-portal?demoFixtures=full-departure');
    try {
      TestBed.configureTestingModule({ providers: providers() });
      expect(await refusal(register(CASH, 100, 'k-1'))).toMatch(/no tiene cupo suficiente \(0 disponibles para 1 viajeros\): el sistema no recibe el primer pago ni aparta cupo\.$/);
    } finally { history.replaceState(null, '', '/platform/areas/commercial-reservation-portal'); }
  });
});

describe('admin-gestion-pago, labels and texts of the current mockup', () => {
  it('draws the rows of the mockup in its order, with the departure and the deadline', async () => {
    const { element } = await screen(TRANSFER);
    expect(labels(element)).toEqual(['Tipo y medio de pago', 'Estado del comprobante', 'Situación financiera', 'Salida', 'Plazo de pago', 'Valor final', 'Valores validados', 'Saldo pendiente']);
    expect(valueOf(element, 'Tipo y medio de pago')).toBe('Pago total · Transferencia');
    expect(valueOf(element, 'Salida')).toBe('Desierto de la Tatacoa al atardecer · 07 nov 2026 (Programada)');
    expect(valueOf(element, 'Plazo de pago')).toBe('Vence el 16 oct 2026 · 09:00.');
    expect(valueOf(element, 'Valores validados')).toBe('$0');
    expect(valueOf(element, 'Saldo pendiente')).toBe('$850.000');
    expect(flat(element)).not.toMatch(/Modalidad|Soporte de transferencia|soporte/);
  });

  it('draws the long action text, the proof field and the button of the mockup', async () => {
    const { element, button } = await screen(TRANSFER);
    expect(flat(element)).toContain('El comprobante no es ingreso de caja hasta su validación y la reserva permanece Pendiente de pago hasta cumplir la condición de confirmación (100 % del valor final en pago total, abono mínimo en abono). Registra aquí el efectivo recibido o el comprobante en nombre del cliente: el sistema verifica el cupo de la salida antes de recibirlo. La revisión máxima del comprobante es de 24 horas corridas.');
    expect(element.querySelector('label[for="crp-payments-proof"]')?.textContent).toContain('Comprobante de transferencia (PDF, JPG, JPEG o PNG, máximo 5 MB)');
    expect(button('Registrar comprobante')).toBeDefined();
    expect(flat(element)).toContain('Registra el monto para actualizar la situación financiera y el saldo pendiente.');
  });

  it('a cash reservation offers Registrar pago recibido and the minimum deposit', async () => {
    const { element, button } = await screen(CASH);
    expect(button('Registrar pago recibido')).toBeDefined();
    expect(element.querySelector<HTMLInputElement>('[name="amount"]')?.placeholder).toBe('Monto del abono');
  });

  it('registering cash answers with the new financial situation, then with the confirmation', async () => {
    const { element, type, click } = await screen(CASH);
    await type('amount', '50000'); await click('Registrar pago recibido');
    expect(element.querySelector('.crp-payments-feedback')?.textContent).toContain('Pago en efectivo registrado. Situación financiera: Parcial.');
    expect(valueOf(element, 'Valores validados')).toBe('$50.000');
    expect(valueOf(element, 'Saldo pendiente')).toBe('$368.000');
    await type('amount', '100000'); await click('Registrar pago recibido');
    expect(element.querySelector('.crp-payments-feedback')?.textContent).toContain('Pago en efectivo registrado. Se cumplió la condición de confirmación y la reserva quedó Confirmada.');
    expect(element.querySelector('.crp-operator-status')?.textContent).toContain('Confirmada');
  });

  it('a transfer answers that it is registered on behalf of the customer and stays En validación', async () => {
    const { element, type, click, fixture } = await screen(TRANSFER);
    await type('amount', '300000');
    const input = element.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [pdf()], configurable: true }); input.dispatchEvent(new Event('change'));
    await click('Registrar comprobante'); fixture.detectChanges();
    expect(element.querySelector('.crp-payments-feedback')?.textContent).toContain('Comprobante registrado en nombre del cliente. Queda En validación y la reserva sigue Pendiente de pago hasta su aprobación.');
  });

  it('a settled reservation shows Total validado and the Movimientos of the cash received', async () => {
    const { element, type, click } = await screen(CASH);
    await type('amount', '418000'); await click('Registrar pago recibido');
    expect(element.querySelector('.crp-payments-action h2')?.textContent?.trim()).toBe('Pago registrado');
    const done = flat(element.querySelector('.crp-payments-completed')!);
    expect(done).toContain('Total validado');
    expect(done).toContain('$418.000');
    expect(done).toMatch(/Efectivo recibido \(\d{2} \w{3} \d{4} · \d{2}:\d{2}\) \$418\.000/);
  });
});

describe('the Pagos y comprobantes block of the reservation detail', () => {
  async function detail(reservation: Reservation) {
    TestBed.configureTestingModule({ providers: [...providers(), contribute(RESERVATION_DETAIL_BLOCKS, PAYMENTS_DETAIL_BLOCK)] });
    const fixture = TestBed.createComponent(ReservationViewComponent);
    fixture.componentRef.setInput('reservation', reservation); fixture.componentRef.setInput('fresh', false);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const base: Reservation = { ...reservationOf(TRANSFER), paymentType: 'TOTAL', paymentMethod: 'BANK_TRANSFER', validatedCents: 5_000, balanceCents: 0,
    payments: [
      { id: 'p-1', method: 'BANK_TRANSFER', amountCents: 3_000, proofName: 'a.pdf', proofStatus: 'RECHAZADO', registeredBy: 'Cliente', presentedAt: '2026-10-10T09:00:00-05:00',
        review: { decision: 'RECHAZADO', verifiedAmountCents: null, reason: 'Ilegible', actorLabel: 'Administrador', decidedAt: '2026-10-10T15:00:00.000Z' } },
      { id: 'p-2', method: 'BANK_TRANSFER', amountCents: 5_000, proofName: 'b.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente', presentedAt: '2026-10-12T09:00:00-05:00' },
      { id: 'p-3', method: 'CASH_AT_OFFICE', amountCents: 1_000, proofName: null, proofStatus: 'SIN_COMPROBANTE', registeredBy: 'Caja', appliedCents: 1_000 }] };

  it('is titled Pagos y comprobantes and lists the proofs presented in a Histórico table', async () => {
    const element = await detail(base);
    const block = element.querySelector('.crp-payments-block')!;
    expect(block.textContent).toContain('Pagos y comprobantes');
    expect(block.textContent).not.toContain('Pagos y soportes');
    const history = element.querySelector('.crp-payments-receipts')!;
    expect(flat(history)).toContain('Histórico');
    expect(flat(history)).toContain('Comprobantes presentados');
    expect(Array.from(history.querySelectorAll('th'), (th) => th.textContent?.trim())).toEqual(['Presentado', 'Valor declarado', 'Monto verificado', 'Estado', 'Decisión']);
    const rows = Array.from(history.querySelectorAll('tbody tr'), (tr) => Array.from(tr.querySelectorAll('td'), (td) => flat(td)));
    expect(rows).toEqual([
      ['10 oct 2026 · 09:00', '$30', '—', 'Rechazado', 'Administrador · 10 oct 2026 · 10:00 · Ilegible'],
      ['12 oct 2026 · 09:00', '$50', '—', 'En validación', 'Pendiente de decisión'],
    ]);
  });

  it('says Sin comprobantes presentados when the reservation has none', async () => {
    const element = await detail({ ...base, payments: [] });
    expect(flat(element.querySelector('.crp-payments-receipts')!)).toContain('Sin comprobantes presentados.');
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { reservationDemoProviders } from '../src/app/demo/reservations-demo';
import { ReservationViewComponent } from '../src/app/reservations/components/reservation-view.component';
import { ReservationsSource } from '../src/app/reservations/data/reservations-source';
import { Reservation } from '../src/app/reservations/model/reservation';
import { reservationOf } from './reservations.double';

afterEach(() => TestBed.resetTestingModule());

// HU-COM-007, 10A (admin-detalle-reserva.html): the hero names the departure by its code, "Titular y viajeros" lists the Correo, and the demo reservations
// carry what the mockup shows for them (e-mail, departure code, payment deadline). Spec 007- row of 10A: "Cliente, Correo, Viajeros registrados, Acompañantes".
async function detail(reservation: Reservation): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(ReservationViewComponent);
  fixture.componentRef.setInput('reservation', reservation);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}
const lines = (element: HTMLElement) => Array.from(element.querySelectorAll('dl div'), (row) => `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`);

describe('theHeroNamesTheDepartureByItsCode', () => {
  it('writes "Salida SAL-004: 15 sep 2026 · 06:30 · 2 viajeros" when the reservation carries the code of its departure', async () => {
    const element = await detail(reservationOf('RES-1842', { departureCode: 'SAL-004', departureDate: '2026-09-15T06:30:00', people: 2 }));
    expect(element.querySelector('.crp-reservations-hero')?.textContent).toContain('Salida SAL-004: 15 sep 2026 · 06:30 · 2 viajeros');
  });

  it('keeps "Salida:" when there is no code', async () => {
    const element = await detail(reservationOf('RES-1842', { departureDate: '2026-09-15', people: 2 }));
    expect(element.querySelector('.crp-reservations-hero')?.textContent).toContain('Salida: 15 sep 2026 · 2 viajeros');
  });
});

describe('theHolderListsTheEmail', () => {
  it('draws "Correo" before the registered travelers when the reservation carries it', async () => {
    const element = await detail(reservationOf('RES-1842', { leadEmail: 'laura.gomez@ejemplo.com', people: 2 }));
    const holder = element.querySelectorAll('.crp-reservations-panels section')[0];
    expect(lines(holder as HTMLElement)).toEqual(['Correo laura.gomez@ejemplo.com', 'Viajeros registrados 2 personas', 'Acompañantes registrados 1 acompañante']);
  });

  it('draws no empty "Correo" row when the reservation has none', async () => {
    const element = await detail(reservationOf('RES-1842', { people: 2 }));
    expect(element.textContent).not.toContain('Correo');
  });
});

describe('theDemoReservationsCarryWhatTheMockupShows', () => {
  it('gives RES-1842 and RES-1841 an e-mail, a departure code and a payment deadline, and the extension of RES-1841', async () => {
    TestBed.configureTestingModule({ providers: reservationDemoProviders() });
    const items = await new Promise<readonly Reservation[]>((resolve) => TestBed.inject(ReservationsSource).list().subscribe(resolve));
    const r1842 = items.find((r) => r.id === 'RES-1842')!, r1841 = items.find((r) => r.id === 'RES-1841')!;
    expect(r1842).toMatchObject({ leadEmail: 'laura.gomez@ejemplo.com', departureCode: 'SAL-001', deadline: { dueAt: '2026-10-16T09:00:00-05:00' } });
    expect(r1841).toMatchObject({ leadEmail: 'mateo.rios@ejemplo.com', departureCode: 'SAL-002', deadline: { extendedUntil: '2026-10-18T09:00:00-05:00' } });
  });

  it('shows the payment deadline in "Salida y plazos" for RES-1842', async () => {
    TestBed.configureTestingModule({ providers: reservationDemoProviders() });
    const items = await new Promise<readonly Reservation[]>((resolve) => TestBed.inject(ReservationsSource).list().subscribe(resolve));
    const element = await detail(items.find((r) => r.id === 'RES-1842')!);
    expect(element.textContent).not.toContain('Sin información de plazo.');
    expect(element.textContent).toContain('Plazo de pago');
  });
});

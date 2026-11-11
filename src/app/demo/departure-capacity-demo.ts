import { Provider } from '@angular/core';
import { DepartureCapacity } from '../reservations/data/departure-capacity';
import { Departure } from '../reservations/model/reservation';

/** DEMO build only: the seat rule RN-RES-007 over the effective capacity of the demo departures (a read-only comparison, it holds no seat). */
export class DemoDepartureCapacity extends DepartureCapacity {
  override hasSeats(departure: Departure): boolean { return departure.effectiveCapacity > 0; }
  override fits(departure: Departure, people: number): boolean { return people <= departure.effectiveCapacity; }
  override refusal(departure: Departure): string {
    return `No hay cupo suficiente en esta salida: quedan ${departure.effectiveCapacity} cupos. No se registró la reserva.`;
  }
}

export const departureCapacityProviders = (): Provider[] => [{ provide: DepartureCapacity, useValue: new DemoDepartureCapacity() }];

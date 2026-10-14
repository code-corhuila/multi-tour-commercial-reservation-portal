import { describe, expect, it } from 'vitest';
import { DemoDepartureCapacity } from '../src/app/demo/departure-capacity-demo';
import { departureOf } from './reservations.double';

// RN-RES-007: the seat rule lives behind the DepartureCapacity port; the demo implements it, the views only show its answers.
describe('demoDepartureCapacity', () => {
  const capacity = new DemoDepartureCapacity();
  it('fits the people that do not exceed the effective capacity and refuses the rest with the message', () => {
    expect(capacity.fits(departureOf(1, { effectiveCapacity: 3 }), 3)).toBe(true);
    expect(capacity.fits(departureOf(1, { effectiveCapacity: 3 }), 4)).toBe(false);
    expect(capacity.refusal(departureOf(1, { effectiveCapacity: 3 }))).toBe('No hay cupo suficiente en esta salida: quedan 3 cupos. No se registró la reserva.');
  });
  it('says a departure with no capacity has no seats', () => {
    expect(capacity.hasSeats(departureOf(1, { effectiveCapacity: 0 }))).toBe(false);
    expect(capacity.hasSeats(departureOf(1, { effectiveCapacity: 1 }))).toBe(true);
  });
});

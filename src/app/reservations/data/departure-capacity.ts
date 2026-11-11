import { Departure } from '../model/reservation';

/**
 * RN-RES-007 behind a port (pillar 2): whether a departure has seats and whether it holds N people is decided by the service, not by a
 * screen. The container supplies the implementation; the views only show what it answers. It holds no seat (the first payment does).
 */
export abstract class DepartureCapacity {
  abstract hasSeats(departure: Departure): boolean;
  abstract fits(departure: Departure, people: number): boolean;
  /** The refusal text for a departure that cannot hold the people asked. */
  abstract refusal(departure: Departure): string;
}

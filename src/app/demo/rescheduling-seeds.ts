import type { Departure, Reservation } from '../reservations/model/reservation';

// DEMO (spec 018- section 6, DD-2): the episode is seeded, since its origin (HU-OPS-006, saga cancel-departure) is not built.
// Ruta Andina and the 06:30 departures come from the mockup (app.js 2621-2626); dates, names and amounts are invented,
// after the demo clock of 13 oct 2026 so the deadlines read as the mockup's "quedan 82 h". Codes below every other seed.
const ANDINA = 'Ruta Andina';
const at = (day: number) => `2026-10-${day}T06:30:00-05:00`;
const departure = (n: number, day: number, state: Departure['state'], effectiveCapacity: number): Departure => ({ id: `demo-dep-${n}`, tourName: ANDINA,
  date: at(day), state, openForReservations: state === 'PROGRAMADA', effectiveCapacity, transportPerPersonCents: 0, conditions: 'Texto de demostración.' });

/** The seeded cancelled departure, one with seats, one with a single seat (AC-RP.3) and the one already proposed. */
export const RESCHEDULING_DEPARTURES: readonly Departure[] = [
  departure(5, 16, 'CANCELADA', 12), departure(6, 18, 'PROGRAMADA', 10), departure(7, 19, 'PROGRAMADA', 1), departure(8, 23, 'PROGRAMADA', 10),
];

const ORIGIN = { originDepartureId: 'demo-dep-5', originAt: '2026-10-12T19:30:00-05:00' };
const affected = (id: string, leadCustomerName: string, over: Partial<Reservation>): Reservation => ({
  id, leadCustomerName, tourName: ANDINA, departureId: 'demo-dep-5', departureDate: at(16), conditions: 'Texto de demostración.', people: 2,
  quote: { services: [{ name: 'Guianza (demo)', cents: 129_900_000 }], transportCents: 0, projectedCents: 129_900_000, discounts: [], discountCents: 0, finalCents: 129_900_000 },
  balanceCents: 99_900_000, validatedCents: 30_000_000, status: 'CONFIRMADA', financialStatus: 'PARCIAL', seatHeld: true, paymentType: 'PARTIAL',
  paymentMethod: 'BANK_TRANSFER', reschedulingEpisode: ORIGIN, ...over,
});

/** RES-1829: the demo customer's proposal waiting for an answer; RES-1828: hers, still to propose; RES-1827: another customer's, proof En validación. */
export const RESCHEDULING_SEEDS: readonly Reservation[] = [
  affected('RES-1829', 'Laura Gómez (demo)', { reschedulingPending: true,
    reschedulingEpisode: { ...ORIGIN, proposal: { departureId: 'demo-dep-8', sentAt: '2026-10-12T21:00:00-05:00', heldSeats: 2 } } }),
  affected('RES-1828', 'Laura Gómez (demo)', {}),
  affected('RES-1827', 'Andrés Pinto (demo)', { status: 'PENDIENTE_DE_PAGO', financialStatus: 'SIN_PAGO', validatedCents: 0, balanceCents: 129_900_000, seatHeld: false,
    payments: [{ id: 'RES-1827-P1', method: 'BANK_TRANSFER', amountCents: 30_000_000, proofName: 'soporte-demo.pdf', proofStatus: 'EN_VALIDACION', registeredBy: 'Cliente (demo)',
      presentedAt: '2026-10-13T08:00:00-05:00' }] }),
];

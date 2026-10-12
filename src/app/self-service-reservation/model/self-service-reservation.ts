/** What the customer chose in the public offer (HU-COM-006). DP-RS1: it travels in the URL, never in storage. */
export interface ReservationSelection {
  readonly departureId: string;
  readonly serviceIds: readonly string[];
  readonly people: number;
}

/** A method the tenant enabled. Choosing one registers no payment (AC-RS.4; payments are HU-COM-009). */
export interface PaymentMethod {
  readonly code: string;
  readonly label: string;
}

/** A reservation as the customer reads it. The values are the service's, in cents; the portal computes none. */
export interface CustomerReservation {
  readonly reservationId: string;
  readonly departureId: string;
  readonly serviceIds: readonly string[];
  readonly people: number;
  readonly projectedValueCents: number;
  readonly finalValueCents: number;
  readonly reservationStatus: string;
  readonly paymentStatus: string;
}

/** DP-RS2: who is looking, as far as this area cares. Anything not a final customer is OTHER (fails closed). */
export type CustomerStanding = 'FINAL_CUSTOMER' | 'NO_SESSION' | 'OTHER';

/** PROVISIONAL, demo only: the real role string is NO DEFINIDO until HU-SEC-002 (DP-RS2). */
export const FINAL_CUSTOMER_ROLE = 'FINAL_CUSTOMER';

export function standingOf(roles: readonly string[]): CustomerStanding {
  if (roles.includes(FINAL_CUSTOMER_ROLE)) return 'FINAL_CUSTOMER';
  return roles.length === 0 ? 'NO_SESSION' : 'OTHER';
}

/** Reads `?departure=..&services=a,b&people=n`; an incomplete or malformed selection is null, never guessed. */
export function selectionFromQuery(query: string): ReservationSelection | null {
  const params = new URLSearchParams(query);
  const departureId = params.get('departure')?.trim() ?? '';
  const serviceIds = (params.get('services') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const peopleText = params.get('people') ?? '';
  const people = /^\d+$/.test(peopleText) ? Number(peopleText) : 0;
  if (!departureId || serviceIds.length === 0 || !Number.isSafeInteger(people) || people < 1) return null;
  return { departureId, serviceIds, people };
}

export const SELF_SERVICE_TEXT = {
  nav: 'Reserve',
  confirmTitle: 'Confirm your reservation',
  panelTitle: 'My reservations',
  loading: 'Loading…',
  failed: 'We could not load this. Try again.',
  retry: 'Retry',
  noSelection: 'Choose services in the offer first.',
  noMethods: 'No payment method is enabled for this agency yet.',
  empty: 'You have no reservations yet.',
  departure: 'Departure',
  services: 'Services',
  people: 'People',
  method: 'Payment method',
  chooseMethod: 'Choose one',
  methodMissing: 'Choose a payment method.',
  confirm: 'Confirm reservation',
  signIn: 'Sign in or register to confirm. Your selection stays here.',
  noCapacity: 'There are not enough seats on this departure. Nothing was reserved.',
  refused: 'The reservation was not created. Try again.',
  created: 'Reservation created',
  notCustomer: 'Only a signed-in customer can confirm a reservation here.',
  panelNotCustomer: 'Sign in as a customer to see your reservations.',
  projected: 'Projected value',
  final: 'Final value',
  status: 'Status',
  payment: 'Payment',
  readOnly: 'Your reservations are shown as they are. Contact the agency for any question about them.',
} as const;

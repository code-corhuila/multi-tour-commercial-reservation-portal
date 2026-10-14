
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
  /** The code the customer reads, e.g. RES-1843. */
  readonly reservationId: string;
  readonly tourName: string;
  /** ISO date-time of the departure. */
  readonly departureAt: string;
  readonly departureId: string;
  readonly serviceIds: readonly string[];
  readonly people: number;
  readonly projectedValueCents: number;
  readonly finalValueCents: number;
  readonly reservationStatus: string;
  readonly paymentStatus: string;
  /** HU-COM-009: the method chosen on 21 and the state of the last proof, as codes; absent while none. */
  readonly paymentMethod?: string; readonly proofStatus?: string;
}

/** The summary of a selection before it is confirmed, in cents, from the calculation of HU-COM-007 (RN-RS4). */
export interface SelectionQuote {
  readonly tourName: string;
  readonly departureAt: string;
  readonly baseValueCents: number;
  readonly discountCents: number;
  readonly finalValueCents: number;
  /** HU-COM-004 T-V19-3 (DP-004-V19-3 PROPUESTO): the discount lines in application order, resolved by the port; absent when it sends none. */
  readonly discountLines?: readonly SelectionDiscountLine[];
}
export interface SelectionDiscountLine {
  readonly order: number; readonly name: string; readonly base: 'ORIGINAL_VALUE' | 'PREVIOUS_SUBTOTAL'; readonly amountCents: number; readonly subtotalCents: number;
}

/** `2026-09-18T06:30:00` to `18 sep 2026 · 06:30`; in shared/format.ts, since Mis pagos (HU-COM-014) writes it too. */
export { departureLine } from '../../shared/format';

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

/** The keys of the client areas of this story that a page opens with parameters (PortalNavigation.open). */
export const RESERVATION_FLOW = Object.freeze({ reserve: 'reserve', finish: 'finish' } as const);

/** DP-RS1 inside the shell: the parameters of the last opening, read as the URL query is. */
export function selectionFromParams(params: Readonly<Record<string, string>>): ReservationSelection | null {
  return selectionFromQuery(new URLSearchParams({ ...params }).toString());
}

/** Accent- and case-blind comparison of a departure's tour name with a catalog name (no tour id on a departure yet, G-OPS). */
export function sameTour(a: string, b: string): boolean {
  const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  return plain(a) === plain(b);
}

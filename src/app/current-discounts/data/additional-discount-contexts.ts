import { Observable } from 'rxjs';

/**
 * PROPUESTO (G-B): what panel 01 of admin-aplicar-descuento.html shows about the chosen reservation, and what the service decides about it.
 * Pillar 2: eligibility, the cap, the values and the state label arrive resolved; the view only formats.
 */
export type AdditionalDiscountContext = {
  readonly reservationId: string; readonly customerName: string; readonly serviceName: string;
  readonly currentValueCents: number; readonly generalDiscountCents: number; readonly paidCents: number;
  /** The cap of the tenant, in basis points of the current value. Only Pendiente de pago and Confirmada are eligible, and only once. */
  readonly capBasisPoints: number; readonly eligible: boolean; readonly stateLabel: string;
  /** The one discount the reservation already has (AC-CD.11); then it is not eligible. */
  readonly applied?: { readonly basisPoints: number; readonly appliedAt: string; readonly appliedBy: string };
};
/** What the reservation would be worth with the percentage typed, and what it would leave paid above that value. */
export type AdditionalDiscountPreview = { readonly newValueCents: number; readonly excessCents: number };

export abstract class AdditionalDiscountContexts {
  /** null when the reservation does not exist. */
  abstract of(reservationId: string): Observable<AdditionalDiscountContext | null>;
  abstract preview(reservationId: string, basisPoints: number): Observable<AdditionalDiscountPreview>;
}

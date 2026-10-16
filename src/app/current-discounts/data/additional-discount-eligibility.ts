/** The sub-screen admin-aplicar-descuento.html, opened with PortalNavigation.open(ADDITIONAL_DISCOUNT_AREA, { reservation }). */
export const ADDITIONAL_DISCOUNT_AREA = 'additional-discount';
/** The mode of Reservas (admin-reservas.html?mode=additional-discount), opened with PortalNavigation.open('reservations', { mode }). */
export const ADDITIONAL_DISCOUNT_MODE = 'additional-discount';

/**
 * Pillar 2: whether a reservation admits an additional discount (RN-CD4: only Pendiente de pago and Confirmada, and only one, AC-CD.11) is answered by the
 * port, never by a view. The demo one is in src/app/demo; the production one waits for the reservation contract (G-B).
 */
export abstract class AdditionalDiscountEligibility {
  abstract isEligible(reservation: { readonly status: string; readonly additionalDiscount?: unknown }): boolean;
}

import { Observable } from 'rxjs';

/** One own reservation as Mis pagos reads it: codes and cents resolved by the service (RN-MP1); names await the contract (G-B). */
export interface CustomerPaymentSummary {
  readonly reservationId: string; readonly tourName: string; readonly departureAt: string; readonly reservationStatus: string;
  readonly paymentType?: string; readonly paymentMethod?: string;
  /** RN-MP2: the state of the last proof, SIN_COMPROBANTE when there is none. */
  readonly proofStatus: string;
  /** null: no financial situation applies (a cancelled reservation without validated values). */
  readonly financialStatus: string | null;
  readonly validatedCents: number; readonly balanceCents: number;
  /** HU-COM-013 and HU-COM-016, read only: present only when the store holds them. */
  readonly cancellationCause?: string; readonly refundTreatment?: string;
}

/** DP-MP4: a notice the service already chose for Notificaciones. */
export interface PaymentNotice { readonly reservationId: string; readonly proofStatus: string }

/** DP-MP3: the reservation Continuar pago opens on screen 24, with what 24 expects. */
export interface ContinuePaymentTarget { readonly reservationId: string; readonly paymentType?: string; readonly amountCents: number }

/** Plan D-02: read only; the container and the service decide whose they are (RN-MP3). No writer exists in this story (RN-MP4). */
export abstract class MyPaymentsSource {
  abstract listMine(): Observable<readonly CustomerPaymentSummary[]>;
  abstract notices(): Observable<readonly PaymentNotice[]>;
  abstract continuePaymentTarget(): Observable<ContinuePaymentTarget | null>;
}

/** Screen 24 of HU-COM-009 (pago-transferencia.html), where Continuar pago lands (DP-MP5, PROPUESTO). */
export const TRANSFER_PAYMENT_AREA = 'transfer-payment';

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
  /** mis-pagos.html and mis-reservas.html (v1.9), each only when the service resolves it: the screens draw what is present and invent nothing. */
  readonly people?: number; readonly finalValueCents?: number; readonly refundedCents?: number;
  readonly creditBalanceCents?: number; readonly pendingTreatmentCents?: number;
  /** ISO date-time of the payment deadline (Pendiente de pago) or of the balance deadline (Confirmada), as the service keeps it. */
  readonly deadlineAt?: string;
  /** The HU-COM-018 mark: the economic deadlines are frozen while the customer answers a proposal. */
  readonly reschedulingPending?: boolean;
  readonly receipts?: readonly ProofReceipt[];
}

/** One proof as mis-pagos.html lists it. The portal holds no file to download, so no Descargar is offered (blocked by contract). */
export interface ProofReceipt { readonly support: string; readonly amountCents: number; readonly status: string; readonly rejectionReason?: string }

/** DP-MP4: a notice the service already chose for Notificaciones, with what the mockup's notification (app.js 4758) reads of the reservation. */
export type PaymentNotice = { readonly reservationId: string; readonly proofStatus: string } & Partial<Pick<CustomerPaymentSummary,
  'reservationStatus' | 'paymentType' | 'balanceCents' | 'deadlineAt' | 'reschedulingPending' | 'cancellationCause' | 'pendingTreatmentCents' | 'creditBalanceCents'>>;

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

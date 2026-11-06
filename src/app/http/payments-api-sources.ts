import { Observable, catchError, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { PaymentDeadline, PaymentDeadlineReader } from '../payments/data/payment-followup-ports';
import { PaymentsWriter, RegisterPaymentCommand } from '../payments/data/payments-writer';
import { PAYMENTS_TEXT, PAYMENT_REFUSAL_TEXT as R } from '../payments/payments-copy';
import { PAYMENT_METHOD_LABEL, PAYMENT_TYPE_LABEL } from '../reservations/reservations-copy';
import { Reservation, ReservationPayment } from '../reservations/model/reservation';
import { PaymentMethodsSource } from '../self-service-reservation/data/reservation-confirmation-ports';
import { PaymentMethod } from '../self-service-reservation/model/self-service-reservation';
import { ApiError, PortalApiClient } from '../shell-contract';
import { API_BASE, call, listAll, notInContract, reservationsPath } from './api-paths';
import { METHOD_IN, ReservationDto, ReservationsApiSource, SummaryDto, TYPE_IN, reservationFrom, rowsOf } from './reservations-api-sources';

export const paymentsPath = (reservationId: string): string => `${reservationsPath(reservationId)}/payments`;
export const paymentParametersPath = (): string => `${API_BASE}/payment-parameters`;

/** PaymentParameter of the contract (PROPOSED): only what the enabled lists need; the hours and the minimum are read by the parameters screen. */
export interface ParameterRowDto { readonly paymentType: string; readonly transferEnabled: boolean; readonly cashEnabled: boolean }

/**
 * The types and the methods the tenant enabled, read from the parameter rows (the quote of a reservation needs a reservation, which the
 * confirmation does not have yet). Empty while the tenant has no row (DP-11). TODO(DP-06): the bank data of the tenant are not served.
 */
export class PaymentMethodsApiSource extends PaymentMethodsSource {
  constructor(private readonly client: PortalApiClient) { super(); }
  private rows(): Observable<readonly ParameterRowDto[]> { return listAll<ParameterRowDto>(this.client, paymentParametersPath()); }
  override listTypes(): Observable<readonly PaymentMethod[]> {
    return this.rows().pipe(map((rows) => [...new Set(rows.map((r) => TYPE_IN[r.paymentType]).filter(Boolean))].map((code) => ({ code, label: PAYMENT_TYPE_LABEL[code] }))));
  }
  override listEnabled(): Observable<readonly PaymentMethod[]> {
    return this.rows().pipe(map((rows) => (['TRANSFER', 'CASH'] as const)
      .filter((wire) => rows.some((r) => (wire === 'TRANSFER' ? r.transferEnabled : r.cashEnabled)))
      .map((wire) => ({ code: METHOD_IN[wire], label: PAYMENT_METHOD_LABEL[METHOD_IN[wire]] }))));
  }
  override bankAccount() { return notInContract('Los datos bancarios del operador no los entrega el servicio.'); }
}

/** PaymentResponse of the contract (PROPOSED). Neither the file nor its name is returned; the users are identifiers, never names. */
export interface PaymentDto {
  readonly paymentId: string; readonly paymentMethod: string; readonly amountCents: number; readonly validationStatus?: string; readonly registeredBy: string; readonly registeredAt: string;
  readonly decidedBy?: string; readonly decidedAt?: string; readonly decisionReason?: string; readonly verifiedAmountCents?: number;
}
const PROOF: Record<string, ReservationPayment['proofStatus']> = { IN_VALIDATION: 'EN_VALIDACION', APPROVED: 'APROBADO', REJECTED: 'RECHAZADO' };

export function paymentFrom(dto: PaymentDto): ReservationPayment {
  const proofStatus = PROOF[dto.validationStatus ?? ''] ?? 'SIN_COMPROBANTE', decided = proofStatus === 'APROBADO' || proofStatus === 'RECHAZADO';
  return {
    id: dto.paymentId, method: METHOD_IN[dto.paymentMethod] ?? dto.paymentMethod, amountCents: dto.amountCents, proofName: dto.paymentMethod === 'TRANSFER' ? '' : null, proofStatus,
    registeredBy: dto.registeredBy, presentedAt: dto.registeredAt,
    ...(decided ? { review: { decision: proofStatus, verifiedAmountCents: dto.verifiedAmountCents ?? null, reason: dto.decisionReason ?? '', actorLabel: dto.decidedBy ?? '', decidedAt: dto.decidedAt ?? '' } } : {}),
  };
}

/** The attempts of a reservation: the service lists the newest first, the screens read the last one as the latest. */
export const paymentsOf = (client: PortalApiClient, reservationId: string): Observable<readonly ReservationPayment[]> =>
  listAll<PaymentDto>(client, paymentsPath(reservationId)).pipe(map((all) => all.map(paymentFrom).reverse()));

/** One reservation read again with its payments: what the writers answer after a change. */
export function readReservation(client: PortalApiClient, reservationId: string, row?: SummaryDto): Observable<Reservation> {
  return forkJoin({ dto: call<ReservationDto>(client, reservationsPath(reservationId)), rows: row ? of([row]) : rowsOf(client), payments: paymentsOf(client, reservationId) })
    .pipe(map(({ dto, rows, payments }) => ({ ...reservationFrom(dto, rows.find((r) => r.reservationId === reservationId)), payments })));
}

/** The reservations of HU-COM-007 with the payments of each one. DEBT: a third read per row; a list with both would remove it. */
export class ReservationsWithPaymentsApiSource extends ReservationsApiSource {
  override list(): Observable<readonly Reservation[]> {
    return rowsOf(this.client).pipe(switchMap((rows) => (rows.length ? forkJoin(rows.map((row) => readReservation(this.client, row.reservationId, row))) : of([] as Reservation[]))));
  }
}

/**
 * The service answers payment refusals in English with the envelope {status, code, message, details[{field, message}]}; every business rule shares
 * the code BUSINESS_RULE_VIOLATION, so the rule is told by its message (status 422) and a field error by its field (status 400). Anything unknown
 * is the generic Spanish text, never the English message.
 */
const BY_MESSAGE: Readonly<Record<string, string>> = {
  'there is no open cash session': R.noCashSession,
  'the departure has no availability': R.noSeats,
  'the departure has already started': PAYMENTS_TEXT.started,
  'the payment deadline has expired': R.deadlineExpired,
  'the departure was cancelled': R.departureCancelled,
  'the reservation does not accept payments in its current state': R.reservationClosed,
  'the reservation has no pending balance': PAYMENTS_TEXT.closedNote['settled'],
};
const BY_FIELD: Readonly<Record<string, string>> = {
  'amountCents|the first deposit cannot be below the minimum deposit': R.belowMinimum,
  'amountCents|the transfer cannot exceed the pending balance': R.aboveBalance,
  'amountCents|amountCents must be greater than zero': PAYMENTS_TEXT.amountRequired,
  'paymentMethod|the payment type or method is not enabled': R.methodNotEnabled,
};
const BY_STATUS: Readonly<Record<number, string>> = {
  403: PAYMENTS_TEXT.readOnly, 404: PAYMENTS_TEXT.notFound, 413: R.proofTooLarge, 415: PAYMENTS_TEXT.proofRule, 429: R.tooManyRequests, 503: R.unavailable,
};

function refusalText(error: ApiError): string {
  if (error.code === 'SEATS_UNAVAILABLE') return R.noSeats;
  const detail = error.details[0] as { field?: string; message?: string } | undefined;
  return (error.status === 422 ? BY_MESSAGE[error.message] : undefined)
    ?? (error.status === 400 && detail ? BY_FIELD[`${detail.field}|${detail.message}`] : undefined)
    ?? BY_STATUS[error.status] ?? PAYMENTS_TEXT.failed;
}

/** The same refusal with the Spanish text the pages show; the portal's own declared failures (NOT_IN_CONTRACT) are already Spanish. */
const paymentRefusal = (error: ApiError): ApiError => (error.code === 'NOT_IN_CONTRACT' ? error : { ...error, userMessage: refusalText(error) });

/**
 * POST /reservations/{id}/payments under the Idempotency-Key. A proof makes it a TRANSFER (multipart: the JSON part `payment` and the binary
 * part `proof`), none makes it CASH (JSON). The user and the tenant are the token's; the service judges the file and the 6 MB cap.
 * Cash is refused today with 422 (no verifiable cash session, debt DD-2); the saga register-payment (Cash first) is not in this contract.
 */
export class PaymentsApiWriter extends PaymentsWriter {
  constructor(private readonly client: PortalApiClient) { super(); }
  override register(command: RegisterPaymentCommand, idempotencyKey: string): Observable<Reservation> {
    const payment = { paymentMethod: command.proof ? 'TRANSFER' : 'CASH', amountCents: command.amountCents };
    let body: FormData | typeof payment = payment;
    if (command.proof) {
      body = new FormData();
      body.append('payment', new Blob([JSON.stringify(payment)], { type: 'application/json' }));
      body.append('proof', command.proof, command.proof.name);
    }
    return call<PaymentDto>(this.client, paymentsPath(command.reservationId), { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } })
      .pipe(catchError((error: ApiError) => throwError(() => paymentRefusal(error))), switchMap(() => readReservation(this.client, command.reservationId)));
  }
}

/** ReservationPaymentDeadline of the contract (PROPOSED): the service resolves the effective deadline (RN-RES-006); the portal adds nothing up. */
interface PaymentDeadlineDto { readonly effectiveDeadline: string; readonly departureStartsAt: string }

/**
 * The deadline line of screens 21 and 24 over GET /reservations/{id}/payment-deadline. The customer reads their own reservation; a reservation
 * without a deadline row, or of another customer or tenant, answers 404, which is "no line" (null) and not an error.
 */
export class PaymentDeadlineApiReader extends PaymentDeadlineReader {
  constructor(private readonly client: PortalApiClient) { super(); }
  override deadlineOf(reservationId: string): Observable<PaymentDeadline | null> {
    return call<PaymentDeadlineDto>(this.client, `${reservationsPath(reservationId)}/payment-deadline`).pipe(
      map((d): PaymentDeadline | null => ({ dueAt: d.effectiveDeadline, departureStartsAt: d.departureStartsAt })),
      catchError((error: { status?: number }) => (error.status === 404 ? of(null) : throwError(() => error))),
    );
  }
}
